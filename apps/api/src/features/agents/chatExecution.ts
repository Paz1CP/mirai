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

type Command =
  | { kind: "message"; message: QueuedMessage; parts?: Part[]; timing?: ChatTiming }
  | { kind: "compact"; locale: "es" | "en" }
  | { kind: "resume"; campaignId: string; locale: "es" | "en" };
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
) {
  const active = new Map<string, Run>();
  const emit = (run: Run, event: ChatStream) => {
    run.owner.send(run.chatId, event);
    if (event.type === "event" && run.timing?.turnId === event.event.turnId)
      run.timing?.mark("firstContentSocketWrite");
  };
  function cancel(run: Run, reason: string, error: string | null = null) {
    if (run.abort.signal.aborted) return;
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
      if (existing.chatId !== chatId || existing.owner !== owner || existing.abort.signal.aborted || existing.retired)
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
          if (run.abort.signal.aborted) return;
          activityTurn.phase = phase;
          emit(run, { type: "status", working: true, error: null, turn: activityTurn });
        });
        timing.progress("session");
        const signal = AbortSignal.any([run.abort.signal, turn.signal]);
        const locale = command.kind === "message" ? command.message.locale : command.locale;
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
            onBoundary,
            restart,
            (event: Event) => {
              if (signal.aborted) return;
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
                void chats.capacity(message?.generation?.model).then((capacity) => {
                  if (!signal.aborted) emit(run, { type: "context", context: { used, capacity } });
                });
            },
            command.kind === "resume",
            [...inputFiles, ...previousFiles],
            message?.generation,
            {
              turn: activityTurn,
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
          outcome = failure instanceof ChatError ? failure.code : "interrupted";
          run.session = undefined;
          if (!turn.signal.aborted && !run.abort.signal.aborted) throw failure;
          restart = true;
        } finally {
          timing.finish(outcome);
          run.activeTurn = undefined;
          run.turn = undefined;
          run.timing = undefined;
          try {
            await browser?.close();
          } finally {
            if (scope.runningCampaignId) {
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
      }
    } catch (failure) {
      if (!run.abort.signal.aborted) {
        error = failure instanceof ChatError ? failure.message : "AGENT_EXECUTION_FAILED";
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
      if (!error) chats.rememberExecution(run.session);
      const connection = await run.connected.catch(() => undefined);
      await connection?.end().catch(() => {});
      if (active.get(accountId) === run) active.delete(accountId);
      emit(run, {
        type: "status",
        working: false,
        error,
      });
    }
  }
  return {
    enqueue,
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
