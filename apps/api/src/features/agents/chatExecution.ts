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
import type { AgentRelay } from "./agentRelay.js";

type Command =
  | { kind: "message"; message: QueuedMessage; parts?: Part[]; timing?: ChatTiming }
  | { kind: "compact" | "resume"; locale: "es" | "en" };
type Run = {
  id: string;
  sequence: number;
  accountId: string;
  chatId: string;
  instanceId: string;
  abort: AbortController;
  activeTurn?: AbortController;
  turn?: ChatTurn;
  liveEvents: Map<string, ChatEvent>;
  timing?: ChatTiming;
  browserScope?: AgentScope;
  queue: Command[];
  accepted: Promise<unknown>;
  session?: Awaited<ReturnType<ManagedChats["owned"]>>;
  connected: Promise<Client>;
  listening?: Promise<unknown>;
  campaignRecovery?: Promise<void>;
  campaignId?: string;
  processing: boolean;
  retired: boolean;
  reason?: string;
};
type StreamStamp = { runId: string; sequence: number };
type StreamState = { frames: ChatStream[]; stamp?: StreamStamp };
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
  relay?: AgentRelay,
) {
  const active = new Map<string, Run>();
  const events = new EventEmitter();
  const recentErrors = new Map<string, string>();
  const finished = new Map<string, { turnId: string; events: ChatEvent[]; expires: number }>();
  const room = (accountId: string, chatId: string) => JSON.stringify([accountId, chatId]);
  const publications = new Map<string, Promise<void>>();
  relay?.listen("chat-event", (key, value) => {
    const { event, stamp } = value as { event: ChatStream; stamp: StreamStamp };
    events.emit(key, event, stamp);
  });
  const emit = (run: Run, event: ChatStream) => {
    const key = room(run.accountId, run.chatId);
    if (!relay) { events.emit(key, event); return; }
    const stamp = { runId: run.id, sequence: ++run.sequence };
    const next = (publications.get(key) ?? Promise.resolve()).then(() => relay.send("chat-event", key, { event, stamp }))
      .catch(() => console.warn({ event: "chat_event_delivery_failed" }))
      .finally(() => { if (publications.get(key) === next) publications.delete(key); });
    publications.set(key, next);
  };
  function publish(run: Run, event: ChatEvent, partial: boolean) {
    if (event.activityId) run.liveEvents.delete(event.activityId);
    const previous = partial ? run.liveEvents.get(event.id)?.parts[0] : undefined;
    const delta = event.parts[0];
    const at = run.liveEvents.get(event.id)?.at ?? event.at;
    run.liveEvents.set(event.id, {
      ...event,
      at,
      parts: previous && delta && "text" in previous && "text" in delta && previous.type === delta.type
        ? [{ ...delta, text: previous.text + delta.text }]
        : event.parts,
    });
    emit(run, { type: "event", event: { ...event, at }, partial });
  }
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
      run.listening = connection.query("LISTEN mirai_execution_stop");
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
      id: randomUUID(),
      sequence: 0,
      accountId,
      chatId,
      instanceId,
      abort: new AbortController(),
      queue: [],
      liveEvents: new Map(),
      accepted: Promise.resolve(),
      processing: false,
      retired: false,
      connected: Promise.resolve().then(() => acquire(run)),
    };
    active.set(accountId, run);
    recentErrors.delete(room(accountId, chatId));
    return run;
  }
  async function enqueueLocal(accountId: string, chatId: string, instanceId: string, command: Command) {
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
            const queued = attachments && rawMessage.success
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
          run.campaignRecovery ??= results.stopInterruptedCampaigns(accountId, true);
          await run.campaignRecovery;
          const campaign = await results.latestChatCampaign(accountId, chatId);
          if (campaign?.status !== "stopped") throw new ChatError("NO_STOPPED_CAMPAIGN", 409);
          run.campaignId = campaign.id;
          const consumed = new Set(
            session.events
              .filter((event) => event.author === "user")
              .map((event) => event.customMetadata?.miraiCommandId),
          );
          const pending = session.events.flatMap((event) => {
            const parsed = queuedChatSchema.safeParse(event.customMetadata?.miraiQueued);
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
  async function enqueue(accountId: string, chatId: string, instanceId: string, command: Command) {
    try {
      await enqueueLocal(accountId, chatId, instanceId, command);
    } catch (error) {
      if (!relay || !(error instanceof ChatError) || error.code !== "EXECUTION_ALREADY_ACTIVE") throw error;
      const wireCommand = command.kind === "message"
        ? { kind: command.kind, message: attachments
            ? await attachments.save(accountId, chatId, sendChatSchema.parse(command.message))
            : command.message }
        : command;
      const acknowledged = await relay.request<{ error?: string; status?: number }>(
        "chat-command", accountId, { chatId, instanceId, command: wireCommand },
        AbortSignal.timeout(15000),
      ).catch(() => { throw error; });
      if (acknowledged.error) throw new ChatError(acknowledged.error, acknowledged.status ?? 500);
    }
  }
  relay?.handle("chat-command", async (accountId, value) => {
    const run = active.get(accountId);
    if (!run || run.retired) return;
    if (!await run.connected.catch(() => undefined) || run.retired) return;
    const { chatId, instanceId, command } = value as { chatId: string; instanceId: string; command: Command };
    if (run.chatId !== chatId || run.instanceId !== instanceId)
      return { error: "EXECUTION_ALREADY_ACTIVE", status: 409 };
    try {
      await enqueueLocal(accountId, chatId, instanceId, command);
      return {};
    } catch (error) {
      return error instanceof ChatError ? { error: error.code, status: error.status } : { error: "AGENT_EXECUTION_FAILED" };
    }
  });
  function liveState(accountId: string, chatId: string): StreamState | undefined {
    const run = active.get(accountId);
    if (run?.chatId === chatId && !run.retired) {
      const stamp = { runId: run.id, sequence: run.sequence };
      if (!run.turn || run.abort.signal.aborted) return { stamp, frames: [{ type: "status", working: run.processing && !run.abort.signal.aborted, error: null }] };
      return { stamp, frames: [
        { type: "status", working: true, error: null, turn: run.turn },
        { type: "snapshot", turnId: run.turn.id, events: [...run.liveEvents.values()] },
      ] };
    }
    const last = finished.get(room(accountId, chatId));
    return last && last.expires > Date.now() ? { frames: [
      { type: "status", working: false, error: recentErrors.get(room(accountId, chatId)) ?? null },
      { type: "snapshot", turnId: last.turnId, events: last.events },
    ] } : undefined;
  }
  relay?.handle("chat-state", async (accountId, chatId) => {
    const run = active.get(accountId);
    if (typeof chatId !== "string" || !run || !await run.connected.catch(() => undefined) || run.retired) return;
    return liveState(accountId, chatId);
  });
  async function sharedState(accountId: string, chatId: string) {
    const local = liveState(accountId, chatId);
    if (local?.frames[0]?.type === "status" && local.frames[0].working) return local;
    if (!relay || !await results.executionActive(accountId)) return local;
    return relay.request<StreamState>("chat-state", accountId, chatId, AbortSignal.timeout(1500))
      .catch(() => local);
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
          campaignId: run.campaignId,
          async ensureCampaign() {
            if (scope.campaignId) return;
            run.campaignRecovery ??= results.stopInterruptedCampaigns(accountId, true);
            await run.campaignRecovery;
            const previous = await results.latestChatCampaign(accountId, chatId);
            if (previous?.status === "running" || previous?.status === "stopped")
              scope.campaignId = previous.id;
          },
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
        const activityTurn: ChatTurn = { id: scope.commandId, startedAt: Date.now(), phase: "session" };
        const timing = (command.kind === "message" && command.timing) || new ChatTiming(activityTurn.id);
        run.turn = activityTurn;
        run.timing = timing;
        run.liveEvents.clear();
        timing.observe((phase) => {
          activityTurn.phase = phase;
          emit(run, { type: "status", working: true, error: null, turn: activityTurn });
        });
        timing.progress("session");
        const signal = AbortSignal.any([run.abort.signal, turn.signal]);
        const locale = command.kind === "message" ? command.message.locale : command.locale;
        let browser: Promise<BrowserTools | undefined> | undefined;
        const loadBrowser = () =>
          (browser ??= browserFor(scope, instanceId, locale, signal).then((connection) => {
            if (connection) run.browserScope = scope;
            return connection;
          }));
        const onBoundary = () => {
          if (run.queue.some((entry) => entry.kind === "message")) turn.abort();
          signal.throwIfAborted();
        };
        let outcome = "completed";
        try {
          if (command.kind === "resume" && (!run.campaignId || !(await loadBrowser())))
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
            loadBrowser,
            signal,
            checkAuthorization,
            onBoundary,
            restart,
            (event: Event) => {
              const visible = toChatEvent(event);
              if (visible) {
                publish(run, { ...visible, turnId: activityTurn.id }, Boolean(event.partial));
              }
              const used = event.usageMetadata?.promptTokenCount;
              if (used !== undefined)
                void chats
                  .capacity(message?.generation?.model)
                  .then((capacity) => emit(run, { type: "context", context: { used, capacity } }));
            },
            command.kind === "resume",
            command.kind === "message"
              ? (command.parts ?? await prepareChatAttachments(
                  (attachments ? await attachments.restore(accountId, chatId, command.message)
                    : sendChatSchema.parse(command.message)).attachments,
                ))
              : [],
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
                publish(run, event, true);
              },
            },
          );
          restart = turn.signal.aborted;
          if (message && !signal.aborted)
            await attachments?.remove(accountId, chatId, message.id).catch(() => {
              console.warn({ event: "queued_attachment_cleanup_failed" });
            });
          if (signal.aborted) outcome = "interrupted";
        } catch (failure) {
          outcome = failure instanceof ChatError ? failure.code : "interrupted";
          run.session = undefined;
          if (!turn.signal.aborted && !run.abort.signal.aborted) throw failure;
          restart = true;
        } finally {
          timing.finish(outcome);
          if (run.liveEvents.size) {
            const name = room(accountId, chatId);
            finished.delete(name);
            const snapshot = { turnId: activityTurn.id, events: [...run.liveEvents.values()], expires: Date.now() + 60_000 };
            finished.set(name, snapshot);
            setTimeout(() => { if (finished.get(name) === snapshot) finished.delete(name); }, 60_000).unref();
            if (finished.size > 12) finished.delete(finished.keys().next().value!);
          }
          run.campaignId = scope.campaignId;
          run.activeTurn = undefined;
          run.turn = undefined;
          run.timing = undefined;
          run.browserScope = undefined;
          await (await browser?.catch(() => undefined))?.close();
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
  }
  return {
    enqueue,
    ready: () => relay?.ready(),
    removeAttachments: (accountId: string, chatId: string) => attachments?.remove(accountId, chatId),
    async status(accountId: string, chatId: string) {
      const capacity = chats.capacity();
      const [campaign, state] = await Promise.all([latest(accountId, chatId), sharedState(accountId, chatId)]);
      const status = state?.frames.find((frame) => frame.type === "status");
      return {
        working: status?.working ?? false,
        turn: status?.turn,
        campaign,
        context: { used: null, capacity: await capacity },
        error: status?.error ?? recentErrors.get(room(accountId, chatId)) ?? null,
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
      if (run?.instanceId === instanceId && run.browserScope)
        cancel(run, "The extension disconnected during browser use.", "CHAT_INTERRUPTED");
    },
    async isWorking(accountId: string, chatId: string) {
      const run = active.get(accountId);
      if (run?.chatId === chatId) return true;
      return results.executionActive(accountId);
    },
    subscribe(accountId: string, chatId: string, send: (event: ChatStream) => void, reconnect?: () => void) {
      const name = room(accountId, chatId);
      if (relay) {
        let buffered: Array<{ event: ChatStream; stamp: StreamStamp }> | undefined = [];
        let snapshot: StreamStamp | undefined;
        let subscribed = true;
        const forward = (event: ChatStream, stamp: StreamStamp) => {
          if (buffered) buffered.push({ event, stamp });
          else if (!snapshot || snapshot.runId !== stamp.runId || snapshot.sequence < stamp.sequence)
            send(event);
        };
        events.on(name, forward);
        const forgetConnection = relay.listen("transport-lost", () => reconnect?.());
        void sharedState(accountId, chatId).catch(() => undefined).then((state) => {
          if (!subscribed) return;
          snapshot = state?.stamp;
          for (const frame of state?.frames ?? [{ type: "status" as const, working: false, error: null }]) send(frame);
          const received = buffered;
          buffered = undefined;
          for (const { event, stamp } of received ?? []) forward(event, stamp);
        });
        return () => { subscribed = false; events.off(name, forward); forgetConnection(); };
      }
      events.on(name, send);
      const run = active.get(accountId);
      if (run?.chatId === chatId && run.turn && !run.abort.signal.aborted) {
        send({ type: "status", working: true, error: null, turn: run.turn });
        send({ type: "snapshot", turnId: run.turn.id, events: [...run.liveEvents.values()] });
      } else {
        send({ type: "status", working: false, error: recentErrors.get(name) ?? null });
        const last = finished.get(name);
        if (last && last.expires > Date.now()) send({ type: "snapshot", turnId: last.turnId, events: last.events });
      }
      return () => events.off(name, send);
    },
    wroteContent(accountId: string, chatId: string, turnId?: string) {
      const run = active.get(accountId);
      if (run?.chatId === chatId && run.timing?.turnId === turnId) run.timing?.mark("firstContentSseWrite");
    },
  };
}
