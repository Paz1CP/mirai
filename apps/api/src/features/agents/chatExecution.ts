import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
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
import {
  executionLockKey,
  type createResultsRepository,
} from "../applications/resultsRepository.js";
import type { createControllerRepository } from "../sessions/controllerRepository.js";
import { toChatEvent } from "./chatEvents.js";
import { prepareChatAttachments, type createQueuedAttachments } from "./chatAttachments.js";
import { ChatError, type ManagedChats } from "./managedChats.js";
import type { BrowserTools, createMiraiAgent } from "./miraiAgent.js";
import type { AgentScope } from "./miraiTools.js";
import { ChatTiming } from "./chatTiming.js";

type Command =
  | { kind: "message"; message: QueuedMessage; parts?: Part[]; timing?: ChatTiming }
  | { kind: "compact"; locale: "es" | "en" }
  | { kind: "resume"; campaignId: string; locale: "es" | "en" };
type Run = {
  accountId: string;
  chatId: string;
  instanceId: string;
  abort: AbortController;
  activeTurn?: AbortController;
  turn?: ChatTurn;
  timing?: ChatTiming;
  queue: Command[];
  accepted: Promise<unknown>;
  session?: Awaited<ReturnType<ManagedChats["owned"]>>;
  connected: Promise<Client>;
  listening?: Promise<unknown>;
  processing: boolean;
  retired: boolean;
  reason?: string;
};
const takeover = "The Mirai controller disconnected or moved to another window.";
const executionDisconnected = "The execution connection was interrupted.";

