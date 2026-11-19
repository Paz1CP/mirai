import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { createControllerRepository } from "../sessions/controllerRepository.js";
import { BrowserModel } from "./playwright/browserModel.js";

export interface BrowserBinding {
  accountId: string;
  instanceId: string;
  ready: boolean;
  model: BrowserModel;
  cdp?: WebSocket;
  socket: WebSocket;
}
type Ticket = { accountId: string; instanceId: string; deadline: number };
const extensionPath = "/v1/browser/extension";
const protocol = "mirai.browser.v1";
const pingIntervalMs = 15000;

export function createBrowserRelay(controller: ReturnType<typeof createControllerRepository>) {
  const tickets = new Map<string, Ticket>();
  const bindings = new Map<string, BrowserBinding>();
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 32 * 1024 * 1024,
    handleProtocols: (protocols) => (protocols.has(protocol) ? protocol : false),
  });
  let notifyDisconnect: ((accountId: string, instanceId: string) => void) | undefined;

  function disconnect(accountId: string, instanceId: string) {
    const binding = bindings.get(accountId);
    if (binding?.instanceId !== instanceId) return;
    bindings.delete(accountId);
    binding.cdp?.terminate();
    binding.model.close("Mirai controller disconnected");
    notifyDisconnect?.(accountId, instanceId);
  }
  function bindingFor(accountId: string, instanceId: string) {
    const binding = bindings.get(accountId);
    return binding?.instanceId === instanceId &&
      binding.ready &&
      binding.socket.readyState === WebSocket.OPEN
      ? binding
      : undefined;
  }
  function issue(accountId: string, instanceId: string) {
    if (bindingFor(accountId, instanceId)) return { ready: true as const };
    const now = Date.now();
    for (const [id, ticket] of tickets) {
      if (ticket.deadline <= now || ticket.accountId === accountId) tickets.delete(id);
    }
    const ticket = randomBytes(32).toString("hex");
    tickets.set(ticket, { accountId, instanceId, deadline: now + 30_000 });
    return { ready: false as const, ticket };
  }
  function attach(server: Server) {
    server.on("upgrade", (request, connection, head) => {
      const origin = request.headers.origin ?? "";
      const selected = request.headers["sec-websocket-protocol"]
        ?.split(",")
        .map((value) => value.trim());
      const token = selected
        ?.find((value) => /^mirai-ticket\.[a-f0-9]{64}$/.test(value))
        ?.slice(13);
      const ticket = token ? tickets.get(token) : undefined;
      if (
        request.url !== extensionPath ||
        !/^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
        !selected?.includes(protocol) ||
        !token ||
        !ticket ||
        ticket.deadline <= Date.now()
      ) {
        connection.destroy();
        return;
      }
      const extensionId = process.env.MIRAI_CHROME_EXTENSION_ID;
      if (extensionId && origin !== `chrome-extension://${extensionId}`) {
        connection.destroy();
        return;
      }
      tickets.delete(token);
      void controller.validatePresence(ticket.accountId, ticket.instanceId).then(
        (present) => {
          if (!present || connection.destroyed) {
            connection.destroy();
            return;
          }
          sockets.handleUpgrade(request, connection, head, (socket) => {
            const old = bindings.get(ticket.accountId);
            if (old) disconnect(old.accountId, old.instanceId);
            const binding: BrowserBinding = {
              accountId: ticket.accountId,
              instanceId: ticket.instanceId,
              ready: false,
              socket,
              model: new BrowserModel(socket, {
                onInitialized: () => {
                  binding.ready = true;
                },
                sendToCDPClient: (message) => {
                  if (binding.cdp?.readyState === WebSocket.OPEN)
                    binding.cdp.send(JSON.stringify(message));
                },
                onClose: () => {
                  if (bindings.get(ticket.accountId) === binding)
                    disconnect(ticket.accountId, ticket.instanceId);
                },
              }),
            };
            bindings.set(ticket.accountId, binding);
            let awaitingPong = false;
            const ping = setInterval(() => {
              if (awaitingPong) socket.terminate();
              else if (socket.readyState === WebSocket.OPEN) {
                awaitingPong = true;
                socket.ping();
              }
            }, pingIntervalMs);
            ping.unref();
            socket.on("pong", () => {
              awaitingPong = false;
            });
            socket.once("close", () => {
              clearInterval(ping);
              if (bindings.get(ticket.accountId) === binding)
                disconnect(ticket.accountId, ticket.instanceId);
            });
          });
        },
        () => connection.destroy(),
      );
    });
  }
  return {
    issue,
    attach,
    bindingFor,
    disconnect,
    onDisconnect(listener: (accountId: string, instanceId: string) => void) {
      notifyDisconnect = listener;
    },
  };
}
