import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { BrowserModel } from "./browserModel.js";
import { createLazyPlaywrightTools, openPlaywrightTools } from "../playwrightTools.js";
import type { WorkspaceBrowser } from "../playwrightTools.js";

it("lists the real workspace before attaching and restores only the selected target", async () => {
  const wire = new EventEmitter();
  const tabs = [
    { id: 4, windowId: 1, title: "Jobs", url: "https://jobs.example", active: true },
    { id: 8, windowId: 2, title: "Inbox", url: "https://mail.example", active: true },
  ];
  let selectedTabId: number | undefined = 8;
  const send = vi.fn((data: string) => {
    const { id, method, params } = JSON.parse(data);
    let result: unknown;
    if (method === "extension.workspaceTabs") result = { tabs, selectedTabId };
    if (method === "extension.selectTab") selectedTabId = params[0];
    if (method === "chrome.debugger.sendCommand")
      result = { targetInfo: { targetId: String(params[0].tabId), type: "page" } };
    queueMicrotask(() => wire.emit("message", Buffer.from(JSON.stringify({ id, result }))));
  });
  const makeModel = () => {
    const sendToCDPClient = vi.fn();
    const model = new BrowserModel(
      { readyState: 1, send, close() {}, on: wire.on.bind(wire) },
      { sendToCDPClient, onInitialized() {}, onClose() {} },
    );
    return { model, sendToCDPClient };
  };
  const { model, sendToCDPClient } = makeModel();
  const controller = new AbortController();
  const gateway = await openPlaywrightTools(
    { accountId: "account", ready: true, model },
    {} as Parameters<typeof openPlaywrightTools>[1],
    {} as Parameters<typeof openPlaywrightTools>[2],
    "es",
    controller.signal,
  );
  try {
    const tabTool = gateway.tools.find(({ name }) => name === "browser_tabs")!;
    const result = await tabTool.runAsync({
      args: { action: "list" },
      toolContext: { abortSignal: controller.signal } as Parameters<
        typeof tabTool.runAsync
      >[0]["toolContext"],
    });
    expect(result).toMatchObject({
      content: [{ type: "text", text: expect.stringContaining('"index":8') }],
    });
    expect(gateway.tools.map(({ name }) => name)).toEqual(
      (await createLazyPlaywrightTools(async () => undefined)).map(({ name }) => name),
    );
  } finally {
    await gateway.close();
  }
  expect(send).toHaveBeenCalledTimes(1);
  await expect(model.ensureTab(false)).resolves.toBe(8);
  await model.handleCDPCommand("Target.setAutoAttach", { autoAttach: true }, undefined);
  expect(sendToCDPClient.mock.calls.map(([event]) => event.params.targetInfo.targetId)).toEqual([
    "8",
  ]);
  expect(send.mock.calls.map(([data]) => JSON.parse(data).method)).not.toContain(
    "chrome.tabs.create",
  );
  await model.selectTab(4);
  expect(send).toHaveBeenCalledWith(expect.stringContaining('"method":"chrome.debugger.detach"'));
  expect((await model.workspaceTabs()).selectedTabId).toBe(4);
  await model.releaseDebugger();
  expect(model.selectedSessionId).toBeUndefined();
  expect((await model.workspaceTabs()).selectedTabId).toBe(4);
});

it("discovers the native vision and targeted observation contracts without starting Chrome", async () => {
  const tools = await createLazyPlaywrightTools(async () => undefined);
  const names = tools.map(({ name }) => name);
  expect(names).toEqual(
    expect.arrayContaining([
      "browser_find",
      "browser_mouse_move_xy",
      "browser_mouse_click_xy",
      "browser_mouse_wheel",
      "browser_snapshot",
      "browser_press_key",
    ]),
  );
  const snapshot = tools.find(({ name }) => name === "browser_snapshot")!._getDeclaration();
  expect(snapshot?.parameters?.properties).toMatchObject({
    target: expect.any(Object),
    depth: expect.any(Object),
  });
  const click = tools.find(({ name }) => name === "browser_mouse_click_xy")!._getDeclaration();
  expect(click?.parameters).toMatchObject({
    required: ["x", "y"],
    properties: {
      x: expect.any(Object),
      y: expect.any(Object),
      delay: expect.any(Object),
      clickCount: expect.any(Object),
      button: { enum: ["left", "right", "middle"] },
    },
  });
});

