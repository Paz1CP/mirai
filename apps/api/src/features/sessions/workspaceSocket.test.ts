import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  extensionReadyFrame,
  workspaceSocketPath,
  workspaceServerSchema,
  type WorkspaceClientFrame,
  type WorkspaceServerFrame,
} from "@mirai/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { ChatOwner, createChatExecution } from "../agents/chatExecution.js";
import { createControllerRepository } from "./controllerRepository.js";
import { createWorkspaceSocket } from "./workspaceSocket.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

vi.mock("pg", async () => {
  const { EventEmitter } = await import("node:events");
  const clients = new Set<Client>();
  const leases = new Map<string, Promise<void>>();
  let current: string | undefined;
  class Client extends EventEmitter {
    private readonly closed = deferred();
    private notice?: string;
    private lease?: string;

    async connect() {
      clients.add(this);
    }
    async end() {
      clients.delete(this);
      if (this.lease) leases.delete(this.lease);
      this.closed.resolve();
    }
    async query(sql: string, values: string[] = []) {
      if (sql.startsWith("INSERT")) current ??= values[1];
      if (sql.startsWith("SELECT instance_id")) return { rows: [{ instance_id: current }] };
      if (sql.includes("pg_try_advisory_xact_lock"))
        return { rows: [{ available: !leases.has(values[0]!) }] };
      if (sql.includes("pg_advisory_lock")) {
        this.lease = values[0]!;
        leases.set(this.lease, this.closed.promise);
      }
      if (sql.includes("pg_advisory_xact_lock")) await leases.get(values[0]!);
      if (sql.startsWith("UPDATE")) current = values[1];
      if (sql.includes("pg_notify")) this.notice = values[0];
      if (sql === "COMMIT" && this.notice)
        for (const client of clients)
          client.emit("notification", { channel: "mirai_control", payload: this.notice });
      return { rows: [] };
    }
  }
  return { Client };
});

type Execution = ReturnType<typeof createChatExecution>;
type Browser = Parameters<Parameters<typeof createWorkspaceSocket>[3]>[0];

afterEach(() => vi.unstubAllEnvs());

