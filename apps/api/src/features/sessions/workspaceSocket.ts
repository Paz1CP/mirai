import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import {
  extensionReadySchema,
  workspaceClientSchema,
  workspaceFrameLimit,
  workspaceSocketPath,
  type WorkspaceClientFrame,
  type WorkspaceServerFrame,
} from "@mirai/contracts";
import { Client } from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { prepareChatAttachments } from "../agents/chatAttachments.js";
import type { ChatOwner, createChatExecution } from "../agents/chatExecution.js";
import { ChatTiming } from "../agents/chatTiming.js";
import { ChatError } from "../agents/managedChats.js";
import { BrowserModel } from "../agents/playwright/browserModel.js";
import type { WorkspaceBrowser } from "../agents/playwrightTools.js";
import { ExtractionError } from "../profiles/extractProfile.js";
import { ControlConflict, type createControllerRepository } from "./controllerRepository.js";
import { BillingError } from "../billing/walletRepository.js";
import type { BillingEnvironment } from "../billing/schema.js";

const workspaceRenewalMs = 59 * 60_000;
const workspaceIdleMs = 10 * 60_000;

export function createWorkspaceSocket(
  controller: ReturnType<typeof createControllerRepository>,
  execution: ReturnType<typeof createChatExecution> | undefined,
  verifyIdentity: (header?: string) => Promise<string | null>,
  openBrowser: (
    browser: WorkspaceBrowser,
    locale: "en" | "es",
    signal: AbortSignal,
  ) => ReturnType<ChatOwner["browser"]>,
  billingEnvironment?: BillingEnvironment,
) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: workspaceFrameLimit });
  const sessions = new Set<Promise<void>>();

  function start(socket: WebSocket, extensionOwned: boolean) {
    const started = Date.now();
    const abort = new AbortController();
    let owner: ChatOwner | undefined;
    const instanceId = randomUUID();
    let listener: Client | undefined;
    let opening: Promise<void> | undefined;
    let renewal: { chatId?: string; chatIds?: string[] } | undefined;
    let pendingCommands = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const restore = new Map<string, ChatOwner>();
    const restoring = new Map<string, Promise<void>>();
    const admitting = new Set<Promise<void>>();
    let restored: Promise<void> | undefined;
    let allowCommands: (() => void) | undefined;
    let handoffHeld = false;
    let suspending = false;
    const browsers = new Map<string, { browser: WorkspaceBrowser; wire: EventEmitter }>();
    let legacyChat: string | undefined;
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    sessions.add(settled);
    const send = (frame: WorkspaceServerFrame) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    };
    function resetBrowser(scope: string, reopen = false) {
      const current = browsers.get(scope);
      browsers.delete(scope);
      if (current) {
        current.browser.ready = false;
        current.browser.cdp?.terminate();
        current.wire.emit("close", 1000, Buffer.alloc(0));
      }
      if (reopen) send({ type: "browser.reset", chatId: scope || undefined });
    }
    function resetBrowsers() {
      for (const scope of browsers.keys()) resetBrowser(scope);
    }
    function releaseHandoff() {
      if (!handoffHeld || !listener || !owner || restore.size || restoring.size) return;
      handoffHeld = false;
      void controller.releaseHandoff(listener, owner.accountId).catch(expire);
    }
    function finish(releaseRequestId?: string, successor?: string) {
      if (abort.signal.aborted) return;
      suspending = Boolean(successor);
      abort.abort();
      clearTimeout(timeout);
      clearInterval(heartbeat);
      clearTimeout(idle);
      const draining =
        owner && (successor ? execution?.suspend(owner, successor) : execution?.disconnect(owner));
      if (!successor) resetBrowsers();
      void (async () => {
        try {
          await opening?.catch(() => {});
          await draining;
          await Promise.allSettled(
            [...restore].map(([chatId, previous]) =>
              execution?.discardRenewal(previous, chatId, instanceId),
            ),
          );
          await Promise.allSettled(restoring.values());
          if (releaseRequestId) send({ type: "accepted", requestId: releaseRequestId });
        } finally {
          suspending = false;
          allowCommands?.();
          resetBrowsers();
          socket.close();
          await closed;
          await listener?.end().catch(() => {});
          sessions.delete(settled);
          settle();
        }
      })().catch(() => {});
    }
    const expire = () => {
      if (abort.signal.aborted) return;
      send({ type: "error", code: "CONNECTION_LOST" });
      finish();
    };
    let timeout = setTimeout(expire, 10_000);
    let awaitingPong = false;
    const heartbeat = setInterval(() => {
      if (awaitingPong) return socket.terminate();
      if (socket.readyState === WebSocket.OPEN) {
        awaitingPong = true;
        socket.ping();
      }
    }, 20_000);
    function armIdle() {
      clearTimeout(idle);
      if (abort.signal.aborted) return;
      idle = setTimeout(() => {
        if (
          !owner ||
          renewal ||
          restore.size ||
          restoring.size ||
          pendingCommands ||
          execution?.runningChats(owner).length
        ) {
          armIdle();
          return;
        }
        send({ type: "control.idle" });
        finish();
      }, workspaceIdleMs);
    }
    socket.on("pong", () => {
      awaitingPong = false;
    });
    socket.once("close", () => finish());
    socket.once("error", () => finish());

    function controlLost(id: string | null) {
      send({ type: "control.lost", instanceId: id });
      finish();
    }
    async function acquire(message: Extract<WorkspaceClientFrame, { type: "open" }>) {
      const { token, expectedInstanceId, tabId } = message;
      // A renewal without a fresh page token is authorized by the previous
      // socket's advisory lock, keyed by its private, randomly generated tabId.
      const accountId = token
        ? await verifyIdentity(`Bearer ${token}`)
        : extensionOwned && message.renewal && expectedInstanceId && tabId
          ? message.accountId
          : undefined;
      abort.signal.throwIfAborted();
      if (!accountId || (message.accountId && message.accountId !== accountId))
        throw new ChatError("AUTH_REQUIRED", 401);
      const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT;
      if (!connectionString) throw new ChatError("EVENTS_NOT_CONFIGURED", 503);
      listener = new Client({ connectionString, connectionTimeoutMillis: 5000, keepAlive: true });
      listener.on("error", expire);
      listener.on("end", expire);
      listener.on("notification", (notice) => {
        try {
          const event = JSON.parse(notice.payload ?? "{}") as {
            accountId?: string;
            previousInstanceId?: string;
            instanceId?: string;
            renewal?: boolean;
            environment?: BillingEnvironment;
          };
          if (event.accountId !== accountId) return;
          if (notice.channel === "mirai_results") {
            if (owner) send({ type: "results.changed" });
          } else if (
            notice.channel === "mirai_billing" &&
            event.environment === billingEnvironment
          ) {
            if (owner) send({ type: "billing.changed" });
          } else if (
            notice.channel === "mirai_control" &&
            event.previousInstanceId === instanceId
          ) {
            if (event.renewal && renewal && event.instanceId) finish(undefined, event.instanceId);
            else controlLost(event.instanceId ?? null);
          }
        } catch {
          /* Ignore malformed notifications. */
        }
      });
      await listener.connect();
      await listener.query("LISTEN mirai_control");
      await listener.query("LISTEN mirai_results");
      if (billingEnvironment) await listener.query("LISTEN mirai_billing");
      abort.signal.throwIfAborted();
      if (message.renewal && !tabId) throw new ChatError("INVALID_REQUEST", 400);
      const sessionOwner: ChatOwner = {
        accountId,
        signal: abort.signal,
        send: (chatId, event) => {
          armIdle();
          send({ type: "chat.event", chatId, event });
        },
        browser: async (chatId, locale, signal) => {
          if (extensionOwned)
            return openBrowser(browserFor(chatId, accountId).browser, locale, signal);
          const browser = browsers.get("")?.browser;
          if (!browser?.ready) return undefined;
          if (
            legacyChat !== chatId &&
            legacyChat &&
            execution?.runningChats(sessionOwner).some((run) => run.chatId === legacyChat)
          )
            return undefined;
          legacyChat = chatId;
          return openBrowser(browser, locale, signal);
        },
      };
      const previousInstanceId = await controller.connect(
        listener,
        accountId,
        instanceId,
        expectedInstanceId,
        message.renewal ? tabId : undefined,
      );
      handoffHeld = Boolean(message.renewal);
      const handoffIds =
        message.renewal?.chatIds ?? (message.renewal?.chatId ? [message.renewal.chatId] : []);
      for (const chatId of handoffIds) restore.set(chatId, sessionOwner);
      if (restore.size) {
        restored = new Promise<void>((resolve) => {
          allowCommands = resolve;
        });
      }
      if (previousInstanceId)
        await controller.waitForPrevious(listener, accountId, instanceId, previousInstanceId);
      abort.signal.throwIfAborted();
      owner = sessionOwner;
      armIdle();
      send({
        type: "control.ready",
        instanceId,
        activeChats: extensionOwned ? [...restore.keys()].map((chatId) => ({ chatId })) : undefined,
      });
      releaseHandoff();
      clearTimeout(timeout);
      timeout = setTimeout(
        () => {
          if (!tabId || !listener) return expire();
          renewal = {};
          timeout = setTimeout(expire, 60_000);
          void controller
            .allowRenewal(listener, accountId, instanceId, tabId)
            .then(async () => {
              await Promise.allSettled(admitting);
              if (abort.signal.aborted) return;
              const chatIds = owner && execution?.runningChats(owner).map(({ chatId }) => chatId);
              renewal = chatIds?.length === 1 ? { chatId: chatIds[0] } : { chatIds };
              send({ type: "control.renew", ...renewal });
            })
            .catch(expire);
        },
        Math.max(0, workspaceRenewalMs - (Date.now() - started)),
      );
    }
    function restoreExecution() {
      if (!restore.size || !owner) return;
      const pending = [...restore];
      restore.clear();
      for (const [chatId, previous] of pending) {
        const resumed = execution
          ?.resumeRenewal(previous, chatId, instanceId)
          .catch((error: unknown) => {
            if (!abort.signal.aborted)
              previous.send(chatId, {
                type: "status",
                working: false,
                error:
                  error instanceof ChatError || error instanceof BillingError
                    ? error.code
                    : "CHAT_INTERRUPTED",
              });
          })
          .finally(() => {
            restoring.delete(chatId);
            releaseHandoff();
          });
        if (resumed) restoring.set(chatId, resumed);
      }
      allowCommands?.();
      releaseHandoff();
    }
    function browserFor(scope: string, accountId: string) {
      const current = browsers.get(scope);
      if (current) return current;
      const currentWire = new EventEmitter();
      const binding: WorkspaceBrowser = {
        accountId,
        ready: extensionOwned,
        model: new BrowserModel(
          {
            get readyState() {
              return binding.ready ? socket.readyState : WebSocket.CLOSED;
            },
            send: (frame) => send({ type: "browser.frame", frame, chatId: scope || undefined }),
            close: () => resetBrowser(scope, !abort.signal.aborted),
            on: (event, callback) => {
              currentWire.on(event, callback);
            },
          },
          {
            onInitialized() {
              binding.ready = true;
            },
            onClose() {},
            sendToCDPClient: (message) => {
              if (binding.cdp?.readyState === WebSocket.OPEN)
                binding.cdp.send(JSON.stringify(message));
            },
          },
        ),
      };
      const entry = { browser: binding, wire: currentWire };
      browsers.set(scope, entry);
      return entry;
    }
    function failure(error: unknown, requestId?: string) {
      if (abort.signal.aborted) return;
      const code =
        error instanceof ChatError ||
        error instanceof BillingError ||
        error instanceof ExtractionError ||
        error instanceof ControlConflict
          ? error instanceof ControlConflict
            ? error.message
            : error.code
          : "INTERNAL_ERROR";
      send({
        type: "error",
        code,
        requestId,
        instanceId: error instanceof ControlConflict ? error.instanceId : undefined,
      });
      if (!requestId) finish();
    }
    socket.on("message", (raw, binary) => {
      if (abort.signal.aborted && !suspending) return;
      let candidate: unknown;
      try {
        if (!binary) candidate = JSON.parse(raw.toString()) as unknown;
      } catch {
        /* Invalid frame. */
      }
      const parsed = workspaceClientSchema.safeParse(candidate);
      if (!parsed.success) return failure(new ChatError("INVALID_REQUEST", 400));
      const message = parsed.data;
      if (message.type === "control.keepalive") return;
      if (message.type === "open") {
        if (opening) return failure(new ChatError("INVALID_REQUEST", 400));
        clearTimeout(timeout);
        timeout = setTimeout(expire, message.renewal ? 60_000 : 10_000);
        opening = acquire(message);
        void opening.catch((error: unknown) => failure(error));
        return;
      }
      const connected = owner;
      if (!connected) return failure(new ChatError("CONTROL_REQUIRED", 409));
      if (message.type === "control.restore") {
        if (extensionOwned && !abort.signal.aborted) restoreExecution();
        return;
      }
      if (message.type === "browser.frame") {
        const scope = message.chatId ?? "";
        try {
          if (extensionOwned) {
            if (scope) browsers.get(scope)?.wire.emit("message", Buffer.from(message.frame));
          } else if (
            !scope &&
            (browsers.has("") || extensionReadySchema.safeParse(JSON.parse(message.frame)).success)
          ) {
            const browser = browserFor("", connected.accountId);
            browser.wire.emit("message", Buffer.from(message.frame));
            if (browser.browser.ready) restoreExecution();
          }
        } catch {
          resetBrowser(scope, !abort.signal.aborted);
          restoreExecution();
        }
        return;
      }
      if (message.type === "browser.closed") {
        if (extensionOwned) {
          if (message.chatId) resetBrowser(message.chatId);
        } else {
          resetBrowser("");
          restoreExecution();
        }
        return;
      }
      if (abort.signal.aborted) return;
      if (message.type === "control.attach") {
        if (!extensionOwned)
          return failure(new ChatError("INVALID_REQUEST", 400), message.requestId);
        void verifyIdentity(`Bearer ${message.token}`)
          .then((accountId) => {
            if (accountId !== connected.accountId) throw new ChatError("AUTH_REQUIRED", 401);
            if (!abort.signal.aborted) {
              const activeChats = new Map<
                string,
                ReturnType<NonNullable<typeof execution>["runningChats"]>[number]
              >();
              for (const chatId of [...restore.keys(), ...restoring.keys()])
                activeChats.set(chatId, { chatId, turn: undefined, partials: undefined });
              for (const entry of execution?.runningChats(connected) ?? [])
                activeChats.set(entry.chatId, entry);
              send({
                type: "control.attached",
                requestId: message.requestId,
                instanceId,
                activeChats: [...activeChats.values()],
              });
            } else throw new ChatError("CONNECTION_LOST", 409);
          })
          .catch((error: unknown) => failure(error, message.requestId));
        return;
      }
      if (
        renewal &&
        (message.type === "chat.send" ||
          (message.type === "chat.action" && message.action !== "stop"))
      )
        return failure(new ChatError("WORKSPACE_RENEWING", 409), message.requestId);
      const { requestId } = message;
      pendingCommands++;
      armIdle();
      const accepting = (async () => {
        if (message.type === "control.release") {
          finish(requestId);
          return;
        }
        if (!execution) throw new ChatError("AGENT_NOT_CONFIGURED", 503);
        if (
          message.type === "chat.action" &&
          message.action === "stop" &&
          restore.has(message.chatId)
        ) {
          restore.delete(message.chatId);
          const stopped = execution.discardRenewal(connected, message.chatId, instanceId);
          restoring.set(message.chatId, stopped);
          try {
            await stopped;
          } finally {
            restoring.delete(message.chatId);
            if (!restore.size) allowCommands?.();
            releaseHandoff();
          }
          send({ type: "accepted", requestId });
          return;
        }
        await restored;
        await restoring.get(message.chatId);
        connected.signal.throwIfAborted();
        if (message.type === "chat.send") {
          if (message.message.instanceId !== instanceId)
            throw new ChatError("CONTROL_REQUIRED", 409);
          const timing = new ChatTiming(message.message.id);
          timing.mark("socketReceived");
          const parts = await prepareChatAttachments(message.message.attachments);
          connected.signal.throwIfAborted();
          await execution.enqueue(connected, message.chatId, {
            kind: "message",
            message: message.message,
            parts,
            timing,
          });
          timing.mark("socketAccepted");
        } else if (message.action === "stop") {
          await execution.stop(connected, message.chatId);
        } else if (message.action === "compact") {
          await execution.enqueue(connected, message.chatId, {
            kind: "compact",
            locale: message.locale,
          });
        } else {
          if (!message.campaignId) throw new ChatError("INVALID_REQUEST", 400);
          await execution.enqueue(connected, message.chatId, {
            kind: "resume",
            locale: message.locale,
            campaignId: message.campaignId,
          });
        }
        send({ type: "accepted", requestId });
      })()
        .catch((error: unknown) => failure(error, requestId))
        .finally(() => {
          pendingCommands--;
          admitting.delete(accepting);
          armIdle();
        });
      if (
        message.type === "chat.send" ||
        (message.type === "chat.action" && message.action !== "stop")
      )
        admitting.add(accepting);
    });
  }

  return {
    attach(server: Server) {
      server.on("upgrade", (request, socket, head) => {
        const origin = request.headers.origin ?? "";
        const extensionOwned = /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
        if (
          request.url !== workspaceSocketPath ||
          (!extensionOwned && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000"))
        ) {
          socket.destroy();
          return;
        }
        sockets.handleUpgrade(request, socket, head, (connection) =>
          start(connection, extensionOwned),
        );
      });
    },
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await Promise.all(sessions);
    },
  };
}
