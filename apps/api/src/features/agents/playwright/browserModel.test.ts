import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { BrowserModel } from "./browserModel.js";
import { createLazyPlaywrightTools, openPlaywrightTools } from "../playwrightTools.js";

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
});