it("streams and correlates Chrome commands on the owning socket and drains it before a new replica takes control", async () => {
  const origin = "https://mirai.example";
  vi.stubEnv("WEB_ORIGIN", origin);
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  const servers: {
    http: ReturnType<typeof createServer>;
    workspace: ReturnType<typeof createWorkspaceSocket>;
  }[] = [];
  const clients: WebSocket[] = [];
  const chatId = "chat";
  const drain = deferred();

  async function replica() {
    const enqueue = vi.fn<Execution["enqueue"]>(async (owner) => {
      const at = new Date().toISOString();
      for (const text of ["Ho", "la"]) {
        owner.send(chatId, {
          type: "event",
          partial: true,
          event: { id: "delta", role: "assistant", at, parts: [{ type: "text", text }] },
        });
      }
    });
    const disconnect = vi.fn<Execution["disconnect"]>(() => drain.promise);
    const browser = vi.fn<(binding: Browser) => Promise<undefined>>().mockResolvedValue(undefined);
    const workspace = createWorkspaceSocket(
      createControllerRepository(),
      { enqueue, disconnect } as unknown as Execution,
      async (authorization) => (authorization === "Bearer valid" ? "account" : null),
      browser,
    );
    const http = createServer();
    servers.push({ http, workspace });
    workspace.attach(http);
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP port");
    const url = `ws://127.0.0.1:${address.port}${workspaceSocketPath}`;
    return { url, enqueue, disconnect, browser };
  }

  async function open(url: string, expectedInstanceId?: string, token = "valid") {
    const transport = new WebSocket(url, { origin });
    clients.push(transport);
    const frames: WorkspaceServerFrame[] = [];
    transport.on("message", (data) =>
      frames.push(workspaceServerSchema.parse(JSON.parse(data.toString()))),
    );
    await once(transport, "open");
    const send = (frame: WorkspaceClientFrame) => transport.send(JSON.stringify(frame));
    send({ type: "open", token, expectedInstanceId });
    async function take<T extends WorkspaceServerFrame["type"]>(type: T) {
      await vi.waitFor(() => expect(frames.some((frame) => frame.type === type)).toBe(true));
      return frames.splice(
        frames.findIndex((frame) => frame.type === type),
        1,
      )[0] as Extract<WorkspaceServerFrame, { type: T }>;
    }
    return { transport, frames, send, take };
  }

  try {
    const first = await replica();
    const second = await replica();
    const rejectedLogin = await open(first.url, undefined, "invalid");
    expect(await rejectedLogin.take("error")).toMatchObject({ code: "AUTH_REQUIRED" });
    const a = await open(first.url);
    const { instanceId } = await a.take("control.ready");
    const bPreview = await open(second.url);
    expect(await bPreview.take("error")).toMatchObject({ code: "CONTROL_CONFLICT", instanceId });
    expect(first.disconnect).not.toHaveBeenCalled();

    const requestId = randomUUID();
    a.send({
      type: "chat.send",
      requestId,
      chatId,
      message: { id: randomUUID(), instanceId, text: "Hola", locale: "es" },
    });
    expect(await a.take("accepted")).toMatchObject({ requestId });
    for (const text of ["Ho", "la"])
      expect(await a.take("chat.event")).toMatchObject({
        chatId,
        event: { partial: true, event: { parts: [{ text }] } },
      });
    const owner: ChatOwner = first.enqueue.mock.calls[0]![0];
    expect(second.enqueue).not.toHaveBeenCalled();
    a.send({ type: "browser.frame", frame: extensionReadyFrame });
    await vi.waitFor(async () => {
      await owner.browser("es", owner.signal);
      expect(first.browser).toHaveBeenCalled();
    });
    const binding = first.browser.mock.calls[0]![0];
    const tab = binding.model.handleCDPCommand(
      "Target.createTarget",
      { url: "https://example.com" },
      undefined,
    );
    for (const [method, result] of [
      ["chrome.tabs.create", { id: 42 }],
      ["chrome.debugger.attach", undefined],
      ["chrome.debugger.sendCommand", { targetInfo: { targetId: "target" } }],
    ] as const) {
      const response = await a.take("browser.frame");
      const command = JSON.parse(response.frame) as { id: number; method: string };
      expect(command).toMatchObject({ id: expect.any(Number), method });
      a.send({ type: "browser.frame", frame: JSON.stringify({ id: command.id, result }) });
    }
    await expect(tab).resolves.toEqual({ targetId: "target" });

    const pending = binding.model.handleCDPCommand("Target.createTarget", undefined, undefined);
    const rejected = expect(pending).rejects.toThrow();
    await a.take("browser.frame");
    const b = await open(second.url, instanceId);
    await a.take("control.lost");
    await rejected;
    expect(owner.signal.aborted).toBe(true);
    expect(first.disconnect).toHaveBeenCalledWith(owner);
    expect(b.frames).toEqual([]);
    expect(a.transport.readyState).toBe(WebSocket.OPEN);
    expect(second.enqueue).not.toHaveBeenCalled();
    drain.resolve();
    const ready = await b.take("control.ready");
    expect(ready.instanceId).not.toBe(instanceId);
    expect(second.enqueue).not.toHaveBeenCalled();

    b.send({
      type: "chat.send",
      requestId,
      chatId,
      message: { id: randomUUID(), instanceId: ready.instanceId, text: "Continúa", locale: "es" },
    });
    await b.take("accepted");
    b.transport.close();
    await vi.waitFor(() => expect(second.disconnect).toHaveBeenCalledOnce());
    expect(second.enqueue.mock.calls[0]![0].signal.aborted).toBe(true);
    expect(second.enqueue).toHaveBeenCalledOnce();
  } finally {
    drain.resolve();
    for (const client of clients) client.terminate();
    await Promise.all(
      servers.map(async ({ http, workspace }) => {
        await workspace.close();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      }),
    );
  }
});
