import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import {
  workspaceClientSchema,
  type WorkspaceClientFrame,
  type WorkspaceServerFrame,
} from "@mirai/contracts";
import { chromium } from "playwright";
import { expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { openWorkspaceExtension } from "../../web/src/features/sessions/extensionBridge.js";

const extensionPath = process.env.MIRAI_TEST_CHROME_EXTENSION;
const apiPort = Number(process.env.MIRAI_TEST_CHROME_WORKSPACE_PORT);
const origin = "http://localhost:3000";
type BrowserFrame = Extract<WorkspaceClientFrame, { type: "browser.frame" }>;

it.skipIf(!!process.env.CI || !extensionPath || !apiPort)(
  "keeps real Chrome commands running in two chats while the Mirai page reloads",
  async () => {
    const extension = resolve(extensionPath!);
    const server = createServer();
    const api = new WebSocketServer({ server, path: "/v1/workspace" });
    const requests = new EventEmitter();
    const connections: WebSocket[] = [];
    const initialInstanceId = randomUUID();
    const renewalInstanceId = randomUUID();
    const renewals: WorkspaceClientFrame[] = [];
    const lifecycle = vi.fn();
    api.on("connection", (socket, request) => {
      connections.push(socket);
      const instanceId = connections.length === 1 ? initialInstanceId : renewalInstanceId;
      expect(request.headers.origin).toMatch(/^chrome-extension:\/\/[a-p]{32}$/);
      const send = (frame: WorkspaceServerFrame) => socket.send(JSON.stringify(frame));
      socket.on("close", lifecycle);
      socket.on("message", (message) => {
        const frame = workspaceClientSchema.parse(JSON.parse(message.toString()));
        if (frame.type === "open") {
          if (frame.renewal) renewals.push(frame);
          send({ type: "control.ready", instanceId });
        }
        if (frame.type === "control.attach")
          send({
            type: "control.attached",
            requestId: frame.requestId,
            instanceId,
            activeChats: [{ chatId: "a" }, { chatId: "b" }],
          });
        if (frame.type === "browser.frame") requests.emit("frame", frame);
      });
    });
    server.listen(apiPort, "localhost");
    await once(server, "listening");
    let profile: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
    try {
      const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      profile = context;
      await context.route(`${origin}/**`, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<title>Mirai continuity fixture</title>",
        }),
      );
      const routes = ["/job-a", "/job-b"];
      for (const route of routes) {
        const tab = await context.newPage();
        await tab.goto(origin + route);
      }
      const page = await context.newPage();
      const messages = new EventEmitter();
      const virtualWindow = {
        location: { origin },
        addEventListener: messages.on.bind(messages),
        removeEventListener: messages.off.bind(messages),
        postMessage: (frame: string) => {
          void page
            .evaluate((data) => window.postMessage(data, location.origin), frame)
            .catch(() => {});
        },
      };
      await page.exposeFunction("mirrorFrame", (data: unknown, fromWindow: boolean) =>
        messages.emit("message", { data, origin, source: fromWindow ? virtualWindow : null }),
      );
      await page.addInitScript(() => {
        window.addEventListener("message", (event) => {
          void Reflect.get(window, "mirrorFrame")(event.data, event.source === window);
        });
      });
      await page.goto(`${origin}/mirai`);
      async function attachUi(instanceId: string) {
        vi.stubGlobal("window", virtualWindow);
        const attaching = openWorkspaceExtension();
        vi.unstubAllGlobals();
        const connection = await attaching;
        if (!connection) throw new Error("The workspace extension did not respond");
        const ready = vi.fn();
        connection.onmessage = ({ data }) => ready(JSON.parse(data));
        connection.send(JSON.stringify({ type: "open", accountId: "account", token: "fixture" }));
        await vi.waitFor(() =>
          expect(ready).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "control.ready",
              instanceId,
              activeChats: [{ chatId: "a" }, { chatId: "b" }],
            }),
          ),
        );
        return connection;
      }
      const ui = await attachUi(initialInstanceId);
      let id = 0;
      async function command(chatId: string, method: string, params: unknown[] = []) {
        const commandId = ++id;
        const answer = new Promise<{ result?: unknown; error?: string }>((done) => {
          const receive = (message: BrowserFrame) => {
            const frame = JSON.parse(message.frame);
            if (message.chatId !== chatId || frame.id !== commandId) return;
            requests.off("frame", receive);
            done(frame);
          };
          requests.on("frame", receive);
        });
        const frame: WorkspaceServerFrame = {
          type: "browser.frame",
          chatId,
          frame: JSON.stringify({ id: commandId, method, params }),
        };
        connections.at(-1)!.send(JSON.stringify(frame));
        const result = await answer;
        if (result.error) throw new Error(result.error);
        return result.result;
      }
      const listed = (await command("a", "extension.workspaceTabs")) as {
        tabs: { id: number; url: string }[];
      };
      const targets = routes.map(
        (route) => listed.tabs.find((tab) => tab.url === origin + route)!.id,
      );
      expect(listed.tabs.map(({ url }) => url)).not.toContain(page.url());
      await Promise.all(
        ["a", "b"].map(async (chatId, index) => {
          await command(chatId, "chrome.debugger.attach", [{ tabId: targets[index] }]);
          await command(chatId, "extension.selectTab", [targets[index]]);
        }),
      );
      await expect(command("b", "chrome.tabs.remove", [targets[0]])).rejects.toThrow(
        "Another Mirai connection",
      );
      ui.close();
      const reloading = page.reload();
      const paths = await Promise.all(
        ["a", "b"].map((chatId, index) =>
          command(chatId, "chrome.debugger.sendCommand", [
            { tabId: targets[index] },
            "Runtime.evaluate",
            { expression: "location.pathname", returnByValue: true },
          ]),
        ),
      );
      await reloading;
      expect(paths).toEqual(routes.map((value) => ({ result: { type: "string", value } })));
      expect(connections).toHaveLength(1);
      expect(lifecycle).not.toHaveBeenCalled();
      connections[0]!.send(JSON.stringify({ type: "control.renew", chatIds: ["a", "b"] }));
      await vi.waitFor(() => expect(lifecycle).toHaveBeenCalledOnce());
      expect(renewals).toEqual([
        expect.objectContaining({
          expectedInstanceId: initialInstanceId,
          renewal: { chatIds: ["a", "b"] },
        }),
      ]);
      expect(renewals[0]).not.toHaveProperty("token");
      await attachUi(renewalInstanceId);
      await page.evaluate(() => history.pushState(null, "", "/documents"));
      expect(connections).toHaveLength(2);
      for (const [index, chatId] of ["a", "b"].entries())
        expect(await command(chatId, "extension.workspaceTabs")).toMatchObject({
          selectedTabId: targets[index],
        });
    } finally {
      await profile?.close();
      for (const socket of connections) socket.terminate();
      api.close();
      await new Promise<void>((done) => server.close(() => done()));
    }
  },
  20_000,
);
