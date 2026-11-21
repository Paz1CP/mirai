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
import { toChatEvent } from "./chatEvents.js";
import { prepareChatAttachments, type createQueuedAttachments } from "./chatAttachments.js";
import { ChatError, type ManagedChats } from "./managedChats.js";
import type { BrowserTools, createMiraiAgent } from "./miraiAgent.js";
import type { AgentScope } from "./miraiTools.js";
import { ChatTiming } from "./chatTiming.js";
import { BillingError } from "../billing/walletRepository.js";
import type { createInferenceBilling } from "../billing/inferenceBilling.js";
import {
  interactionCursorSchema,
  renewalInstruction,
  type InteractionHandoff,
} from "./streamingGemini.js";

const resumedTurnSchema = z.object({
  commandId: z.uuid(),
  startedAt: z.number(),
  locale: z.enum(["en", "es"]),
  campaignId: z.uuid().optional(),
  runningCampaignId: z.uuid().optional(),
  interaction: interactionCursorSchema.optional(),
});
type ResumedTurn = z.infer<typeof resumedTurnSchema>;

const queuedCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), id: z.uuid() }),
  z.object({ kind: z.literal("resume"), campaignId: z.uuid(), locale: z.enum(["en", "es"]) }),
  z.object({ kind: z.literal("compact"), locale: z.enum(["en", "es"]) }),
]);

const checkpointSchema = z.object({
  successor: z.uuid(),
  turn: resumedTurnSchema.optional(),
  queue: z.array(queuedCommandSchema),
});

type Command =
  | { kind: "message"; message: QueuedMessage; parts?: Part[]; timing?: ChatTiming }
  | { kind: "compact"; locale: "es" | "en" }
  | { kind: "resume"; campaignId: string; locale: "es" | "en" }
  | { kind: "renewal"; turn: ResumedTurn; message?: QueuedMessage };
export type ChatOwner = {
  accountId: string;
  signal: AbortSignal;
  send: (chatId: string, event: ChatStream) => void;
  browser: (locale: "es" | "en", signal: AbortSignal) => Promise<BrowserTools | undefined>;
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
  turn?: ChatTurn;
  timing?: ChatTiming;
  queue: Command[];
  accepted: Promise<unknown>;
  session?: Awaited<ReturnType<ManagedChats["owned"]>>;
  connected: Promise<Client>;
  retired: boolean;
  reason?: string;
};
const executionDisconnected = "The execution connection was interrupted.";

