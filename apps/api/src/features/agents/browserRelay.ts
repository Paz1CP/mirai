import { createHash, randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { and, eq, gt, sql } from "drizzle-orm";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type { createDatabase } from "../../infrastructure/database/client.js";
import type { createControllerRepository } from "../sessions/controllerRepository.js";
import type { AgentRelay } from "./agentRelay.js";
import { BrowserModel } from "./playwright/browserModel.js";
import { browserRoutes, browserTickets } from "./schema.js";

export interface BrowserBinding {
  accountId: string;
  model: BrowserModel;
  cdp?: WebSocket;
  dispose(): void;
}
const extensionPath = "/v1/browser/extension";
const protocol = "mirai.browser.v1";
const renewalProtocol = "mirai.browser.v2";
const pingIntervalMs = 15_000;
const streamLifetimeMs = 4 * 60_000;
const frameSchema = z.object({
  method: z.string().optional(),
  params: z.array(z.unknown()).optional(),
});
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const room = (accountId: string, instanceId: string) => JSON.stringify([accountId, instanceId]);

export function createBrowserRelay(
  controller: ReturnType<typeof createControllerRepository>,
  db: ReturnType<typeof createDatabase>["db"],
  relay: AgentRelay,
) {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 32 * 1024 * 1024,
    handleProtocols: (protocols) =>
      protocols.has(renewalProtocol) ? renewalProtocol : protocols.has(protocol) ? protocol : false,
  });
  const connections = new Map<string, { socket: WebSocket; tabs: Map<number, unknown> }>();
  const byController = (accountId: string, instanceId: string) =>
    and(eq(browserRoutes.accountId, accountId), eq(browserRoutes.instanceId, instanceId));
  async function routeFor(accountId: string, instanceId: string) {
    return (
      await db
        .select({ socketId: browserRoutes.socketId })
        .from(browserRoutes)
        .where(and(byController(accountId, instanceId), gt(browserRoutes.expiresAt, sql`now()`)))
    )[0]?.socketId;
  }
  relay.handle("browser-sync", async (id) => {
    const target = connections.get(id);
    if (target?.socket.readyState === WebSocket.OPEN) return [...target.tabs.values()];
  });
  relay.listen("browser-command", (id, data) => {
    const target = connections.get(id);
    if (target?.socket.readyState !== WebSocket.OPEN || typeof data !== "string") return;
    target.socket.send(data, (error) => {
      if (error) target.socket.terminate();
    });
  });

  async function bindingFor(accountId: string, instanceId: string, signal: AbortSignal) {
    const socketId = await routeFor(accountId, instanceId);
    if (!socketId) return;
    const key = room(accountId, instanceId);
    const wire = new EventEmitter();
    let disposed = false;
    const binding: BrowserBinding = {
      accountId,
      dispose() {
        if (disposed) return;
        disposed = true;
        unlisten();
        unlistenDisconnect();
        signal.removeEventListener("abort", binding.dispose);
        binding.cdp?.terminate();
        wire.emit("close", 1000, Buffer.alloc(0));
      },
      model: new BrowserModel(
        {
          get readyState() {
            return disposed ? WebSocket.CLOSED : WebSocket.OPEN;
          },
          on: (event, listener) => {
            wire.on(event, listener);
          },
          close: () => binding.dispose(),
          async send(data) {
            signal.throwIfAborted();
            const [id, present] = await Promise.all([
              routeFor(accountId, instanceId),
              controller.validatePresence(accountId, instanceId),
            ]);
            if (!id || !present) throw new Error("BROWSER_NOT_CONNECTED");
            signal.throwIfAborted();
            await relay.send("browser-command", id, data);
          },
        },
        {
          onInitialized() {},
          onClose: () => binding.dispose(),
          sendToCDPClient(message) {
            if (binding.cdp?.readyState === WebSocket.OPEN)
              binding.cdp.send(JSON.stringify(message));
          },
        },
      ),
    };
    const unlisten = relay.listen("browser-event", (route, data) => {
      if (route === key && typeof data === "string") wire.emit("message", Buffer.from(data));
    });
    const unlistenDisconnect = relay.listen("transport-lost", () => binding.dispose());
    signal.addEventListener("abort", binding.dispose, { once: true });
    try {
      const tabs = await relay.request<unknown[]>(
        "browser-sync",
        socketId,
        null,
        AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      );
      for (const tab of tabs)
        wire.emit(
          "message",
          Buffer.from(JSON.stringify({ method: "chrome.tabs.onCreated", params: [tab] })),
        );
      return binding;
    } catch (error) {
      binding.dispose();
      throw error;
    }
  }

  async function issue(accountId: string, instanceId: string, renew = false) {
    if (!renew && (await routeFor(accountId, instanceId))) return { ready: true as const };
    const ticket = randomBytes(32).toString("hex");
    await db.transaction(async (tx) => {
      await tx.delete(browserTickets).where(sql`${browserTickets.expiresAt} < now()`);
      await tx.insert(browserTickets).values({
        digest: digest(ticket),
        accountId,
        instanceId,
        expiresAt: new Date(Date.now() + 30_000),
      });
    });
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
      const extensionId = process.env.MIRAI_CHROME_EXTENSION_ID;
      if (
        request.url !== extensionPath ||
        !/^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
        !(selected?.includes(protocol) || selected?.includes(renewalProtocol)) ||
        !token ||
        (extensionId && origin !== `chrome-extension://${extensionId}`)
      ) {
        connection.destroy();
        return;
      }
      void (async () => {
        const [ticket] = await db
          .delete(browserTickets)
          .where(
            and(eq(browserTickets.digest, digest(token)), gt(browserTickets.expiresAt, sql`now()`)),
          )
          .returning();
        if (
          !ticket ||
          !(await controller.validatePresence(ticket.accountId, ticket.instanceId)) ||
          connection.destroyed
        ) {
          connection.destroy();
          return;
        }
        await relay.ready();
        sockets.handleUpgrade(request, connection, head, (socket) => {
          const { accountId, instanceId } = ticket;
          const id = randomUUID();
          const key = room(accountId, instanceId);
          const tabs = new Map<number, unknown>();
          const ownsRoute = and(
            byController(accountId, instanceId),
            eq(browserRoutes.socketId, id),
          );
          const expiresAt = () => new Date(Date.now() + 40_000);
          let ready = false;
          let pending: Promise<unknown> = Promise.resolve();
          const lifetime = setTimeout(
            () => socket.close(4000, "Connection renewal required"),
            streamLifetimeMs,
          );
          let awaitingPong = false;
          const ping = setInterval(() => {
            if (awaitingPong) socket.terminate();
            else if (socket.readyState === WebSocket.OPEN) {
              awaitingPong = true;
              socket.ping();
            }
          }, pingIntervalMs).unref();
          socket.on("pong", () => {
            awaitingPong = false;
            if (ready)
              void db
                .update(browserRoutes)
                .set({ expiresAt: expiresAt() })
                .where(ownsRoute)
                .catch(() => socket.terminate());
          });
          socket.on("error", () => socket.terminate());
          socket.on("message", (data) => {
            pending = pending
              .then(async () => {
                const value = String(data);
                const frame = frameSchema.parse(JSON.parse(value));
                if (frame.method === "mirai.keepalive") return;
                if (frame.method === "chrome.tabs.onCreated") {
                  const tab = z.object({ id: z.number().int() }).parse(frame.params?.[0]);
                  tabs.set(tab.id, frame.params?.[0]);
                } else if (frame.method === "chrome.tabs.onRemoved") {
                  tabs.delete(z.number().int().parse(frame.params?.[0]));
                }
                if (!ready) {
                  if (frame.method !== "extension.initialized") return;
                  if (
                    socket.readyState !== WebSocket.OPEN ||
                    !(await controller.validatePresence(accountId, instanceId))
                  )
                    return socket.close();
                  await db
                    .insert(browserRoutes)
                    .values({ accountId, instanceId, socketId: id, expiresAt: expiresAt() })
                    .onConflictDoUpdate({
                      target: browserRoutes.accountId,
                      set: { instanceId, socketId: id, expiresAt: expiresAt() },
                    });
                  ready = true;
                  connections.set(id, { socket, tabs });
                  if (socket.protocol === renewalProtocol)
                    socket.send(JSON.stringify({ method: "mirai.connectionReady" }));
                  return;
                }
                await relay.send("browser-event", key, value);
              })
              .catch(() => socket.terminate());
          });
          socket.once("close", () => {
            clearTimeout(lifetime);
            clearInterval(ping);
            connections.delete(id);
            void pending
              .then(async () => {
                const removed = await db.delete(browserRoutes).where(ownsRoute).returning();
                if (removed.length) {
                  await relay.send("browser-disconnected", key, true);
                  await controller.browserDisconnected(accountId, instanceId);
                }
              })
              .catch(() => console.warn({ event: "browser_disconnect_notification_failed" }));
          });
        });
      })().catch(() => connection.destroy());
    });
  }
  return { issue, attach, bindingFor };
}