export function createChatExecution(
  chats: ManagedChats,
  agent: ReturnType<typeof createMiraiAgent>,
  results: ReturnType<typeof createResultsRepository>,
  controller: ReturnType<typeof createControllerRepository>,
  browserFor: (
    scope: AgentScope,
    instanceId: string,
    locale: "es" | "en",
    signal: AbortSignal,
  ) => Promise<BrowserTools | undefined>,
  attachments?: ReturnType<typeof createQueuedAttachments>,
) {
  const active = new Map<string, Run>();
  const events = new EventEmitter();
  const recentErrors = new Map<string, string>();
  const room = (accountId: string, chatId: string) => JSON.stringify([accountId, chatId]);
  const emit = (run: Run, event: ChatStream) => events.emit(room(run.accountId, run.chatId), event);
  function cancel(run: Run, reason: string, error: string | null = null) {
    if (run.abort.signal.aborted) return;
    run.reason ??= reason;
    if (error) {
      recentErrors.set(room(run.accountId, run.chatId), error);
      console.warn({ event: "agent_execution_interrupted", code: error, reason });
    }
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
  async function authorize(accountId: string, instanceId: string) {
    if (!(await controller.validatePresence(accountId, instanceId)))
      throw new ChatError("CONTROL_REQUIRED", 409);
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
      connection.on("notification", (notification) => {
        if (notification.channel !== "mirai_control") return;
        try {
          const event = JSON.parse(notification.payload ?? "{}") as {
            accountId?: string;
            instanceId?: string;
            type?: string;
          };
          if (event.accountId !== run.accountId) return;
          if (
            (event.type === "control.departed" && event.instanceId === run.instanceId) ||
            ((event.type === "control.transferred" || event.type === "control.revoked") &&
              event.instanceId !== run.instanceId)
          )
            cancel(run, takeover, "CHAT_INTERRUPTED");
        } catch {
          /* Ignore notifications from unrelated clients. */
        }
      });
      run.listening = connection.query("LISTEN mirai_control");
      void run.listening.catch(() => {});
      return connection;
    } catch (error) {
      connection.off("end", onUnexpectedDisconnect);
      await connection.end().catch(() => {});
      throw error;
    }
  }
  async function reserve(accountId: string, chatId: string, instanceId: string) {
    await authorize(accountId, instanceId);
    const existing = active.get(accountId);
    if (existing) {
      if (
        existing.chatId !== chatId ||
        existing.instanceId !== instanceId ||
        existing.abort.signal.aborted ||
        existing.retired
      )
        throw new ChatError("EXECUTION_ALREADY_ACTIVE", 409);
      return existing;
    }
    const run: Run = {
      accountId,
      chatId,
      instanceId,
      abort: new AbortController(),
      queue: [],
      accepted: Promise.resolve(),
      processing: false,
      retired: false,
      connected: Promise.resolve().then(() => acquire(run)),
    };
    active.set(accountId, run);
    recentErrors.delete(room(accountId, chatId));
    return run;
  }
  async function enqueue(accountId: string, chatId: string, instanceId: string, command: Command) {
    const run = await reserve(accountId, chatId, instanceId);
    const accepted = run.accepted
      .catch(() => {})
      .then(async () => {
        let pendingCommand = command;
        await run.connected;
        run.abort.signal.throwIfAborted();
        const [, session] = await Promise.all([
          run.listening,
          run.session ?? chats.executionSession(accountId, chatId),
        ]);
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
    try {
      await accepted;
    } finally {
      if (!run.processing) {
        run.processing = true;
        setImmediate(() => {
          void drain(run);
        });
      }
    }
  }
  async function drain(run: Run) {
    let error: string | null = null;
    const { accountId, chatId, instanceId } = run;
    const checkAuthorization = async () => {
      run.abort.signal.throwIfAborted();
      try {
        await authorize(accountId, instanceId);
      } catch (error) {
        cancel(
          run,
          error instanceof ChatError ? takeover : executionDisconnected,
          "CHAT_INTERRUPTED",
        );
        throw error;
      }
    };
    try {
      await run.connected;
      if (!run.queue.length) await run.accepted.catch(() => {});
      if (!run.queue.length) return;
      emit(run, { type: "status", working: true, error: null });
      let restart = false;
      while (!run.abort.signal.aborted) {
        const inbox = run.accepted;
        await inbox.catch(() => {});
        if (inbox !== run.accepted) continue;
        const command = run.queue.shift();
        if (!command) {
          run.retired = true;
          break;
        }
        run.abort.signal.throwIfAborted();
        const message = command.kind === "message" ? command.message : undefined;
        const scope: AgentScope = {
          accountId,
          chatId,
          commandId: message?.id ?? randomUUID(),
          campaignId: command.kind === "resume" ? command.campaignId : undefined,
        };
        if (command.kind === "compact") {
          if (await agent.compact(scope, run.abort.signal, checkAuthorization)) {
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
        const activityTurn: ChatTurn = {
          id: scope.commandId,
          startedAt: Date.now(),
          phase: "session",
        };
        const timing =
          (command.kind === "message" && command.timing) || new ChatTiming(activityTurn.id);
        run.turn = activityTurn;
        run.timing = timing;
        timing.observe((phase) => {
          activityTurn.phase = phase;
          emit(run, { type: "status", working: true, error: null, turn: activityTurn });
        });
        timing.progress("session");
        const signal = AbortSignal.any([run.abort.signal, turn.signal]);
        const locale = command.kind === "message" ? command.message.locale : command.locale;
        let browser: BrowserTools | undefined;
        const loadBrowser = async () => {
          if (browser?.isConnected()) return browser;
          await browser?.close();
          browser = await browserFor(scope, instanceId, locale, signal);
          return browser;
        };
        const onBoundary = () => {
          if (run.queue.some((entry) => entry.kind === "message")) turn.abort();
          signal.throwIfAborted();
        };
        let outcome = "completed";
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
          const input =
            message?.text ??
            "Resume the selected campaign. Inspect uncertain application results before deciding what to do next.";
          const inputFiles =
            command.kind === "message"
              ? (command.parts ??
                (await prepareChatAttachments(
                  attachments
                    ? await attachments.restore(accountId, chatId, command.message)
                    : sendChatSchema.parse(command.message).attachments,
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
            checkAuthorization,
            onBoundary,
            restart,
            (event: Event) => {
              const visible = toChatEvent(event);
              if (visible) {
                emit(run, {
                  type: "event",
                  event: { ...visible, turnId: activityTurn.id },
                  partial: Boolean(event.partial),
                });
              }
              const used = event.usageMetadata?.promptTokenCount;
              if (used !== undefined)
                void chats
                  .capacity(message?.generation?.model)
                  .then((capacity) => emit(run, { type: "context", context: { used, capacity } }));
            },
            command.kind === "resume",
            [...inputFiles, ...previousFiles],
            message?.generation,
            {
              turn: activityTurn,
              session: run.session,
              timing,
              onSummary: (id, text) => {
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
          outcome = failure instanceof ChatError ? failure.code : "interrupted";
          run.session = undefined;
          if (!turn.signal.aborted && !run.abort.signal.aborted) throw failure;
          restart = true;
        } finally {
          timing.finish(outcome);
          run.activeTurn = undefined;
          run.turn = undefined;
          run.timing = undefined;
          await browser?.close();
          if (scope.campaignId && (!scope.campaignStatus || scope.campaignStatus === "running")) {
            const { reached } = await results.campaignBudget(accountId, scope.campaignId);
            await results.transitionCampaign(
              accountId,
              scope.campaignId,
              "running",
              reached ? "completed" : "stopped",
              reached
                ? "Application limit reached."
                : (run.reason ?? "Execution ended before the mandate was completed."),
            );
          }
        }
      }
    } catch (failure) {
      if (!run.abort.signal.aborted) {
        error = failure instanceof ChatError ? failure.message : "AGENT_EXECUTION_FAILED";
        recentErrors.set(room(accountId, chatId), error);
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
      if (!error) chats.rememberExecution(run.session);
      const connection = await run.connected.catch(() => undefined);
      await connection?.end().catch(() => {});
      if (active.get(accountId) === run) active.delete(accountId);
      emit(run, {
        type: "status",
        working: false,
        error: error ?? recentErrors.get(room(accountId, chatId)) ?? null,
      });
    }
  }
  return {
    enqueue,
    async status(accountId: string, chatId: string) {
      const capacity = chats.capacity();
      const campaign = await latest(accountId, chatId);
      const run = active.get(accountId);
      const working = run?.chatId === chatId && !run.abort.signal.aborted;
      return {
        working,
        turn: working ? run?.turn : undefined,
        campaign,
        context: { used: null, capacity: await capacity },
        error: recentErrors.get(room(accountId, chatId)) ?? null,
      };
    },
    async stop(accountId: string, chatId: string, instanceId: string) {
      if (!(await controller.isCurrent(accountId, instanceId)))
        throw new ChatError("CONTROL_REQUIRED", 409);
      const run = active.get(accountId);
      if (run?.chatId === chatId) cancel(run, "Stopped by the user.");
    },
    depart(accountId: string, instanceId: string) {
      const run = active.get(accountId);
      if (run?.instanceId === instanceId) cancel(run, takeover);
    },
    async isWorking(accountId: string, chatId: string) {
      const run = active.get(accountId);
      if (run?.chatId === chatId) return true;
      return results.executionActive(accountId);
    },
    subscribe(accountId: string, chatId: string, send: (event: ChatStream) => void) {
      const name = room(accountId, chatId);
      events.on(name, send);
      const run = active.get(accountId);
      if (run?.chatId === chatId && run.turn && !run.abort.signal.aborted) {
        send({ type: "status", working: true, error: null, turn: run.turn });
      } else {
        send({ type: "status", working: false, error: recentErrors.get(name) ?? null });
      }
      return () => events.off(name, send);
    },
    wroteContent(accountId: string, chatId: string, turnId?: string) {
      const run = active.get(accountId);
      if (run?.chatId === chatId && run.timing?.turnId === turnId)
        run.timing?.mark("firstContentSseWrite");
    },
  };
}