it("keeps the same CDP socket when switching between initialized Chrome pages", async () => {
  const wire = new EventEmitter();
  const tabs = [4, 8].map((id) => ({
    id,
    windowId: 1,
    url: `https://tab${id}.example`,
    active: id === 4,
  }));
  let selectedTabId = 4;
  const actedOn: number[] = [];
  const mouseEvents: unknown[] = [];
  const model = new BrowserModel(
    {
      readyState: 1,
      close() {},
      on: wire.on.bind(wire),
      send(data) {
        const { id, method, params } = JSON.parse(data);
        const tabId = params[0]?.tabId as number;
        const url = `https://tab${tabId}.example`;
        let result: unknown = {};
        if (method === "extension.workspaceTabs") result = { tabs, selectedTabId };
        if (method === "extension.selectTab") selectedTabId = params[0];
        if (method === "chrome.debugger.sendCommand") {
          switch (params[1]) {
            case "Target.getTargetInfo":
              result = { targetInfo: { targetId: String(tabId), type: "page", url, title: url } };
              break;
            case "Page.getFrameTree":
              result = {
                frameTree: {
                  frame: { id: String(tabId), url, loaderId: "loader", mimeType: "text/html" },
                },
              };
              break;
            case "Page.createIsolatedWorld":
              for (const [contextId, name] of [
                [tabId, ""],
                [tabId + 10, params[2].worldName],
              ])
                wire.emit(
                  "message",
                  Buffer.from(
                    JSON.stringify({
                      method: "chrome.debugger.onEvent",
                      params: [
                        { tabId },
                        "Runtime.executionContextCreated",
                        {
                          context: {
                            id: contextId,
                            name,
                            auxData: { frameId: String(tabId), isDefault: !name },
                          },
                        },
                      ],
                    }),
                  ),
                );
              result = { executionContextId: tabId + 10 };
              break;
            case "Runtime.evaluate":
            case "Runtime.callFunctionOn":
              result = { result: { type: "string", value: url, objectId: "fixture-object" } };
              break;
            case "Input.dispatchMouseEvent":
              actedOn.push(tabId);
              mouseEvents.push(params[2]);
              break;
          }
        }
        queueMicrotask(() => wire.emit("message", Buffer.from(JSON.stringify({ id, result }))));
      },
    },
    {
      onInitialized() {},
      onClose() {},
      sendToCDPClient: (message) => binding.cdp?.send(JSON.stringify(message)),
    },
  );
  const binding: WorkspaceBrowser = { accountId: "account", ready: true, model };
  const controller = new AbortController();
  const gateway = await openPlaywrightTools(
    binding,
    {} as never,
    {} as never,
    "es",
    controller.signal,
  );
  try {
    const call = (name: string, args: Record<string, unknown>) =>
      gateway.tools
        .find((tool) => tool.name === name)!
        .runAsync({
          args,
          toolContext: { abortSignal: controller.signal } as never,
        });
    const first = await call("browser_mouse_move_xy", { x: 10, y: 20 });
    expect(first, JSON.stringify(first)).not.toMatchObject({ isError: true });
    const socket = binding.cdp;
    expect(socket).toBeDefined();
    for (const index of [8, 4]) {
      const selection = await call("browser_tabs", { action: "select", index });
      expect(selection, JSON.stringify(selection)).not.toMatchObject({ isError: true });
      expect(binding.cdp).toBe(socket);
      actedOn.length = 0;
      const action = await call("browser_mouse_move_xy", { x: 10, y: 20 });
      expect(action, JSON.stringify(action)).not.toMatchObject({ isError: true });
      expect(binding.cdp).toBe(socket);
      expect(actedOn).toEqual([index]);
    }
    mouseEvents.length = 0;
    const clicked = await call("browser_mouse_click_xy", {
      x: 1266,
      y: 423,
      button: "right",
      clickCount: 2,
    });
    expect(clicked, JSON.stringify(clicked)).not.toMatchObject({ isError: true });
    expect(mouseEvents).toContainEqual(
      expect.objectContaining({
        type: "mousePressed",
        x: 1266,
        y: 423,
        button: "right",
        clickCount: 2,
      }),
    );
    expect(binding.cdp).toBe(socket);
  } finally {
    await gateway.close();
  }
}, 12_000);