export function createChatExecution(
  chats: ManagedChats,
  agent: ReturnType<typeof createMiraiAgent>,
  results: ReturnType<typeof createResultsRepository>,
  attachments?: ReturnType<typeof createQueuedAttachments>,
  billing?: Pick<ReturnType<typeof createInferenceBilling>, "ensureCredit">,
) {
  const active = new Map<string, Run>();
  const emit = (run: Run, event: ChatStream) => {
    run.owner.send(run.chatId, event);
    if (event.type === "event" && run.timing?.turnId === event.event.turnId)
      run.timing?.mark("firstContentSocketWrite");
  };
  function cancel(run: Run, reason: string, error: string | null = null) {
    if (run.abort.signal.aborted) return;
    run.successor = undefined;
    run.reason ??= reason;
    run.abort.abort();
    run.activeTurn?.abort();
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
        [executionLockKey(run.accountId)],
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
    const existing = active.get(accountId);
    if (existing) {
      if (
        existing.chatId !== chatId ||
        existing.owner !== owner ||
        existing.abort.signal.aborted ||
        existing.retired
      )
        throw new ChatError("EXECUTION_ALREADY_ACTIVE", 409);
      return existing;
    }
    const run: Run = {
      accountId,
      chatId,
      owner,
      abort: new AbortController(),
      queue: [],
      accepted: Promise.resolve(),
      retired: false,
      connected: Promise.resolve().then(() => acquire(run)),
    };
    active.set(accountId, run);
    return run;
  }
  async function enqueue(owner: ChatOwner, chatId: string, command: Command) {
    const { accountId } = owner;
    await billing?.ensureCredit(accountId);
    const run = reserve(owner, chatId);
    const accepted = run.accepted
      .catch(() => {})
      .then(async () => {
        let pendingCommand = command;
        await run.connected;
        run.abort.signal.throwIfAborted();
        const session = run.session ?? (await chats.executionSession(accountId, chatId));
        if (command.kind === "message") command.timing?.mark("googleSessionReady");
        run.abort.signal.throwIfAborted();
        if (command.kind !== "compact") run.session = session;
        if (command.kind === "message") {
          const message = command.message;
          if (session.events.some((event) => event.customMetadata?.miraiCommandId === message.id))
            return;
          try {
            const rawMessage = sendChatSchema.safeParse(message);
            const queued =
              attachments && rawMessage.success
                ? await attachments.save(accountId, chatId, rawMessage.data)
                : message;
            await chats.service.appendEvent({
              session,
              event: createEvent({
                author: "mirai_queue",
                customMetadata: {
                  miraiCommandId: message.id,
                  miraiQueued: queued,
                },
              }),
            });
            pendingCommand = { ...command, message: queued };
            command.timing?.mark("userQueuedDurably");
          } catch (error) {
            run.session = undefined;
            throw error;
          }
          if (!run.abort.signal.aborted)
            emit(run, {
              type: "event",
              partial: false,
              event: {
                id: message.id,
                at: new Date().toISOString(),
                role: "user",
                parts: [
                  {
                    type: "text",
                    text: [message.text, ...(message.attachments ?? []).map((file) => file.name)]
                      .filter(Boolean)
                      .join("\n"),
                  },
                ],
              },
            });
        }
        if (command.kind === "resume") {
          const campaign = await results.campaignForChat(accountId, chatId, command.campaignId);
          if (!campaign || campaign.status !== "stopped")
            throw new ChatError("NO_STOPPED_CAMPAIGN", 409);
        }
        run.abort.signal.throwIfAborted();
        run.queue.push(pendingCommand);
      });
    run.accepted = accepted;
    run.finished ??= new Promise<void>((start) => setImmediate(start)).then(() => drain(run));
    await accepted;
  }
  async function drain(run: Run) {
    let error: string | null = null;
    const { accountId, chatId } = run;
    try {
      await run.connected;
      if (!run.queue.length) await run.accepted.catch(() => {});
      if (!run.queue.length) return;
      emit(run, { type: "status", working: true, error: null });
      let restart = false;
      while (!run.abort.signal.aborted && !run.successor) {
        const inbox = run.accepted;
        await inbox.catch(() => {});
        if (inbox !== run.accepted) continue;
        if (run.successor) break;
        run.abort.signal.throwIfAborted();
        const command = run.queue.shift();
        if (!command) {
          run.retired = true;
          break;
        }
        const resumed = command.kind === "renewal" ? command.turn : undefined;
        if (resumed) run.suspendedTurn = undefined;
        const message =
          command.kind === "message" || command.kind === "renewal" ? command.message : undefined;
        const scope: AgentScope = {
          accountId,
          chatId,
          commandId: resumed?.commandId ?? message?.id ?? randomUUID(),
          campaignId: command.kind === "resume" ? command.campaignId : resumed?.campaignId,
          runningCampaignId: resumed?.runningCampaignId,
        };
        if (command.kind === "compact") {
          if (await agent.compact(scope, run.abort.signal)) {
            run.session = undefined;
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
        const activityTurn: ChatTurn = {
          id: scope.commandId,
          startedAt: resumed?.startedAt ?? Date.now(),
          phase: "session",
        };
        const timing =
          (command.kind === "message" && command.timing) || new ChatTiming(activityTurn.id);
        run.turn = activityTurn;
        run.timing = timing;
        timing.observe((phase) => {
          if (run.abort.signal.aborted) return;
          activityTurn.phase = phase;
          emit(run, { type: "status", working: true, error: null, turn: activityTurn });
        });
        timing.progress("session");
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
          browser = await run.owner.browser(locale, signal);
          signal.throwIfAborted();
          return browser;
        };
        const onBoundary = () => {
          if (run.successor) throw pause.signal.reason;
          if (run.queue.some((entry) => entry.kind === "message")) turn.abort();
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
            scope.runningCampaignId = resumed.id;
          }
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
          const originalPending =
            resumed &&
            message &&
            !resumed.interaction &&
            !run.session?.events.some(
              ({ author, customMetadata }) =>
                author === "user" && customMetadata?.miraiCommandId === message.id,
            );
          const input =
            (resumed && !originalPending ? renewalInstruction : message?.text) ??
            "Resume the selected campaign. Inspect uncertain application results before deciding what to do next.";
          const inputFiles =
            message && (!resumed || originalPending)
              ? ((command.kind === "message" ? command.parts : undefined) ??
                (await prepareChatAttachments(
                  attachments
                    ? await attachments.restore(accountId, chatId, message)
                    : sendChatSchema.parse(message).attachments,
                )))
              : [];
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
          if (signal.aborted) outcome = "interrupted";
        } catch (failure) {
          outcome = failure instanceof ChatError || failure instanceof BillingError ? failure.code : "interrupted";
          if (failure instanceof BillingError) run.reason ??= failure.code;
          if (!run.successor) run.session = undefined;
          if (!turn.signal.aborted && !run.abort.signal.aborted && !run.successor) throw failure;
          restart = true;
        } finally {
          timing.finish(outcome);
          if (
            run.successor &&
            (handoff.current ||
              handoff.restoring ||
              scope.runningCampaignId ||
              outcome !== "completed")
          ) {
            run.suspendedTurn = {
              commandId: scope.commandId,
              startedAt: activityTurn.startedAt,
              locale,
              campaignId: scope.campaignId,
              runningCampaignId: scope.runningCampaignId,
              interaction: handoff.current ?? handoff.restoring,
            };
          }
          run.activeTurn = undefined;
          run.pause = undefined;
          run.turn = undefined;
          run.timing = undefined;
          try {
            await browser?.close();
          } finally {
            if (scope.runningCampaignId && !run.successor) {
              const { reached } = await results.campaignBudget(accountId, scope.runningCampaignId);
              await results.transitionCampaign(
                accountId,
                scope.runningCampaignId,
                "running",
                reached ? "completed" : "stopped",
                reached
                  ? "Application limit reached."
                  : (run.reason ?? "Execution ended before the mandate was completed."),
              );
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
        error = failure instanceof ChatError || failure instanceof BillingError ? failure.message : "AGENT_EXECUTION_FAILED";
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
        if (successor && (run.suspendedTurn || run.queue.length) && run.session) {
          await chats.service.appendEvent({
            session: run.session,
            event: createEvent({
              author: "mirai_control",
              customMetadata: {
                miraiWorkspaceHandoff: {
                  successor,
                  turn: run.suspendedTurn,
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
        if (!run.successor && run.suspendedTurn) await discardTurn(accountId, run.suspendedTurn);
        if (!error) chats.rememberExecution(run.session);
      } catch (failure) {
        error = "CHAT_INTERRUPTED";
        if (run.suspendedTurn?.runningCampaignId)
          await results
            .transitionCampaign(
              accountId,
              run.suspendedTurn.runningCampaignId,
              "running",
              "stopped",
              "Unable to save workspace handoff.",
            )
            .catch(() => {});
        console.error({
          event: "workspace_handoff_failed",
          errorType: failure instanceof Error ? failure.name : "Unknown",
        });
      }
      const connection = await run.connected.catch(() => undefined);
      await connection?.end().catch(() => {});
      if (active.get(accountId) === run) active.delete(accountId);
      if (!run.successor || error)
        emit(run, {
          type: "status",
          working: false,
          error,
        });
    }
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
    loaded?: Run["session"],
  ) {
    const session = loaded ?? (await chats.executionSession(owner.accountId, chatId));
    const turn = handoffFor(session, instanceId)?.turn;
    if (turn) await discardTurn(owner.accountId, turn);
    owner.send(chatId, { type: "status", working: false, error: null });
  }

  async function discardTurn(accountId: string, turn: ResumedTurn) {
    await Promise.all([
      turn.interaction && agent.cancelInteraction(turn.interaction.id).catch(() => {}),
      turn.runningCampaignId &&
        results.transitionCampaign(
          accountId,
          turn.runningCampaignId,
          "running",
          "stopped",
          "Workspace closed or stopped.",
        ),
    ]);
  }

  async function resumeRenewal(owner: ChatOwner, chatId: string, instanceId: string) {
    const session = await chats.executionSession(owner.accountId, chatId);
    const checkpoint = handoffFor(session, instanceId);
    if (owner.signal.aborted) return discardRenewal(owner, chatId, instanceId, session);
    if (!checkpoint) {
      owner.send(chatId, { type: "status", working: false, error: null });
      return;
    }
    try {
      await billing?.ensureCredit(owner.accountId);
    } catch (error) {
      await discardRenewal(owner, chatId, instanceId, session);
      throw error;
    }
    const commands = new Map<string, QueuedMessage>();
    for (const event of session.events) {
      const parsed = queuedChatSchema.safeParse(event.customMetadata?.miraiQueued);
      if (parsed.success) commands.set(parsed.data.id, parsed.data);
    }
    const run = reserve(owner, chatId);
    run.session = session;
    run.suspendedTurn = checkpoint.turn;
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
    run.finished = new Promise<void>((start) => setImmediate(start)).then(() => drain(run));
  }
  return {
    enqueue,
    resumeRenewal,
    discardRenewal,
    runningChat(owner: ChatOwner) {
      const run = active.get(owner.accountId);
      return run?.owner === owner && !run.retired ? run.chatId : undefined;
    },
    suspend(owner: ChatOwner, successor: string) {
      const run = active.get(owner.accountId);
      if (run?.owner !== owner || run.abort.signal.aborted) return;
      run.successor = successor;
      run.pause?.abort(new Error("WORKSPACE_RENEWING"));
      return run.finished;
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
      const run = active.get(owner.accountId);
      if (run?.owner !== owner || run.chatId !== chatId) return;
      cancel(run, "Stopped by the user.");
      return run.finished;
    },
    disconnect(owner: ChatOwner) {
      const run = active.get(owner.accountId);
      if (run?.owner !== owner) return;
      cancel(run, "The Mirai connection closed.", "CHAT_INTERRUPTED");
      return run.finished;
    },
    async isWorking(accountId: string, chatId: string) {
      const run = active.get(accountId);
      if (run?.chatId === chatId) return true;
      return results.executionActive(accountId);
    },
  };
}
