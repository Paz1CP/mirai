import { randomUUID } from "node:crypto";
import { createEvent, type Event } from "@google/adk";
import type { Part } from "@google/genai";
import {
  campaignListQuerySchema,
  sendChatSchema,
  queuedChatSchema,
  type QueuedMessage,
  type ChatEvent,
  type ChatStream,
  type ChatTurn,
} from "@mirai/contracts";
import { Client } from "pg";
import { z } from "zod";
import {
  executionLockKey,
  type createResultsRepository,
} from "../applications/resultsRepository.js";
import { queuedUserContent, toChatEvent } from "./chatEvents.js";
import { prepareChatAttachments, type createQueuedAttachments } from "./chatAttachments.js";
import { ChatError, type ManagedChats } from "./managedChats.js";
import type { BrowserTools, createMiraiAgent } from "./miraiAgent.js";
import type { AgentScope } from "./miraiTools.js";
import { ChatTiming } from "./chatTiming.js";
import { ExtractionError } from "../profiles/extractProfile.js";
import { BillingError } from "../billing/walletRepository.js";
import type { createInferenceBilling } from "../billing/inferenceBilling.js";
import {
  interactionCursorSchema,
  renewalInstruction,
  type InteractionHandoff,
} from "./streamingGemini.js";

const resumedTurnSchema = z
  .object({
    commandId: z.uuid(),
    startedAt: z.number(),
    locale: z.enum(["en", "es"]),
    campaignId: z.uuid().optional(),
    runningCampaignId: z.uuid().optional(),
    runningCampaignIds: z.array(z.uuid()).optional(),
    taskId: z.uuid().optional(),
    taskMode: z.boolean().optional(),
    interaction: interactionCursorSchema.optional(),
  })
  .transform(({ runningCampaignId, runningCampaignIds, ...turn }) => ({
    ...turn,
    runningCampaignIds: runningCampaignIds ?? (runningCampaignId ? [runningCampaignId] : []),
  }));
type ResumedTurn = z.infer<typeof resumedTurnSchema>;
const taskContinuationSchema = z.object({
  id: z.uuid(),
  campaignId: z.uuid().optional(),
  runningCampaignIds: z.array(z.uuid()),
});
type TaskContinuation = z.infer<typeof taskContinuationSchema>;
const pendingTaskKey = "miraiPendingTask";
const awaitingTaskInput = "Waiting for user input.";

const queuedCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), id: z.uuid() }),
  z.object({ kind: z.literal("resume"), campaignId: z.uuid(), locale: z.enum(["en", "es"]) }),
  z.object({ kind: z.literal("compact"), locale: z.enum(["en", "es"]) }),
]);

const checkpointSchema = z.object({
  successor: z.uuid(),
  turn: resumedTurnSchema.optional(),
  continuingTask: taskContinuationSchema.optional(),
  queue: z.array(queuedCommandSchema),
});

type Command =
  | { kind: "message"; message: QueuedMessage; timing?: ChatTiming }
  | { kind: "compact"; locale: "es" | "en" }
  | { kind: "resume"; campaignId: string; locale: "es" | "en" }
  | { kind: "renewal"; turn: ResumedTurn; message?: QueuedMessage };
export type ChatOwner = {
  accountId: string;
  signal: AbortSignal;
  send: (chatId: string, event: ChatStream) => void;
  browser: (
    chatId: string,
    locale: "es" | "en",
    signal: AbortSignal,
  ) => Promise<BrowserTools | undefined>;
};

type Run = {
  accountId: string;
  chatId: string;
  owner: ChatOwner;
  finished?: Promise<void>;
  abort: AbortController;
  activeTurn?: AbortController;
  pause?: AbortController;
  successor?: string;
  suspendedTurn?: ResumedTurn;
  suspendedMessage?: QueuedMessage;
  continuingTask?: TaskContinuation;
  turn?: ChatTurn;
  partials: Map<string, ChatEvent>;
  timing?: ChatTiming;
  queue: Command[];
  accepted: Promise<unknown>;
  session?: Awaited<ReturnType<ManagedChats["owned"]>>;
  connected: Promise<Client>;
  retired: boolean;
  reason?: string;
};
const executionDisconnected = "The execution connection was interrupted.";
const insufficientCredits = "INSUFFICIENT_CREDITS";