it("cancels pending CDP requests and isolates a detached child session", async () => {
  const wire = new EventEmitter();
  const pending = new Map<string, number>();
  const cancelled: number[] = [];
  const reply = (frame: unknown) => wire.emit("message", Buffer.from(JSON.stringify(frame)));
  const model = new BrowserModel(
    {
      readyState: 1,
      close() {},
      on: wire.on.bind(wire),
      send(raw) {
        const { method, id, params } = JSON.parse(raw);
        if (method === "extension.cancel") {
          cancelled.push(params[0]);
          return;
        }
        if (params[1] === "Runtime.evaluate") {
          pending.set(params[2].expression, id);
          return;
        }
        reply({
          id,
          result:
            params[1] === "Target.getTargetInfo"
              ? {
                  targetInfo: { targetId: "root", type: "page" },
                }
              : undefined,
        });
      },
    },
    { onInitialized() {}, onClose() {}, sendToCDPClient() {} },
  );
  const event = (method: string, sessionId: string) =>
    reply({
      method: "chrome.debugger.onEvent",
      params: [{ tabId: 1 }, method, { sessionId }],
    });
  await model.selectTab(1);
  event("Target.attachedToTarget", "child-a");
  event("Target.attachedToTarget", "child-b");
  const evaluate = (expression: string, sessionId?: string, signal?: AbortSignal) =>
    model.handleCDPCommand(
      "Runtime.evaluate",
      { expression },
      sessionId ?? model.selectedSessionId,
      signal,
    );
  const a = expect(evaluate("a", "child-a")).rejects.toThrow("target detached");
  const b = evaluate("b", "child-b");
  event("Target.detachedFromTarget", "child-a");
  await a;
  await expect(evaluate("a again", "child-a")).rejects.toThrow("session child-a is detached");
  reply({ id: pending.get("b"), result: { value: 42 } });
  await expect(b).resolves.toEqual({ value: 42 });

  const abort = new AbortController();
  const stopped = expect(evaluate("stopped", undefined, abort.signal)).rejects.toThrow(
    "Stopped in MCP",
  );
  abort.abort(new Error("Stopped in MCP"));
  await stopped;
  expect(cancelled).toEqual([pending.get("a"), pending.get("stopped")]);
  reply({ id: pending.get("stopped"), result: "late" });

  const bad = expect(evaluate("failure")).rejects.toThrow(
    "Runtime.evaluate: Chrome refused the evaluation",
  );
  reply({ id: pending.get("failure"), error: "Chrome refused the evaluation" });
  await bad;

  vi.useFakeTimers();
  try {
    const expired = expect(evaluate("unresponsive")).rejects.toThrow("8000ms");
    await vi.advanceTimersByTimeAsync(8_000);
    await expired;
  } finally {
    vi.useRealTimers();
  }
  expect(cancelled).toEqual([
    pending.get("a"),
    pending.get("stopped"),
    pending.get("unresponsive"),
  ]);
  const disconnected = expect(evaluate("disconnected")).rejects.toThrow("WebSocket closed");
  wire.emit("close", 1000, Buffer.alloc(0));
  await disconnected;
  await expect(evaluate("after close")).rejects.toThrow("connection is closed");
});
