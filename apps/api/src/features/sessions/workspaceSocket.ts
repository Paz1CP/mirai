import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import {
  extensionReadyFrame,
  workspaceClientSchema,
  workspaceFrameLimit,
  workspaceSocketPath,
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

// Leave Cloud Run time to drain writes before the 300-second request deadline.
const lifetimeMs = 4 * 60_000;

export function createWorkspaceSocket(
  controller: ReturnType<typeof createControllerRepository>,
  execution: ReturnType<typeof createChatExecution> | undefined,
  verifyIdentity: (header?: string) => Promise<string | null>,
  openBrowser: (
    browser: WorkspaceBrowser,
    locale: "en" | "es",
    signal: AbortSignal,
  ) => ReturnType<ChatOwner["browser"]>,
) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: workspaceFrameLimit });
  const sessions = new Set<Promise<void>>();

  function start(socket: WebSocket) {
    const started = Date.now();
    const abort = new AbortController();
    let owner: ChatOwner | undefined;
    const instanceId = randomUUID();
    let listener: Client | undefined;
    let opening: Promise<void> | undefined;
    let browser: WorkspaceBrowser | undefined;
    let wire: EventEmitter | undefined;
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    sessions.add(settled);
    const send = (frame: WorkspaceServerFrame) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    };
    function resetBrowser(reopen = false) {
      if (browser) {
        browser.ready = false;
        browser.cdp?.terminate();
        wire?.emit("close", 1000, Buffer.alloc(0));
      }
      browser = undefined;
      wire = undefined;
      if (reopen) send({ type: "browser.reset" });
    }
    function finish(releaseRequestId?: string) {
      if (abort.signal.aborted) return;
      abort.abort();
      clearTimeout(timeout);
      clearInterval(heartbeat);
      const draining = owner && execution?.disconnect(owner);
      resetBrowser();
      void (async () => {
        try {
          await opening?.catch(() => {});
          await draining;
          if (releaseRequestId) send({ type: "accepted", requestId: releaseRequestId });
        } finally {
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
    socket.on("pong", () => {
      awaitingPong = false;
    });
    socket.once("close", () => finish());
    socket.once("error", () => finish());

    function controlLost(id: string | null) {
      send({ type: "control.lost", instanceId: id });
      finish();
    }
    async function acquire(token: string, expectedInstanceId?: string) {
      const accountId = await verifyIdentity(`Bearer ${token}`);
      abort.signal.throwIfAborted();
      if (!accountId) throw new ChatError("AUTH_REQUIRED", 401);
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
          };
          if (event.accountId !== accountId) return;
          if (notice.channel === "mirai_results") {
            if (owner) send({ type: "results.changed" });
          } else if (
            notice.channel === "mirai_control" &&
            event.previousInstanceId === instanceId
          ) {
            controlLost(event.instanceId ?? null);
          }
        } catch {
          /* Ignore malformed notifications. */
        }
      });
      await listener.connect();
      await listener.query("LISTEN mirai_control");
      await listener.query("LISTEN mirai_results");
      abort.signal.throwIfAborted();
      await controller.connect(listener, accountId, instanceId, expectedInstanceId);
      abort.signal.throwIfAborted();
      owner = {
        accountId,
        signal: abort.signal,
        send: (chatId, event) => send({ type: "chat.event", chatId, event }),
        browser: async (locale, signal) =>
          browser?.ready ? openBrowser(browser, locale, signal) : undefined,
      };
      send({ type: "control.ready", instanceId });
    }
    function receiveBrowser(frame: string, accountId: string) {
      if (!browser) {
        if (frame !== extensionReadyFrame) return;
        const currentWire = new EventEmitter();
        const binding: WorkspaceBrowser = {
          accountId,
          ready: false,
          model: new BrowserModel(
            {
              get readyState() {
                return binding.ready ? socket.readyState : WebSocket.CLOSED;
              },
              send: (frame) => send({ type: "browser.frame", frame }),
              close: () => resetBrowser(),
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
        browser = binding;
        wire = currentWire;
      }
      wire?.emit("message", Buffer.from(frame));
    }
    function failure(error: unknown, requestId?: string) {
      if (abort.signal.aborted) return;
      const code =
        error instanceof ChatError ||
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
      if (abort.signal.aborted) return;
      let candidate: unknown;
      try {
        if (!binary) candidate = JSON.parse(raw.toString()) as unknown;
      } catch {
        /* Invalid frame. */
      }
      const parsed = workspaceClientSchema.safeParse(candidate);
      if (!parsed.success) return failure(new ChatError("INVALID_REQUEST", 400));
      const message = parsed.data;
      if (message.type === "open") {
        if (opening) return failure(new ChatError("INVALID_REQUEST", 400));
        clearTimeout(timeout);
        timeout = setTimeout(expire, Math.max(1, lifetimeMs - (Date.now() - started)));
        opening = acquire(message.token, message.expectedInstanceId);
        void opening.catch((error: unknown) => failure(error));
        return;
      }
      const connected = owner;
      if (!connected) return failure(new ChatError("CONTROL_REQUIRED", 409));
      if (message.type === "browser.frame")
        return receiveBrowser(message.frame, connected.accountId);
      if (message.type === "browser.closed") return resetBrowser();
      const { requestId } = message;
      void (async () => {
        if (message.type === "control.release") {
          finish(requestId);
          return;
        }
        if (!execution) throw new ChatError("AGENT_NOT_CONFIGURED", 503);
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
          const stopped = execution.stop(connected, message.chatId);
          if (stopped) resetBrowser(true);
          await stopped;
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
      })().catch((error: unknown) => failure(error, requestId));
    });
  }

  return {
    attach(server: Server) {
      server.on("upgrade", (request, socket, head) => {
        if (
          request.url !== workspaceSocketPath ||
          request.headers.origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")
        ) {
          socket.destroy();
          return;
        }
        sockets.handleUpgrade(request, socket, head, start);
      });
    },
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await Promise.all(sessions);
    },
  };
}
