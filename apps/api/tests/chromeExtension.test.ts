import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { expect, it, vi } from "vitest";
import { openExtensionBridge } from "../../web/src/features/sessions/extensionBridge.js";
import {
  openPlaywrightTools,
  type WorkspaceBrowser,
} from "../src/features/agents/playwrightTools.js";
import { BrowserModel } from "../src/features/agents/playwright/browserModel.js";

const extensionPath = process.env.MIRAI_TEST_CHROME_EXTENSION;
const origin = "http://localhost:3000";

it.skipIf(!extensionPath)(
  "connects the built extension, survives worker shutdown, and restores existing tabs",
  async () => {
    const extension = resolve(extensionPath!);
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const controller = new AbortController();
    let bridge: ReturnType<typeof openExtensionBridge> | undefined;
    let tools: Awaited<ReturnType<typeof openPlaywrightTools>> | undefined;
    try {
      await context.route(`${origin}/**`, (route) =>
        route.fulfill({ contentType: "text/html", body: "<title>Mirai fixture</title>" }),
      );
      const workTab = await context.newPage();
      await workTab.goto(`${origin}/fixture-job`);
      const page = await context.newPage();
      const messages = new EventEmitter();
      const virtualWindow = {
        location: { origin },
        addEventListener: messages.on.bind(messages),
        removeEventListener: messages.off.bind(messages),
        postMessage: (message: string) => {
          void page
            .evaluate((data) => window.postMessage(data, location.origin), message)
            .catch(() => {});
        },
      };
      await page.exposeFunction("forwardExtensionFrame", (data: unknown, fromWindow: boolean) =>
        messages.emit("message", { data, origin, source: fromWindow ? virtualWindow : null }),
      );
      await page.addInitScript(() => {
        window.addEventListener("message", (event) => {
          const relay = Reflect.get(window, "forwardExtensionFrame");
          void relay(event.data, event.source === window);
        });
      });
      await page.goto(`${origin}/fixture-controller`);
      let wire = new EventEmitter();
      const disconnected = vi.fn(() => {
        wire.emit("close", 1000, Buffer.alloc(0));
      });
      const ready = vi.fn();
      const connect = () => {
        bridge?.close();
        vi.stubGlobal("window", virtualWindow);
        try {
          bridge = openExtensionBridge(
            (frame) => wire.emit("message", Buffer.from(frame)),
            ready,
            disconnected,
          );
        } finally {
          vi.unstubAllGlobals();
        }
      };
      connect();
      await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1), { timeout: 5_000 });
      function createBinding() {
        const binding: WorkspaceBrowser = {
          accountId: randomUUID(),
          ready: true,
          model: new BrowserModel(
            {
              get readyState() {
                return binding.ready ? 1 : 3;
              },
              send: (frame) => bridge?.send(frame),
              close() {},
              on: wire.on.bind(wire),
            },
            {
              onInitialized() {},
              onClose() {
                binding.ready = false;
              },
              sendToCDPClient: (message) => binding.cdp?.send(JSON.stringify(message)),
            },
          ),
        };
        return binding;
      }
      const startTools = (binding: WorkspaceBrowser) =>
        openPlaywrightTools(binding, {} as never, {} as never, "es", controller.signal);
      const binding = createBinding();
      let { model } = binding;
      tools = await startTools(binding);
      const tabTool = tools.tools.find(({ name }) => name === "browser_tabs")!;
      const callTabs = (args: Record<string, unknown>) =>
        tabTool.runAsync({
          args,
          toolContext: { abortSignal: controller.signal } as never,
        });
      const tabs = await model.workspaceTabs();
      const target = tabs.tabs.find(({ url }) => url === workTab.url());
      expect(target).toBeDefined();
      expect(tabs.tabs.map(({ url }) => url)).not.toContain(page.url());
      expect(await callTabs({ action: "select", index: target!.id })).toMatchObject({
        content: [{ text: expect.stringContaining('"current":true') }],
      });
      const snapshot = tools.tools.find(({ name }) => name === "browser_snapshot")!;
      expect(
        await snapshot.runAsync({
          args: {},
          toolContext: { abortSignal: controller.signal } as never,
        }),
      ).toMatchObject({ content: [{ text: expect.stringContaining(workTab.url()) }] });
      await tools.close();
      tools = undefined;
      expect(disconnected).not.toHaveBeenCalled();

      bridge!.restore();
      await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
      expect((await model.workspaceTabs()).selectedTabId).toBe(target!.id);

      const independentDebugger = await context.newCDPSession(workTab);
      await model.selectTab(target!.id);
      const pending = model.handleCDPCommand(
        "Runtime.evaluate",
        {
          expression:
            "window.miraiTestRuns = (window.miraiTestRuns ?? 0) + 1; new Promise(() => {})",
          awaitPromise: true,
        },
        model.selectedSessionId,
      );
      const interrupted = expect(pending).rejects.toThrow("WebSocket closed");
      await workTab.waitForFunction(() => Reflect.get(window, "miraiTestRuns") === 1);
      const cdp = await context.newCDPSession(page);
      const { targetInfos } = await cdp.send("Target.getTargets");
      const worker = targetInfos.find(
        ({ type, url }) => type === "service_worker" && url.startsWith("chrome-extension:"),
      );
      expect(worker).toBeDefined();
      await cdp.send("Target.closeTarget", { targetId: worker!.targetId });
      await vi.waitFor(() => expect(disconnected).toHaveBeenCalledWith("disconnected"));
      await interrupted;
      wire = new EventEmitter();
      connect();
      await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(3), { timeout: 5_000 });
      ({ model } = createBinding());
      expect((await model.workspaceTabs()).tabs).toContainEqual(target);
      await expect(model.selectTab(target!.id)).resolves.toBeUndefined();
      await model.releaseDebugger();
      expect(
        await independentDebugger.send("Runtime.evaluate", {
          expression: "[document.title, window.miraiTestRuns]",
          returnByValue: true,
        }),
      ).toMatchObject({ result: { value: ["Mirai fixture", 1] } });
      expect(workTab.isClosed()).toBe(false);
    } finally {
      await tools?.close();
      controller.abort();
      bridge?.close();
      await context.close();
    }
  },
  25_000,
);
