import { randomUUID } from "node:crypto";
import { createEvent, type Event } from "@google/adk";
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
import { createChatExecution, type ChatOwner } from "../agents/chatExecution.js";
import { BillingError } from "../billing/walletRepository.js";
import { createControllerRepository } from "./controllerRepository.js";
import { createWorkspaceSocket } from "./workspaceSocket.js";

const workspaceRenewalMs = 59 * 60_000;

it("reattaches a page with all active chats and renews an extension workspace across replicas", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  const chatIds = ["chat-a", "chat-b", "chat-c", "chat-d"];
  const peers: WebSocket[] = [];
  const resources: {
    server: ReturnType<typeof createServer>;
    socket: ReturnType<typeof createWorkspaceSocket>;
  }[] = [];
  const browserOrigin = `chrome-extension://${"a".repeat(32)}`;
  const tabId = randomUUID();
  const active = new Map<string, ChatOwner>();
  const browser = vi.fn<(binding: Browser) => Promise<undefined>>().mockResolvedValue(undefined);
  const suspended = vi.fn(async (owner: ChatOwner) => {
    for (const [chatId, candidate] of active) if (candidate === owner) active.delete(chatId);
  });
  const stop = vi.fn(async (_owner: ChatOwner, chatId: string) => {
    active.delete(chatId);
  });
  const markRunning = async (owner: ChatOwner, chatId: string) => {
    active.set(chatId, owner);
    owner.send(chatId, { type: "status", working: true, error: null });
  };
  const enqueue = vi.fn(markRunning);
  const resume = vi.fn(markRunning);
  async function replica() {
    const socket = createWorkspaceSocket(
      createControllerRepository(),
      {
        enqueue,
        suspend: suspended,
        runningChats: (owner: ChatOwner) =>
          [...active].flatMap(([chatId, candidate]) =>
            owner === candidate ? [{ chatId, turn: undefined, partials: [] }] : [],
          ),
        disconnect: async (owner: ChatOwner) => {
          for (const [chatId, candidate] of active) if (candidate === owner) active.delete(chatId);
        },
        resumeRenewal: resume,
        stop,
        discardRenewal: vi.fn(),
      } as unknown as Execution,
      async (authentication) =>
        authentication === "Bearer valid"
          ? "account"
          : authentication === "Bearer other"
            ? "other-account"
            : null,
      browser,
    );
    const server = createServer();
    resources.push({ server, socket });
    socket.attach(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP port");
    return `ws://127.0.0.1:${address.port}${workspaceSocketPath}`;
  }
  async function connect(url: string, frame: WorkspaceClientFrame) {
    const wire = new WebSocket(url, { origin: browserOrigin });
    peers.push(wire);
    const frames: WorkspaceServerFrame[] = [];
    wire.on("message", (data) =>
      frames.push(workspaceServerSchema.parse(JSON.parse(data.toString()))),
    );
    await once(wire, "open");
    const send = (value: WorkspaceClientFrame) => wire.send(JSON.stringify(value));
    send(frame);
    async function take<T extends WorkspaceServerFrame["type"]>(type: T) {
      await vi.waitFor(() => expect(frames.some((value) => value.type === type)).toBe(true));
      return frames.splice(
        frames.findIndex((value) => value.type === type),
        1,
      )[0] as Extract<WorkspaceServerFrame, { type: T }>;
    }
    return { send, take };
  }
  try {
    const first = await connect(await replica(), {
      type: "open",
      token: "valid",
      accountId: "account",
      tabId,
    });
    const { instanceId } = await first.take("control.ready");
    for (const chatId of chatIds) {
      first.send({
        type: "chat.send",
        requestId: randomUUID(),
        chatId,
        message: { id: randomUUID(), instanceId, text: "fixture", locale: "en" },
      });
      await first.take("accepted");
    }
    first.send({ type: "control.attach", requestId: randomUUID(), token: "other" });
    expect(await first.take("error")).toMatchObject({ code: "AUTH_REQUIRED" });
    const requestId = randomUUID();
    first.send({ type: "control.attach", requestId, token: "valid" });
    expect(await first.take("control.attached")).toMatchObject({
      requestId,
      instanceId,
      activeChats: chatIds.map((chatId) => ({ chatId })),
    });
    expect(enqueue).toHaveBeenCalledTimes(4);
    expect(suspended).not.toHaveBeenCalled();

    const owner = active.get(chatIds[0]!)!;
    await owner.browser(chatIds[0]!, "es", owner.signal);
    await owner.browser(chatIds[1]!, "es", owner.signal);
    const firstBrowser = browser.mock.calls[0]![0];
    const secondBrowser = browser.mock.calls[1]![0];
    const closed = expect(firstBrowser.model.workspaceTabs()).rejects.toThrow("WebSocket closed");
    const healthy = secondBrowser.model.workspaceTabs();
    expect(await first.take("browser.frame")).toMatchObject({ chatId: chatIds[0] });
    const command = await first.take("browser.frame");
    expect(command.chatId).toBe(chatIds[1]);
    first.send({ type: "browser.closed", chatId: chatIds[0] });
    await closed;
    first.send({
      type: "browser.frame",
      chatId: chatIds[1],
      frame: JSON.stringify({ id: JSON.parse(command.frame).id, result: { tabs: [] } }),
    });
    await expect(healthy).resolves.toEqual({ tabs: [] });
    expect(secondBrowser.ready).toBe(true);

    await vi.advanceTimersByTimeAsync(workspaceRenewalMs);
    const { chatIds: renewalChats } = await first.take("control.renew");
    expect(renewalChats).toEqual(chatIds);
    const successor = await connect(await replica(), {
      type: "open",
      tabId,
      accountId: "account",
      expectedInstanceId: instanceId,
      renewal: { chatIds: renewalChats },
    });
    const ready = await successor.take("control.ready");
    expect(ready.activeChats).toEqual(chatIds.map((chatId) => ({ chatId })));
    expect(ready.instanceId).not.toBe(instanceId);
    successor.send({
      type: "chat.action",
      requestId: randomUUID(),
      chatId: "chat-d",
      action: "stop",
      locale: "en",
    });
    await successor.take("accepted");
    expect(resume).not.toHaveBeenCalled();
    successor.send({ type: "control.restore" });
    await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(3));
    expect([...active.keys()]).toEqual(["chat-a", "chat-b", "chat-c"]);
    successor.send({
      type: "chat.action",
      requestId: randomUUID(),
      chatId: "chat-b",
      action: "stop",
      locale: "en",
    });
    await successor.take("accepted");
    expect([...active.keys()]).toEqual(["chat-a", "chat-c"]);
  } finally {
    for (const peer of peers) peer.terminate();
    await Promise.all(
      resources.map(async ({ server, socket }) => {
        await socket.close();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }),
    );
  }
});

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
    private readonly held = new Set<string>();

    async connect() {
      clients.add(this);
    }
    async end() {
      clients.delete(this);
      for (const key of this.held) leases.delete(key);
      this.closed.resolve();
    }
    async query(sql: string, values: string[] = []) {
      if (sql.startsWith("INSERT")) current ??= values[1];
      if (sql.startsWith("SELECT instance_id")) return { rows: [{ instance_id: current }] };
      if (sql.includes("pg_try_advisory_xact_lock"))
        return { rows: [{ available: !leases.has(values[0]!) }] };
      if (sql.includes("pg_try_advisory_lock")) {
        const key = values[0]!;
        if (leases.has(key)) return { rows: [{ locked: false }] };
        this.held.add(key);
        leases.set(key, this.closed.promise);
        return { rows: [{ locked: true }] };
      }
      if (sql.includes("pg_advisory_lock")) {
        this.held.add(values[0]!);
        leases.set(values[0]!, this.closed.promise);
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const workspaceControlHandoffModes = [
  "manual",
  "idle",
  "working",
  "stop",
  "closed",
  "campaign",
  "credit exhausted",
  "abandoned",
  "failed",
] as const;

it.each(workspaceControlHandoffModes)(
  "keeps exclusive control across two replicas during %s handoff",
  async (mode) => {
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
    const working = mode !== "idle" && mode !== "manual";
    const realExecution =
      mode === "campaign" ||
      mode === "credit exhausted" ||
      mode === "abandoned" ||
      mode === "failed";
    const tabId = randomUUID();
    const campaignId = randomUUID();
    const session = { events: [] as Event[] };
    const started = vi.fn();
    const restoredCampaign = vi.fn();
    const application = vi.fn();
    const transitionCampaign = vi.fn().mockResolvedValue(undefined);
    if (mode !== "manual") vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

    async function replica() {
      const position = servers.length;
      const actual = realExecution
        ? createChatExecution(
            {
              executionSession: async () => session,
              rememberExecution: () => {},
              service: {
                async appendEvent({ event }: { event: Event }) {
                  session.events.push(event);
                  return event;
                },
              },
            } as unknown as Parameters<typeof createChatExecution>[0],
            {
              run: async (
                ...[scope, input, , , signal, boundary, , , hidden]: Parameters<
                  Parameters<typeof createChatExecution>[1]["run"]
                >
              ) => {
                if (position === 0) {
                  scope.campaignId = campaignId;
                  scope.runningCampaignId = campaignId;
                  session.events.push(
                    createEvent({
                      author: "user",
                      content: { role: "user", parts: [{ text: input }] },
                      customMetadata: { miraiCommandId: scope.commandId },
                    }),
                  );
                  started();
                  await drain.promise;
                  application({ campaignId, tabId: 42 });
                  boundary();
                } else {
                  expect(hidden).toBe(true);
                  expect(scope.runningCampaignId).toBe(campaignId);
                  expect(input).toContain("inspect Chrome");
                  restoredCampaign();
                  await new Promise<void>((resolve) =>
                    signal.addEventListener("abort", () => resolve(), { once: true }),
                  );
                }
              },
            } as Parameters<typeof createChatExecution>[1],
            {
              transitionCampaign,
              campaignBudget: async () => ({ reached: false }),
            } as unknown as Parameters<typeof createChatExecution>[2],
            undefined,
            {
              ensureCredit: async () => {
                if (position === 1 && mode === "credit exhausted")
                  throw new BillingError("INSUFFICIENT_CREDITS", 402);
              },
            },
          )
        : undefined;
      const enqueue = vi.fn<Execution["enqueue"]>(
        actual?.enqueue ??
          (async (owner) => {
            const at = new Date().toISOString();
            for (const text of ["Ho", "la"]) {
              owner.send(chatId, {
                type: "event",
                partial: true,
                event: { id: "delta", role: "assistant", at, parts: [{ type: "text", text }] },
              });
            }
          }),
      );
      const disconnect = vi.fn<Execution["disconnect"]>(
        actual?.disconnect ?? (() => drain.promise),
      );
      const browser = vi
        .fn<(binding: Browser) => Promise<undefined>>()
        .mockResolvedValue(undefined);
      const runningChats = vi.fn(
        actual?.runningChats ??
          (() => (working ? [{ chatId, turn: undefined, partials: undefined }] : [])),
      );
      const suspend = vi.fn<Execution["suspend"]>(actual?.suspend ?? (() => drain.promise));
      const resumeRenewal = vi.fn<Execution["resumeRenewal"]>(
        actual?.resumeRenewal ?? (async () => {}),
      );
      const discardRenewal = vi.fn<Execution["discardRenewal"]>(
        actual?.discardRenewal ?? (async () => {}),
      );
      const controller = createControllerRepository();
      if (position === 1 && mode === "failed") {
        const waitForPrevious = controller.waitForPrevious;
        vi.spyOn(controller, "waitForPrevious").mockImplementation(async (...args) => {
          await waitForPrevious(...args);
          throw new Error("Failed to confirm control after the previous socket drained");
        });
      }
      const workspace = createWorkspaceSocket(
        controller,
        {
          enqueue,
          disconnect,
          runningChats,
          suspend,
          resumeRenewal,
          discardRenewal,
        } as unknown as Execution,
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
      return { url, enqueue, disconnect, browser, suspend, resumeRenewal, discardRenewal };
    }

    async function open(
      url: string,
      options?: {
        expectedInstanceId?: string;
        token?: string;
        renewal?: { chatId?: string };
        tabId?: string;
      },
    ) {
      const transport = new WebSocket(url, { origin });
      clients.push(transport);
      const frames: WorkspaceServerFrame[] = [];
      transport.on("message", (data) =>
        frames.push(workspaceServerSchema.parse(JSON.parse(data.toString()))),
      );
      await once(transport, "open");
      const send = (frame: WorkspaceClientFrame) => transport.send(JSON.stringify(frame));
      send({ type: "open", token: "valid", ...options });
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
      const rejectedLogin = await open(first.url, { token: "invalid" });
      expect(await rejectedLogin.take("error")).toMatchObject({ code: "AUTH_REQUIRED" });
      const a = await open(first.url, { tabId });
      const { instanceId } = await a.take("control.ready");
      const bPreview = await open(second.url);
      expect(await bPreview.take("error")).toMatchObject({ code: "CONTROL_CONFLICT", instanceId });
      expect(first.disconnect).not.toHaveBeenCalled();

      if (mode === "idle") {
        const idleMs = 10 * 60_000;
        await vi.advanceTimersByTimeAsync(idleMs - 1000);
        expect(a.frames).toEqual([]);
        const closed = once(a.transport, "close");
        await vi.advanceTimersByTimeAsync(1000);
        await a.take("control.idle");
        drain.resolve();
        await closed;
        const b = await open(second.url);
        expect((await b.take("control.ready")).instanceId).not.toBe(instanceId);
        expect(first.suspend).not.toHaveBeenCalled();
        expect(second.resumeRenewal).not.toHaveBeenCalled();
        return;
      }

      if (mode !== "manual") {
        if (realExecution) {
          const requestId = randomUUID();
          a.send({
            type: "chat.send",
            requestId,
            chatId,
            message: {
              id: randomUUID(),
              instanceId,
              text: "Continue the campaign",
              locale: "en",
            },
          });
          await a.take("accepted");
          await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
          a.frames.length = 0;
        }
        await vi.advanceTimersByTimeAsync(workspaceRenewalMs - 1000);
        expect(a.frames).toEqual([]);
        await vi.advanceTimersByTimeAsync(1000);
        const offer = await a.take("control.renew");
        expect(offer.chatId).toBe(working ? chatId : undefined);
        const wrongTab = await open(second.url, {
          expectedInstanceId: instanceId,
          tabId: randomUUID(),
          renewal: { chatId: offer.chatId },
        });
        expect(await wrongTab.take("error")).toMatchObject({ code: "CONTROL_CONFLICT" });
        expect(first.suspend).not.toHaveBeenCalled();
        expect(second.discardRenewal).not.toHaveBeenCalled();

        const b = await open(second.url, {
          expectedInstanceId: instanceId,
          tabId,
          renewal: { chatId: offer.chatId },
        });
        await vi.waitFor(() => expect(first.suspend).toHaveBeenCalledOnce());
        expect(a.frames).toEqual([]);
        expect(a.transport.readyState).toBe(WebSocket.OPEN);
        expect(b.frames).toEqual([]);
        if (mode === "abandoned") {
          const closed = Promise.all([once(a.transport, "close"), once(b.transport, "close")]);
          a.transport.close();
          b.transport.close();
          await closed;
          expect(second.discardRenewal).not.toHaveBeenCalled();
        }
        drain.resolve();
        if (mode === "abandoned" || mode === "failed") {
          if (mode === "failed")
            expect(await b.take("error")).toMatchObject({ code: "INTERNAL_ERROR" });
          await vi.waitFor(() =>
            expect(transitionCampaign).toHaveBeenCalledExactlyOnceWith(
              "account",
              campaignId,
              "running",
              "stopped",
              "Workspace closed or stopped.",
            ),
          );
          expect(second.discardRenewal).toHaveBeenCalledOnce();
          expect(second.resumeRenewal).not.toHaveBeenCalled();
          expect(b.frames.some(({ type }) => type === "control.ready")).toBe(false);
          return;
        }
        const ready = await b.take("control.ready");
        expect(ready.instanceId).not.toBe(instanceId);
        expect(first.disconnect).not.toHaveBeenCalled();
        expect(second.resumeRenewal).not.toHaveBeenCalled();
        if (mode === "stop") {
          const requestId = randomUUID();
          b.send({ type: "chat.action", action: "stop", requestId, chatId, locale: "es" });
          await b.take("accepted");
          expect(second.discardRenewal).toHaveBeenCalledExactlyOnceWith(
            expect.any(Object),
            chatId,
            ready.instanceId,
          );
          expect(second.resumeRenewal).not.toHaveBeenCalled();
          return;
        }
        if (mode === "closed") {
          b.transport.close();
          await vi.waitFor(() => expect(second.discardRenewal).toHaveBeenCalledOnce());
          expect(second.resumeRenewal).not.toHaveBeenCalled();
          return;
        }
        b.send({
          type: "browser.frame",
          frame: JSON.stringify({ method: "extension.initialized", params: [42] }),
        });
        if (mode === "credit exhausted") {
          expect(await b.take("chat.event")).toMatchObject({
            chatId,
            event: { type: "status", working: false, error: null },
          });
          expect(await b.take("chat.event")).toMatchObject({
            chatId,
            event: { type: "status", working: false, error: "INSUFFICIENT_CREDITS" },
          });
          expect(transitionCampaign).toHaveBeenCalledExactlyOnceWith(
            "account",
            campaignId,
            "running",
            "stopped",
            "Workspace closed or stopped.",
          );
          expect(restoredCampaign).not.toHaveBeenCalled();
          expect(application).toHaveBeenCalledOnce();
          return;
        }
        if (working) {
          await vi.waitFor(() =>
            expect(second.resumeRenewal).toHaveBeenCalledExactlyOnceWith(
              expect.any(Object),
              chatId,
              ready.instanceId,
            ),
          );
          const owner = second.resumeRenewal.mock.calls[0]![0];
          await owner.browser(chatId, "es", owner.signal);
          const binding = second.browser.mock.calls[0]![0];
          const selected = binding.model.ensureTab(false);
          for (const [method, params, result] of [
            [
              "extension.workspaceTabs",
              [],
              {
                selectedTabId: 42,
                tabs: [
                  { id: 42, windowId: 1, active: true, url: "https://example.com" },
                  { id: 43, windowId: 2, active: true, url: "https://example.org" },
                ],
              },
            ],
            ["chrome.debugger.attach", [{ tabId: 42 }, "1.3"], undefined],
            [
              "chrome.debugger.sendCommand",
              [{ tabId: 42 }, "Target.getTargetInfo"],
              {
                targetInfo: { targetId: "original-target", type: "page" },
              },
            ],
            ["extension.selectTab", [42], undefined],
          ] as const) {
            const sent = await b.take("browser.frame");
            const command = JSON.parse(sent.frame) as { id: number };
            expect(command).toMatchObject({ method, params });
            b.send({ type: "browser.frame", frame: JSON.stringify({ id: command.id, result }) });
          }
          await expect(selected).resolves.toBe(42);
          await binding.model.handleCDPCommand("Target.setAutoAttach", {}, undefined);
        } else {
          expect(second.resumeRenewal).not.toHaveBeenCalled();
        }
        if (mode === "campaign") {
          await vi.waitFor(() => expect(restoredCampaign).toHaveBeenCalledOnce());
          await vi.advanceTimersByTimeAsync(2 * 60_000);
          expect(application).toHaveBeenCalledExactlyOnceWith({ campaignId, tabId: 42 });
          expect(transitionCampaign).not.toHaveBeenCalled();
          expect(session.events.filter(({ author }) => author === "user")).toHaveLength(1);
          expect(b.frames).toContainEqual(
            expect.objectContaining({
              type: "chat.event",
              event: expect.objectContaining({ type: "status", working: true }),
            }),
          );
          return;
        }
        await vi.advanceTimersByTimeAsync(workspaceRenewalMs - 1000);
        expect(b.frames).toEqual([]);
        await vi.advanceTimersByTimeAsync(1000);
        await b.take("control.renew");
        return;
      }
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
        await owner.browser(chatId, "es", owner.signal);
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
        ["chrome.debugger.sendCommand", { targetInfo: { targetId: "target", type: "page" } }],
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
      const b = await open(second.url, { expectedInstanceId: instanceId });
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
  },
);