export function createChatExecution(
  chats: ManagedChats,
  agent: ReturnType<typeof createMiraiAgent>,
  results: Pick<
    ReturnType<typeof createResultsRepository>,
    | "listCampaigns"
    | "campaignForChat"
    | "transitionCampaign"
    | "campaignBudget"
    | "executionActive"
  >,
  attachments?: ReturnType<typeof createQueuedAttachments>,
  billing?: Pick<ReturnType<typeof createInferenceBilling>, "ensureCredit">,
) {
  const active = new Map<string, Run>();
  const emit = (run: Run, event: ChatStream) => {
    if (event.type === "event") {
      const { event: content, partial } = event;
      if (content.activityId) run.partials.delete(content.activityId);
      if (partial) {
        const old = run.partials.get(content.id)?.parts[0];
        const next = content.parts[0];
        run.partials.set(
          content.id,
          old && next && "text" in old && "text" in next && old.type === next.type
            ? { ...content, parts: [{ ...next, text: old.text + next.text }] }
            : content,
        );
      } else run.partials.delete(content.id);
    }
    run.owner.send(run.chatId, event);
    if (event.type === "event" && run.timing?.turnId === event.event.turnId)
      run.timing?.mark("firstContentSocketWrite");
  };
  function cancel(run: Run, reason: string, error: string | null = null) {
    if (run.abort.signal.aborted) return;
    run.successor = undefined;
    const failure = error === insufficientCredits ? new BillingError(error, 402) : undefined;
    if (failure) run.reason = insufficientCredits;
    else run.reason ??= reason;
    run.abort.abort(failure);
    run.activeTurn?.abort(failure);
    emit(run, { type: "status", working: false, error });
  }
  async function latest(accountId: string, chatId: string) {
    return (
      (
        await results.listCampaigns(
          accountId,
          campaignListQuerySchema.parse({
            pageSize: 1,
            chatSessionId: chatId,
          }),
        )
      ).items[0] ?? null
    );
  }
  async function acquire(run: Run) {
    const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT;
    if (!connectionString) throw new ChatError("EXECUTION_NOT_CONFIGURED", 503);
    const connection = new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
    });
    function onUnexpectedDisconnect() {
      if (!run.retired) cancel(run, executionDisconnected, "CHAT_INTERRUPTED");
    }
    connection.on("error", onUnexpectedDisconnect);
    connection.on("end", onUnexpectedDisconnect);
    try {
      await connection.connect();
      const { rows } = await connection.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
        [executionLockKey(run.accountId, run.chatId)],
      );
      if (!rows[0]?.locked) throw new ChatError("EXECUTION_ALREADY_ACTIVE", 409);
      return connection;
    } catch (error) {
      connection.off("end", onUnexpectedDisconnect);
      await connection.end().catch(() => {});
      throw error;
    }
  }
  function reserve(owner: ChatOwner, chatId: string) {
    owner.signal.throwIfAborted();
    const { accountId } = owner;
    const key = executionLockKey(accountId, chatId);
    const existing = active.get(key);
    if (existing) {
      if (existing.owner === owner && existing.abort.signal.reason instanceof BillingError)
        throw existing.abort.signal.reason;
      if (existing.owner !== owner || existing.abort.signal.aborted || existing.retired)
        throw new ChatError("EXECUTION_ALREADY_ACTIVE", 409);
      return existing;
    }
    const run: Run = {
      accountId,
      chatId,
      owner,
      abort: new AbortController(),
      queue: [],
      partials: new Map(),
      accepted: Promise.resolve(),
      retired: false,
      connected: Promise.resolve().then(() => acquire(run)),
    };
    active.set(key, run);
    return run;
  }
  async function enqueue(owner: ChatOwner, chatId: string, command: Command) {
    const { accountId } = owner;
    const previous = active.get(executionLockKey(accountId, chatId));
    if (previous?.owner === owner && previous.retired) await previous.finished;
    const run = reserve(owner, chatId);
    const accepted = run.accepted
      .catch(() => {})
      .then(async () => {
        run.abort.signal.throwIfAborted();
        if (command.kind === "message") {
          const { id } = command.message;
          if (
            run.turn?.id !== id &&
            !run.queue.some((pending) => pending.kind === "message" && pending.message.id === id)
          )
            run.queue.push(command);
          return;
        }
        if (command.kind === "compact") await billing?.ensureCredit(accountId);
        await run.connected;
        run.abort.signal.throwIfAborted();
        if (command.kind === "resume") {
          const campaign = await results.campaignForChat(accountId, chatId, command.campaignId);
          if (!campaign || campaign.status !== "stopped")
            throw new ChatError("NO_STOPPED_CAMPAIGN", 409);
        }
        run.abort.signal.throwIfAborted();
        run.queue.push(command);
      });
    run.accepted = accepted;
    run.finished ??= Promise.resolve().then(() => drain(run));
    await accepted;
  }
  async function drain(run: Run) {
    let error: string | null = null;
    const { accountId, chatId } = run;
    try {
      let restart = Boolean(run.continuingTask);
      while (!run.abort.signal.aborted && !run.successor) {
        const accepting = run.accepted;
        await accepting.catch(() => {});
        if (accepting !== run.accepted) continue;
        if (run.successor) break;
        run.abort.signal.throwIfAborted();
        const command = run.queue.shift();
        if (!command) {
          run.retired = true;
          break;
        }
        error = null;
        const resumed = command.kind === "renewal" ? command.turn : undefined;
        const initialMessage =
          command.kind === "message" || command.kind === "renewal" ? command.message : undefined;
        const activityTurn: ChatTurn = {
          id: resumed?.commandId ?? initialMessage?.id ?? randomUUID(),
          startedAt: resumed?.startedAt ?? Date.now(),
          phase: "session",
        };
        const timing =
          (command.kind === "message" && command.timing) || new ChatTiming(activityTurn.id);
        timing.mark("executionStarted");
        run.turn = activityTurn;
        timing.progress("session");
        emit(run, { type: "status", working: true, error: null, turn: activityTurn });

        try {
          await run.connected;
          if (!run.session && command.kind !== "compact")
            run.session = await chats.executionSession(accountId, chatId, run.owner.signal);
          if (run.session) timing.mark("sessionReady");
          if (run.successor) {
            if (command.kind === "renewal") run.suspendedMessage = initialMessage;
            else run.queue.unshift(command);
            break;
          }
          run.abort.signal.throwIfAborted();
        } catch (error) {
          timing.finish(error instanceof ChatError ? error.code : "interrupted");
          throw error;
        }
        if (
          command.kind === "message" &&
          run.session?.events.some(
            (event) =>
              event.author === "user" &&
              event.customMetadata?.miraiCommandId === command.message.id,
          )
        )
          continue;
        let message = initialMessage;
        const originalPending =
          resumed &&
          message &&
          !resumed.interaction &&
          !run.session?.events.some(
            ({ author, customMetadata }) =>
              author === "user" && customMetadata?.miraiCommandId === initialMessage?.id,
          );
        let inputFiles: Part[] = [];
        if (message && (!resumed || originalPending)) {
          try {
            if (message.attachments?.length) {
              const raw = sendChatSchema.safeParse(message);
              inputFiles = await prepareChatAttachments(
                raw.success
                  ? raw.data.attachments
                  : await attachments?.restore(accountId, chatId, message),
              );
              run.abort.signal.throwIfAborted();
              if (attachments && raw.success)
                message = await attachments.save(accountId, chatId, raw.data);
            }
            run.abort.signal.throwIfAborted();
            if (run.successor && command.kind === "message") {
              run.queue.unshift({ ...command, message });
              break;
            }
            emit(run, {
              type: "event",
              partial: false,
              event: {
                id: message.id,
                at: new Date().toISOString(),
                role: "user",
                ...queuedUserContent(message),
              },
            });
          } catch (failure) {
            run.abort.signal.throwIfAborted();
            if (!(failure instanceof ChatError || failure instanceof ExtractionError))
              throw failure;
            timing.finish(failure.code);
            error = failure.code;
            if (resumed) throw new ChatError(error, 400);
            if (run.queue.length) emit(run, { type: "status", working: false, error });
            continue;
          }
        }
        if (resumed) {
          if (run.successor) {
            run.suspendedMessage = message;
            break;
          }
          run.suspendedTurn = undefined;
          run.suspendedMessage = undefined;
        }
        const waitingTask =
          command.kind === "message" || command.kind === "resume"
            ? taskContinuationSchema.safeParse(run.session?.state?.[pendingTaskKey]).data
            : undefined;
        const continuingTask = command.kind === "message" ? run.continuingTask : undefined;
        if (continuingTask) run.continuingTask = undefined;
        const interruptedTask = continuingTask ?? waitingTask;
        const task =
          command.kind === "resume" && interruptedTask?.campaignId !== command.campaignId
            ? undefined
            : interruptedTask;
        const scope: AgentScope = {
          accountId,
          chatId,
          commandId: activityTurn.id,
          campaignId:
            command.kind === "resume"
              ? command.campaignId
              : (resumed?.campaignId ?? task?.campaignId),
          runningCampaignIds: new Set(
            resumed?.runningCampaignIds ?? continuingTask?.runningCampaignIds,
          ),
          taskId: resumed?.taskId ?? task?.id,
          taskMode:
            command.kind === "resume" ||
            Boolean(task) ||
            (resumed?.taskMode ?? Boolean(resumed?.runningCampaignIds.length)),
        };
        if (command.kind === "compact") {
          if (await agent.compact(scope, run.abort.signal)) {
            run.session = undefined;
            chats.forgetExecution(accountId, chatId);
            emit(run, {
              type: "context",
              context: { used: null, capacity: await chats.capacity() },
            });
            restart = true;
          }
          continue;
        }
        const turn = new AbortController();
        run.activeTurn = turn;
        const pause = new AbortController();
        run.pause = pause;
        const handoff: InteractionHandoff = {
          pause: pause.signal,
          restoring: resumed?.interaction,
          notePending: Boolean(resumed?.interaction),
        };
        run.timing = timing;
        timing.observe((phase) => {
          if (run.abort.signal.aborted) return;
          activityTurn.phase = phase;
          emit(run, { type: "status", working: true, error: null, turn: activityTurn });
        });
        const signal = AbortSignal.any([run.abort.signal, turn.signal]);
        const locale =
          command.kind === "renewal"
            ? command.turn.locale
            : command.kind === "message"
              ? command.message.locale
              : command.locale;
        let browser: BrowserTools | undefined;
        const loadBrowser = async () => {
          signal.throwIfAborted();
          if (browser?.isConnected()) return browser;
          await browser?.close();
          browser = await run.owner.browser(chatId, locale, signal);
          signal.throwIfAborted();
          return browser;
        };
        let redirected = false;
        const onBoundary = () => {
          if (run.successor) throw pause.signal.reason;
          if (run.queue.some((entry) => entry.kind === "message")) {
            redirected = true;
            turn.abort();
          }
          signal.throwIfAborted();
        };
        let outcome = "completed";
        let finalText = false;
        try {
          if (command.kind === "resume") {
            const resumed = await results.transitionCampaign(
              accountId,
              command.campaignId,
              "stopped",
              "running",
              null,
            );
            if (!resumed) throw new ChatError("NO_STOPPED_CAMPAIGN", 409);
            scope.runningCampaignIds.add(resumed.id);
          }
          if (waitingTask && task === waitingTask) {
            for (const id of waitingTask.runningCampaignIds) {
              if (scope.runningCampaignIds.has(id)) continue;
              const campaign = await results.campaignForChat(accountId, chatId, id);
              if (campaign?.status === "running") scope.runningCampaignIds.add(id);
              else if (
                campaign?.status === "stopped" &&
                campaign.statusReason === awaitingTaskInput
              ) {
                const resumed = await results.transitionCampaign(
                  accountId,
                  id,
                  "stopped",
                  "running",
                  null,
                );
                if (resumed) scope.runningCampaignIds.add(id);
              }
            }
          }
          if (waitingTask) await savePendingTask(run, null);
          const storedEvents = command.kind === "resume" ? (run.session?.events ?? []) : [];
          const consumed = new Set(
            storedEvents.flatMap(({ author, customMetadata }) => [
              author === "user" ? customMetadata?.miraiCommandId : undefined,
              customMetadata?.miraiReferencedQueued,
            ]),
          );
          const saved = [...storedEvents]
            .reverse()
            .find(
              ({ customMetadata }) =>
                customMetadata?.miraiQueued &&
                customMetadata.miraiCommandId !== message?.id &&
                !consumed.has(customMetadata.miraiCommandId),
            );
          const pending = queuedChatSchema.safeParse(saved?.customMetadata?.miraiQueued).data;
          const input =
            (resumed && !originalPending ? renewalInstruction : message?.text) ??
            "Resume the selected campaign. Inspect uncertain application results before deciding what to do next.";
          let previousFiles: Part[] = [];
          if (pending && attachments) {
            try {
              previousFiles = await prepareChatAttachments(
                await attachments.restore(accountId, chatId, pending),
              );
              scope.referencedQueued = pending.id;
            } catch {
              previousFiles = [
                { text: "The retained files from the earlier message could not be loaded." },
              ];
            }
          }
          await agent.run(
            scope,
            pending
              ? `Earlier unsent message, for context only. Do not repeat external actions.\n${pending.text}\n\nCurrent request:\n${input}`
              : input,
            locale,
            loadBrowser,
            signal,
            onBoundary,
            restart,
            (event: Event) => {
              if (signal.aborted) return;
              if (
                message &&
                event.author === "user" &&
                event.customMetadata?.miraiCommandId === message.id
              )
                return;
              const visible = toChatEvent(event);
              if (visible) {
                if (visible.role === "assistant" && !event.partial) {
                  for (const part of visible.parts) {
                    if (part.type === "tool") finalText = false;
                    else if (part.type === "text" && part.text.trim()) finalText = true;
                  }
                }
                emit(run, {
                  type: "event",
                  event: { ...visible, turnId: activityTurn.id },
                  partial: Boolean(event.partial),
                });
              }
              const used = event.usageMetadata?.promptTokenCount;
              if (used !== undefined)
                void chats.capacity(message?.generation?.model).then((capacity) => {
                  if (!signal.aborted) emit(run, { type: "context", context: { used, capacity } });
                });
            },
            command.kind === "resume" || Boolean(resumed && !originalPending),
            [...inputFiles, ...previousFiles],
            message?.generation,
            {
              turn: activityTurn,
              handoff,
              session: run.session,
              attachments: message ? queuedUserContent(message).attachments : undefined,
              timing,
              onSummary: (id, text) => {
                if (signal.aborted) return;
                const event: ChatEvent = {
                  id,
                  turnId: activityTurn.id,
                  at: new Date().toISOString(),
                  role: "assistant",
                  parts: [{ type: "reasoning", text }],
                };
                emit(run, { type: "event", event, partial: true });
              },
            },
          );
          restart = turn.signal.aborted;
          if (signal.aborted)
            outcome = run.reason === insufficientCredits ? run.reason : "interrupted";
          else if (scope.taskPaused) outcome = "paused";
          else if (scope.taskMode && !scope.taskFinished) outcome = "interrupted";
        } catch (failure) {
          outcome =
            failure instanceof ChatError || failure instanceof BillingError
              ? failure.code
              : "interrupted";
          if (failure instanceof BillingError) run.reason ??= failure.code;
          if (!run.successor && !redirected) run.session = undefined;
          if (!turn.signal.aborted && !run.abort.signal.aborted && !run.successor) throw failure;
          restart = true;
        } finally {
          timing.finish(outcome);
          const taskEnded = scope.taskFinished || scope.taskPaused;
          const continuation =
            scope.taskMode && !scope.taskFinished && !run.abort.signal.aborted
              ? {
                  id: scope.taskId ?? scope.commandId,
                  campaignId: scope.campaignId,
                  runningCampaignIds: [...scope.runningCampaignIds],
                }
              : undefined;
          const keepForFollowUp = continuation && redirected && !scope.taskPaused;
          if (keepForFollowUp) run.continuingTask = continuation;
          if (
            !taskEnded &&
            !keepForFollowUp &&
            (run.successor || (pause.signal.aborted && run.reason === insufficientCredits)) &&
            (handoff.current ||
              handoff.restoring ||
              scope.runningCampaignIds.size ||
              outcome !== "completed")
          ) {
            run.suspendedMessage = message;
            run.suspendedTurn = {
              commandId: scope.commandId,
              startedAt: activityTurn.startedAt,
              locale,
              campaignId: scope.campaignId,
              runningCampaignIds: [...scope.runningCampaignIds],
              taskId: scope.taskMode ? (scope.taskId ?? scope.commandId) : undefined,
              taskMode: scope.taskMode,
              interaction: handoff.current ?? handoff.restoring,
            };
          }
          run.activeTurn = undefined;
          run.pause = undefined;
          run.turn = undefined;
          run.partials.clear();
          run.timing = undefined;
          try {
            try {
              if (continuation && scope.taskPaused) await savePendingTask(run, continuation);
            } finally {
              await browser?.close();
            }
          } finally {
            if ((!run.successor || taskEnded) && !run.suspendedTurn && !keepForFollowUp) {
              await finalizeCampaigns(scope.runningCampaignIds, async (id) => {
                const budget =
                  run.reason === insufficientCredits
                    ? undefined
                    : await results.campaignBudget(accountId, id);
                const reached = budget?.reached && run.reason !== insufficientCredits;
                await results.transitionCampaign(
                  accountId,
                  id,
                  "running",
                  reached ? "completed" : "stopped",
                  reached
                    ? "Application limit reached."
                    : (run.reason ??
                        (scope.taskPaused
                          ? awaitingTaskInput
                          : "Execution ended before the mandate was completed.")),
                );
              });
            }
          }
        }
        // A renewal closes the old socket only after this turn drains.
        if (
          outcome === "completed" &&
          finalText &&
          !signal.aborted &&
          !run.suspendedTurn &&
          (!run.owner.signal.aborted || run.successor)
        )
          emit(run, { type: "completed", turnId: activityTurn.id });
      }
    } catch (failure) {
      if (!run.abort.signal.aborted) {
        error =
          failure instanceof ChatError || failure instanceof BillingError
            ? failure.message
            : "AGENT_EXECUTION_FAILED";
        console.error({
          event: "agent_execution_failed",
          code: failure instanceof ChatError ? failure.code : error,
          errorType: failure instanceof Error ? failure.name : "Unknown",
          providerStatus:
            failure instanceof Error && "status" in failure && typeof failure.status === "number"
              ? failure.status
              : undefined,
        });
      }
    } finally {
      run.retired = true;
      await run.accepted.catch(() => {});
      const successor = run.successor;
      try {
        if (successor && (run.suspendedTurn || run.continuingTask || run.queue.length)) {
          await run.connected;
          run.session ??= await chats.executionSession(accountId, chatId, run.owner.signal);
          const messages = run.queue.flatMap((command) =>
            command.kind === "message" ? [command.message] : [],
          );
          if (run.suspendedMessage) messages.unshift(run.suspendedMessage);
          for (const message of messages) {
            if (
              run.session.events.some(
                (event) =>
                  event.author === "mirai_queue" &&
                  event.customMetadata?.miraiCommandId === message.id,
              )
            )
              continue;
            const raw = sendChatSchema.safeParse(message);
            let saved = message;
            if (attachments && raw.success && raw.data.attachments?.length) {
              await prepareChatAttachments(raw.data.attachments);
              saved = await attachments.save(accountId, chatId, raw.data);
            }
            await chats.service.appendEvent({
              session: run.session,
              event: createEvent({
                author: "mirai_queue",
                customMetadata: { miraiCommandId: saved.id, miraiQueued: saved },
              }),
            });
          }
          await chats.service.appendEvent({
            session: run.session,
            event: createEvent({
              author: "mirai_control",
              customMetadata: {
                miraiWorkspaceHandoff: {
                  successor,
                  turn: run.suspendedTurn,
                  continuingTask: run.continuingTask,
                  queue: run.queue.flatMap((command): z.infer<typeof queuedCommandSchema>[] =>
                    command.kind === "renewal"
                      ? []
                      : [
                          command.kind === "message"
                            ? { kind: "message", id: command.message.id }
                            : command,
                        ],
                  ),
                },
              },
            }),
          });
        }
        if (!run.successor && run.suspendedTurn)
          await discardTurn(
            accountId,
            run.suspendedTurn,
            run.reason === insufficientCredits ? run.reason : undefined,
          );
        if (!run.successor && run.continuingTask)
          await stopCampaigns(
            accountId,
            run.continuingTask.runningCampaignIds,
            run.reason ?? executionDisconnected,
          );
        if (!error && !successor && !run.owner.signal.aborted && run.session)
          chats.rememberExecution(run.session, run.owner.signal);
      } catch (failure) {
        error = "CHAT_INTERRUPTED";
        if (run.suspendedTurn)
          await stopCampaigns(
            accountId,
            run.suspendedTurn.runningCampaignIds,
            "Unable to save workspace handoff.",
          ).catch(() => {});
        if (run.continuingTask)
          await stopCampaigns(
            accountId,
            run.continuingTask.runningCampaignIds,
            "Unable to save workspace handoff.",
          ).catch(() => {});
        console.error({
          event: "workspace_handoff_failed",
          errorType: failure instanceof Error ? failure.name : "Unknown",
        });
      }
      const connection = await run.connected.catch(() => undefined);
      await connection?.end().catch(() => {});
      const key = executionLockKey(accountId, chatId);
      if (active.get(key) === run) active.delete(key);
      if ((!run.successor || error) && !run.abort.signal.aborted)
        emit(run, {
          type: "status",
          working: false,
          error,
        });
    }
  }
  async function savePendingTask(run: Run, task: TaskContinuation | null) {
    if (!run.session) throw new ChatError("CHAT_PERSISTENCE_FAILED", 503);
    await chats.service.appendEvent({
      session: run.session,
      event: createEvent({
        author: "mirai_control",
        actions: { stateDelta: { [pendingTaskKey]: task } },
      }),
    });
  }
  function handoffFor(session: NonNullable<Run["session"]>, instanceId: string) {
    for (let index = session.events.length - 1; index >= 0; index--) {
      const event = session.events[index];
      const checkpoint = checkpointSchema.safeParse(
        event?.customMetadata?.miraiWorkspaceHandoff,
      ).data;
      if (checkpoint?.successor === instanceId) return checkpoint;
    }
  }

  async function discardRenewal(
    owner: ChatOwner,
    chatId: string,
    instanceId: string,
    reason?: typeof insufficientCredits,
  ) {
    const session = await chats.executionSession(owner.accountId, chatId);
    const checkpoint = handoffFor(session, instanceId);
    const turn = checkpoint?.turn;
    if (turn) await discardTurn(owner.accountId, turn, reason);
    if (checkpoint?.continuingTask)
      await stopCampaigns(
        owner.accountId,
        checkpoint.continuingTask.runningCampaignIds,
        reason ?? "Workspace closed or stopped.",
      );
    owner.send(chatId, { type: "status", working: false, error: reason ?? null });
  }

  async function discardTurn(
    accountId: string,
    turn: ResumedTurn,
    reason = "Workspace closed or stopped.",
  ) {
    await Promise.all([
      turn.interaction && agent.cancelInteraction(turn.interaction.id).catch(() => {}),
      stopCampaigns(accountId, turn.runningCampaignIds, reason),
    ]);
  }

  function stopCampaigns(accountId: string, ids: string[], reason: string) {
    return finalizeCampaigns(ids, (id) =>
      results.transitionCampaign(accountId, id, "running", "stopped", reason),
    );
  }

  async function finalizeCampaigns(
    ids: Iterable<string>,
    finish: (id: string) => Promise<unknown>,
  ) {
    const outcomes = await Promise.allSettled(Array.from(ids, finish));
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") throw outcome.reason;
    }
  }

  async function resumeRenewal(owner: ChatOwner, chatId: string, instanceId: string) {
    if (owner.signal.aborted) return discardRenewal(owner, chatId, instanceId);
    const run = reserve(owner, chatId);
    run.accepted = (async () => {
      const session = await chats.executionSession(owner.accountId, chatId);
      const checkpoint = handoffFor(session, instanceId);
      if (!checkpoint) return;
      run.suspendedTurn = checkpoint.turn;
      run.continuingTask = checkpoint.continuingTask;
      if (run.abort.signal.aborted) return;
      try {
        await billing?.ensureCredit(owner.accountId);
      } catch (error) {
        if (error instanceof BillingError && error.code === insufficientCredits)
          cancel(run, insufficientCredits, insufficientCredits);
        else throw error;
      }
      if (run.abort.signal.aborted) return;
      owner.signal.throwIfAborted();
      await run.connected;
      if (run.abort.signal.aborted) return;
      const commands = new Map<string, QueuedMessage>();
      for (const event of session.events) {
        const parsed = queuedChatSchema.safeParse(event.customMetadata?.miraiQueued);
        if (parsed.success) commands.set(parsed.data.id, parsed.data);
      }
      run.session = session;
      if (checkpoint.turn)
        run.queue.push({
          kind: "renewal",
          turn: checkpoint.turn,
          message: commands.get(checkpoint.turn.commandId),
        });
      for (const command of checkpoint.queue) {
        if (command.kind !== "message") run.queue.push(command);
        else {
          const message = commands.get(command.id);
          if (message) run.queue.push({ kind: "message", message });
        }
      }
    })();
    run.finished = new Promise<void>((start) => setImmediate(start)).then(() => drain(run));
    await run.accepted;
  }
  const ownedRuns = (owner: ChatOwner) => [...active.values()].filter((run) => run.owner === owner);
  return {
    enqueue,
    resumeRenewal,
    discardRenewal,
    async stopAccountForInsufficientCredits(accountId: string) {
      if (!billing) return false;
      try {
        await billing.ensureCredit(accountId);
        return false;
      } catch (error) {
        if (!(error instanceof BillingError) || error.code !== insufficientCredits) throw error;
      }
      for (const run of active.values()) {
        if (run.accountId === accountId) cancel(run, insufficientCredits, insufficientCredits);
      }
      return true;
    },
    runningChats(owner: ChatOwner) {
      return ownedRuns(owner)
        .filter((run) => !run.retired && !run.abort.signal.aborted)
        .map(({ chatId, turn, partials }) => ({
          chatId,
          turn,
          partials: partials.size ? [...partials.values()] : undefined,
        }));
    },
    async suspend(owner: ChatOwner, successor: string) {
      await Promise.all(
        ownedRuns(owner).map((run) => {
          if (run.retired || run.abort.signal.aborted) return run.finished;
          run.successor = successor;
          run.pause?.abort(new Error("WORKSPACE_RENEWING"));
          return run.finished;
        }),
      );
    },
    async status(accountId: string, chatId: string) {
      const capacity = chats.capacity();
      const campaign = await latest(accountId, chatId);
      return {
        campaign,
        context: { used: null, capacity: await capacity },
      };
    },
    stop(owner: ChatOwner, chatId: string) {
      const run = active.get(executionLockKey(owner.accountId, chatId));
      if (run?.owner !== owner) return;
      cancel(run, "Stopped by the user.");
      return run.finished;
    },
    async disconnect(owner: ChatOwner) {
      await Promise.all(
        ownedRuns(owner).map((run) => {
          cancel(run, "The Mirai connection closed.", "CHAT_INTERRUPTED");
          return run.finished;
        }),
      );
    },
    async isWorking(accountId: string, chatId: string) {
      if (active.has(executionLockKey(accountId, chatId))) return true;
      return results.executionActive(accountId, chatId);
    },
  };
}
