import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { Client } from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { executionLockKey } from "../applications/resultsRepository.js";
import {
  browserLockKey,
  type createControllerRepository,
} from "../sessions/controllerRepository.js";
import { BrowserModel } from "./playwright/browserModel.js";

export interface BrowserBinding {
  accountId: string;
  instanceId: string;
  socket: WebSocket;
  ready: boolean;
  model: BrowserModel;
  cdp?: WebSocket;
}
const protocol = "mirai.browser.v2";

export function createBrowserRelay(
  controller: Pick<ReturnType<typeof createControllerRepository>, "validatePresence" | "depart">,
) {
  const tickets = new Map<string, { accountId: string; instanceId: string; expires: number }>();
  const bindings = new Map<string, BrowserBinding & { wire: EventEmitter }>();
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 32 * 1024 * 1024,
    handleProtocols: (protocols) => (protocols.has(protocol) ? protocol : false),
  });

  function bindingFor(accountId: string, instanceId: string) {
    const binding = bindings.get(accountId);
    if (
      binding?.instanceId === instanceId &&
      binding.ready &&
      binding.socket.readyState === WebSocket.OPEN
    )
      return binding;
  }
  function issue(accountId: string, instanceId: string, renew = false) {
    if (!renew && bindingFor(accountId, instanceId)) return { ready: true as const };
    for (const [token, ticket] of tickets)
      if (ticket.expires <= Date.now() || ticket.accountId === accountId) tickets.delete(token);
    const ticket = randomBytes(32).toString("hex");
    tickets.set(ticket, { accountId, instanceId, expires: Date.now() + 30_000 });
    return { ready: false as const, ticket };
  }

  function disconnect(accountId: string, instanceId: string) {
    const binding = bindings.get(accountId);
    if (binding?.instanceId !== instanceId) return;
    bindings.delete(accountId);
    binding.ready = false;
    binding.cdp?.terminate();
    binding.socket.close();
    binding.wire.emit("close", 1000, Buffer.alloc(0));
  }

  function attach(server: Server) {
    server.on("upgrade", (request, connection, head) => {
      const origin = request.headers.origin ?? "";
      const protocols = request.headers["sec-websocket-protocol"]
        ?.split(",")
        .map((value) => value.trim());
      const token = protocols
        ?.find((value) => /^mirai-ticket\.[a-f0-9]{64}$/.test(value))
        ?.slice(13);
      const ticket = token && tickets.get(token);
      const extensionId = process.env.MIRAI_CHROME_EXTENSION_ID;
      if (
        request.url !== "/v1/browser/extension" ||
        !protocols?.includes(protocol) ||
        !/^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
        (extensionId && origin !== `chrome-extension://${extensionId}`) ||
        !ticket ||
        ticket.expires <= Date.now()
      ) {
        connection.destroy();
        return;
      }
      tickets.delete(token);
      const { accountId, instanceId } = ticket;
      const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT;
      if (!connectionString) return connection.destroy();
      const listener = new Client({
        connectionString,
        connectionTimeoutMillis: 5000,
        keepAlive: true,
      });
      let browserSocket: WebSocket | undefined;
      let retired = false;
      const closeTransport = () => {
        if (browserSocket) browserSocket.terminate();
        else connection.destroy();
      };
      const endLease = () => void listener.end().catch(() => {});
      connection.once("close", endLease);
      listener.on("error", closeTransport);
      listener.on("end", closeTransport);
      listener.on("notification", (notice) => {
        if (retired || notice.channel !== "mirai_control") return;
        try {
          const event = JSON.parse(notice.payload ?? "{}") as {
            accountId?: string;
            instanceId?: string | null;
            type?: string;
          };
          if (
            event.accountId !== accountId ||
            event.instanceId === instanceId ||
            (event.type !== "control.transferred" && event.type !== "control.revoked")
          )
            return;
          retired = true;
          const binding = bindings.get(accountId);
          if (binding?.instanceId === instanceId) binding.ready = false;
          // The execution releases its lock after persisting results and closing Playwright.
          void listener
            .query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
              executionLockKey(accountId),
            ])
            .then(() => {
              if (browserSocket) browserSocket.close(4002, "Mirai controller replaced");
              else connection.destroy();
            }, closeTransport);
        } catch {
          // Unrelated notifications have no authority over the browser connection.
        }
      });
      void listener
        .connect()
        .then(async () => {
          await listener.query("LISTEN mirai_control");
          await listener.query("SELECT pg_advisory_lock_shared(hashtextextended($1,0))", [
            browserLockKey(accountId),
          ]);
          return !retired && controller.validatePresence(accountId, instanceId);
        })
        .then((present) => {
          if (!present || retired || connection.destroyed) return connection.destroy();
          sockets.handleUpgrade(request, connection, head, (socket) => {
            browserSocket = socket;
            connection.off("close", endLease);
            const old = bindings.get(accountId);
            if (old && old.instanceId !== instanceId) disconnect(accountId, old.instanceId);
            const wire = old?.instanceId === instanceId ? old.wire : new EventEmitter();
            const binding: BrowserBinding & { wire: EventEmitter } =
              old?.instanceId === instanceId
                ? old
                : {
                    accountId,
                    instanceId,
                    wire,
                    socket,
                    ready: false,
                    model: new BrowserModel(
                      {
                        get readyState() {
                          return binding.ready ? binding.socket.readyState : WebSocket.CLOSING;
                        },
                        send(data) {
                          binding.socket.send(data);
                        },
                        close() {
                          disconnect(accountId, instanceId);
                        },
                        on(event, listener) {
                          wire.on(event, listener);
                        },
                      },
                      {
                        onInitialized() {
                          binding.ready = true;
                        },
                        onClose() {},
                        sendToCDPClient(message) {
                          if (binding.cdp?.readyState === WebSocket.OPEN)
                            binding.cdp.send(JSON.stringify(message));
                        },
                      },
                    ),
                  };
            let initialized = false;
            socket.on("error", () => socket.terminate());
            socket.on("message", (data) => {
              if (retired) return;
              if (initialized && bindings.get(accountId) !== binding) return;
              if (!initialized) {
                if (data.toString() !== '{"method":"extension.initialized","params":[]}') {
                  if (!old?.ready) wire.emit("message", data);
                  return;
                }
                initialized = true;
                binding.socket = socket;
                bindings.set(accountId, binding);
                wire.emit("message", data);
                socket.send('{"method":"mirai.connectionReady"}');
                return;
              }
              wire.emit("message", data);
            });
            const lifetime = setTimeout(
              () => socket.close(4000, "Connection renewal required"),
              4 * 60_000,
            );
            let awaitingPong = false;
            const heartbeat = setInterval(() => {
              if (awaitingPong) socket.terminate();
              else if (socket.readyState === WebSocket.OPEN) {
                awaitingPong = true;
                socket.ping();
              }
            }, 15_000).unref();
            socket.on("pong", () => {
              awaitingPong = false;
            });
            socket.once("close", (code) => {
              clearTimeout(lifetime);
              clearInterval(heartbeat);
              if (binding.socket === socket && bindings.get(accountId) === binding) {
                disconnect(accountId, instanceId);
                if (code === 4001) void controller.depart(accountId, instanceId).catch(() => {});
              }
              endLease();
            });
          });
        })
        .catch(() => connection.destroy());
    });
  }
  return {
    issue,
    attach,
    bindingFor,
    disconnect,
    close: () => {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
    },
  };
}
