import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createEvent, type Event } from "@google/adk";
import {
  campaignListQuerySchema,
  sendChatSchema,
  type ChatStream,
  type ChatTurn,
  type SendChat,
} from "@mirai/contracts";
import { Client } from "pg";
import {
  executionLockKey,
  type createResultsRepository,
} from "../applications/resultsRepository.js";
import type { createControllerRepository } from "../sessions/controllerRepository.js";
import { toChatEvent } from "./chatEvents.js";
import { ChatError, type ManagedChats } from "./managedChats.js";
import type { BrowserTools, createMiraiAgent } from "./miraiAgent.js";
import type { AgentScope } from "./miraiTools.js";

type Command =
  { kind: "message"; message: SendChat } | { kind: "compact" | "resume"; locale: "es" | "en" };
type Run = {
  accountId: string;
  chatId: string;
  instanceId: string;
  abort: AbortController;
  activeTurn?: AbortController;
  turn?: ChatTurn;
  browserScope?: AgentScope;
  queue: Command[];
  accepted: Promise<unknown>;
  connected: Promise<Client>;
  campaignId?: string;
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
        if (notification.payload === room(run.accountId, run.chatId))
          cancel(run, "Stopped by the user.");
      });
      await connection.query("LISTEN mirai_execution_stop");
      await results.stopInterruptedCampaigns(run.accountId, true);
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
        await run.connected;
        run.abort.signal.throwIfAborted();
        const session = await chats.owned(accountId, chatId, command.kind !== "compact");
        if (command.kind === "message") {
          const message = command.message;
          if (session.events.some((event) => event.customMetadata?.miraiCommandId === message.id))
            return;
          await chats.service.appendEvent({
            session,
            event: createEvent({
              author: "mirai_queue",
              customMetadata: { miraiCommandId: message.id, miraiQueued: message },
            }),
          });
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
          const campaign = await latest(accountId, chatId);
          if (campaign?.status !== "stopped") throw new ChatError("NO_STOPPED_CAMPAIGN", 409);
          run.campaignId = campaign.id;
          const consumed = new Set(
            session.events
              .filter((event) => event.author === "user")
              .map((event) => event.customMetadata?.miraiCommandId),
          );
          const pending = session.events.flatMap((event) => {
            const parsed = sendChatSchema.safeParse(event.customMetadata?.miraiQueued);
            return parsed.success && !consumed.has(parsed.data.id)
              ? [{ kind: "message" as const, message: parsed.data }]
              : [];
          });
          run.queue.push(
            command,
            ...pending.filter(
              ({ message }) =>
                !run.queue.some(
                  (item) => item.kind === "message" && item.message.id === message.id,
                ),
            ),
          );
          return;
        }
        run.abort.signal.throwIfAborted();
        run.queue.push(command);
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
    const renew = setInterval(() => {
      if (!run.abort.signal.aborted) void checkAuthorization().catch(() => {});
    }, 4000);
    try {
      await run.connected;
      if (!run.queue.length) await run.accepted.catch(() => {});
      if (!run.queue.length) return;
      emit(run, { type: "status", working: true, error: null });
      let restart = false;
      const previous = await latest(accountId, chatId);
      if (previous?.status === "running" || previous?.status === "stopped")
        run.campaignId = previous.id;
      while (!run.abort.signal.aborted) {
        const inbox = run.accepted;
        await inbox.catch(() => {});
        if (inbox !== run.accepted) continue;
        const command = run.queue.shift();
        if (!command) {
          run.retired = true;
          break;
        }
        await checkAuthorization();
        const message = command.kind === "message" ? command.message : undefined;
        const scope: AgentScope = {
          accountId,
          chatId,
          commandId: message?.id ?? randomUUID(),
          campaignId: run.campaignId,
        };
        if (command.kind === "compact") {
          if (await agent.compact(scope, run.abort.signal, checkAuthorization)) {
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
        const activityTurn = { id: scope.commandId, startedAt: Date.now() };
        run.turn = activityTurn;
        emit(run, { type: "status", working: true, error: null, turn: activityTurn });
        const signal = AbortSignal.any([run.abort.signal, turn.signal]);
        const locale = command.kind === "message" ? command.message.locale : command.locale;
        const browser = await browserFor(scope, instanceId, locale, signal);
        if (browser) run.browserScope = scope;
        const onBoundary = () => {
          if (run.queue.some((entry) => entry.kind === "message")) turn.abort();
          signal.throwIfAborted();
        };
        try {
          if (command.kind === "resume" && (!browser || !run.campaignId))
            throw new ChatError("BROWSER_NOT_CONNECTED", 409);
          if (command.kind === "resume" && run.campaignId) {
            await results.transitionCampaign(accountId, run.campaignId, "stopped", "running", null);
            restart = true;
          }
          await agent.run(
            scope,
            message?.text ??
              "Resume the existing campaign and reconcile any uncertain application before trying again.",
            locale,
            browser,
            signal,
            checkAuthorization,
            onBoundary,
            restart,
            (event: Event) => {
              const visible = toChatEvent(event);
              if (visible)
                emit(run, {
                  type: "event",
                  event: { ...visible, turnId: activityTurn.id },
                  partial: Boolean(event.partial),
                });
              const used = event.usageMetadata?.promptTokenCount;
              if (used !== undefined)
                void chats
                  .capacity(message?.generation?.model)
                  .then((capacity) => emit(run, { type: "context", context: { used, capacity } }));
            },
            command.kind === "resume",
            message?.attachments,
            message?.generation,
            {
              turn: activityTurn,
              onSummary: (id, text) => emit(run, {
                type: "event",
                partial: false,
                event: {
                  id,
                  turnId: activityTurn.id,
                  at: new Date().toISOString(),
                  role: "assistant",
                  parts: [{ type: "reasoning", text }],
                },
              }),
            },
          );
          restart = turn.signal.aborted;
        } catch (failure) {
          if (!turn.signal.aborted && !run.abort.signal.aborted) throw failure;
          restart = true;
        } finally {
          run.campaignId = scope.campaignId;
          run.activeTurn = undefined;
          run.turn = undefined;
          run.browserScope = undefined;
          await browser?.close();
        }
      }
    } catch (failure) {
      if (!run.abort.signal.aborted) {
        error = failure instanceof ChatError ? failure.message : "AGENT_EXECUTION_FAILED";
        recentErrors.set(room(accountId, chatId), error);
        console.error({
          event: "agent_execution_failed",
          code: failure instanceof ChatError ? failure.code : error,
          detail: failure instanceof ChatError ? failure.message : undefined,
          errorType: failure instanceof Error ? failure.name : "Unknown",
          providerStatus:
            failure instanceof Error && "status" in failure && typeof failure.status === "number"
              ? failure.status
              : undefined,
        });
      }
    } finally {
      run.retired = true;
      clearInterval(renew);
      try {
        if (run.campaignId)
          await results.transitionCampaign(
            accountId,
            run.campaignId,
            "running",
            "stopped",
            run.reason ??
              (error
                ? "Execution was interrupted before the mandate was completed."
                : "Execution ended before the mandate was completed."),
          );
      } catch {
        error ??= "CAMPAIGN_STATUS_UNAVAILABLE";
      } finally {
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
  }
  return {
    enqueue,
    async status(accountId: string, chatId: string) {
      const capacity = chats.capacity();
      if (!active.has(accountId)) await results.stopInterruptedCampaigns(accountId);
      const campaign = await latest(accountId, chatId);
      const run = active.get(accountId);
      return {
        working: run?.chatId === chatId && !run.abort.signal.aborted,
        turn: run?.chatId === chatId && !run.abort.signal.aborted ? run.turn : undefined,
        campaign,
        context: { used: null, capacity: await capacity },
        error: recentErrors.get(room(accountId, chatId)) ?? null,
      };
    },
    async stop(accountId: string, chatId: string, instanceId: string) {
      await authorize(accountId, instanceId);
      const run = active.get(accountId);
      if (run?.chatId === chatId) cancel(run, "Stopped by the user.");
      await results.signalStop(accountId, chatId);
      const campaign = await latest(accountId, chatId);
      if (campaign?.status === "running")
        await results.transitionCampaign(
          accountId,
          campaign.id,
          "running",
          "stopped",
          "Stopped by the user.",
        );
    },
    disconnect(accountId: string, instanceId: string) {
      const run = active.get(accountId);
      if (run?.instanceId === instanceId) cancel(run, takeover, "CHAT_INTERRUPTED");
    },
    disconnectBrowser(accountId: string, instanceId: string) {
      const run = active.get(accountId);
      if (run?.instanceId === instanceId && run.browserScope?.campaignId)
        cancel(run, "The extension disconnected during a campaign.", "CHAT_INTERRUPTED");
    },
    isWorking(accountId: string, chatId: string) {
      return active.get(accountId)?.chatId === chatId;
    },
    subscribe(accountId: string, chatId: string, send: (event: ChatStream) => void) {
      const name = room(accountId, chatId);
      events.on(name, send);
      return () => events.off(name, send);
    },
  };
}
