/// <reference types="chrome" />

/**
 * Copyright (c) Microsoft Corporation.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mirai adaptation of the Playwright extension's ClientSession and Channel
 * from microsoft/playwright at 28c4b2e0ad892723c17c0b8d280207c1da670998.
 */
import { z } from "zod";

const commandSchema = z.object({
  id: z.number().int(),
  method: z.string(),
  params: z.array(z.unknown()).optional(),
});
const targetSchema = z.strictObject({ tabId: z.number().int(), sessionId: z.string().optional() });
const browserStateMethods = new Set([
  "Storage.setCookies",
  "Storage.clearCookies",
  "Network.clearBrowserCookies",
  "Network.clearBrowserCache",
  "Browser.grantPermissions",
  "Browser.resetPermissions",
  "Browser.setPermission",
  "Browser.setDownloadBehavior",
  "Target.createTarget",
  "Target.closeTarget",
  "Target.attachToTarget",
  "Target.activateTarget",
  "DOM.setFileInputFiles",
]);

function permittedUrl(input?: string) {
  if (input === undefined || input === "about:blank") return true;
  try {
    const url = new URL(input);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !/^(?:localhost(?:\.|$)|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i.test(
        url.hostname,
      ) &&
      !/\.local\.?$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}
type Owner = { tabId: number; instanceId: string } | undefined;
type Session = {
  socket: WebSocket;
  attached: Set<number>;
  heartbeat?: ReturnType<typeof setInterval>;
};

export function createRemoteBrowser() {
  let owner: Owner;
  let current: Session | undefined;
  let teardown = Promise.resolve();
  const owned = new Set<number>();

  function detached(session: Session) {
    clearInterval(session.heartbeat);
    if (current === session) current = undefined;
    const attached = [...session.attached];
    teardown = teardown.then(async () => {
      await Promise.allSettled(attached.map((tabId) => chrome.debugger.detach({ tabId })));
    });
  }
  function disconnect() {
    const session = current;
    if (!session) return;
    session.socket.onclose = null;
    session.socket.close();
    detached(session);
  }
  function send(session: Session, value: unknown) {
    if (current === session && session.socket.readyState === WebSocket.OPEN)
      session.socket.send(JSON.stringify(value));
  }
  function notify(method: string, ...params: unknown[]) {
    if (current) send(current, { method, params });
  }
  function held(session: Session, target: unknown) {
    const result = targetSchema.parse(target);
    if (current !== session || !owned.has(result.tabId))
      throw new Error("Tab is not owned by Mirai.");
    return result;
  }
  async function execute(session: Session, method: string, params: unknown[]) {
    if (current !== session) throw new Error("Connection closed.");
    switch (method) {
      case "chrome.debugger.attach": {
        const { tabId } = held(session, params[0]);
        if (!session.attached.has(tabId)) {
          await chrome.debugger.attach({ tabId }, "1.3");
          if (current !== session) {
            await chrome.debugger.detach({ tabId });
            throw new Error("Connection closed.");
          }
          session.attached.add(tabId);
        }
        return undefined;
      }
      case "chrome.debugger.detach": {
        const { tabId } = held(session, params[0]);
        if (session.attached.delete(tabId)) await chrome.debugger.detach({ tabId });
        return undefined;
      }
      case "chrome.debugger.sendCommand": {
        const target = held(session, params[0]);
        const command = z.string().parse(params[1]);
        const args = z.record(z.string(), z.unknown()).nullish().parse(params[2]) ?? undefined;
        if (
          browserStateMethods.has(command) ||
          (command === "Page.navigate" && !permittedUrl(z.string().parse(args?.url)))
        )
          throw new Error("Operation is not allowed on Mirai-controlled tabs.");
        return chrome.debugger.sendCommand(target, command, args);
      }
      case "chrome.tabs.create": {
        const options = z
          .object({ url: z.string().optional(), active: z.boolean().optional() })
          .parse(params[0]);
        if (!permittedUrl(options.url)) throw new Error("Only job website URLs may be opened.");
        const tab = await chrome.tabs.create({
          url: options.url ?? "about:blank",
          active: options.active ?? false,
        });
        if (tab.id === undefined) throw new Error("Chrome did not return a tab.");
        if (current !== session) {
          await chrome.tabs.remove(tab.id).catch(() => {});
          throw new Error("Connection closed.");
        }
        owned.add(tab.id);
        return tab;
      }
      case "chrome.tabs.remove": {
        const ids = z.number().int().array().parse([params[0]].flat());
        for (const tabId of ids) held(session, { tabId });
        await chrome.tabs.remove(ids);
        return undefined;
      }
      default:
        throw new Error("Unknown Playwright relay command.");
    }
  }
  async function connect(tabId: number, instanceId: string, ticket: string) {
    if (!chrome.debugger) return false;
    if (
      owner?.tabId === tabId &&
      owner.instanceId === instanceId &&
      current?.socket.readyState === WebSocket.OPEN
    )
      return true;
    if (owner?.tabId !== tabId || owner.instanceId !== instanceId) {
      disconnect();
      owned.clear();
      owner = { tabId, instanceId };
    }
    await teardown;
    if (owner?.tabId !== tabId || owner.instanceId !== instanceId) return false;
    const url = new URL(
      "/v1/browser/extension",
      import.meta.env.WXT_API_ORIGIN ?? "http://localhost:4000",
    );
    if (url.protocol === "https:") url.protocol = "wss:";
    else if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
      url.protocol = "ws:";
    else return false;
    const socket = new WebSocket(url, ["mirai.browser.v1", `mirai-ticket.${ticket}`]);
    const session: Session = { socket, attached: new Set() };
    current = session;
    socket.onclose = () => detached(session);
    socket.onmessage = (event) => {
      void (async () => {
        try {
          const command = commandSchema.parse(JSON.parse(String(event.data)));
          try {
            send(session, {
              id: command.id,
              result: await execute(session, command.method, command.params ?? []),
            });
          } catch (error) {
            send(session, {
              id: command.id,
              error: error instanceof Error ? error.message : "Chrome command failed.",
            });
          }
        } catch {
          socket.close();
        }
      })();
    };
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        socket.close();
        resolve(false);
      }, 5000);
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          resolve(false);
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        () => {
          clearTimeout(timeout);
          resolve(false);
        },
        { once: true },
      );
      socket.onopen = () => {
        void (async () => {
          for (const id of owned) {
            const tab = await chrome.tabs.get(id).catch(() => undefined);
            if (tab && permittedUrl(tab.url))
              send(session, { method: "chrome.tabs.onCreated", params: [tab] });
            else owned.delete(id);
          }
          send(session, { method: "extension.initialized", params: [] });
          session.heartbeat = setInterval(
            () => send(session, { method: "mirai.keepalive", params: [] }),
            15000,
          );
          clearTimeout(timeout);
          resolve(current === session);
        })().catch(() => {
          socket.close();
          resolve(false);
        });
      };
    });
  }
  if (typeof chrome !== "undefined" && chrome.debugger) {
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (source.tabId !== undefined && owned.has(source.tabId))
        notify("chrome.debugger.onEvent", source, method, params);
    });
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId !== undefined && owned.has(source.tabId)) {
        current?.attached.delete(source.tabId);
        notify("chrome.debugger.onDetach", source, reason);
      }
    });
    chrome.tabs.onCreated.addListener((tab) => {
      if (
        tab.id !== undefined &&
        tab.openerTabId !== undefined &&
        owned.has(tab.openerTabId) &&
        permittedUrl(tab.pendingUrl ?? tab.url)
      ) {
        owned.add(tab.id);
        notify("chrome.tabs.onCreated", tab);
      }
    });
    chrome.tabs.onRemoved.addListener((tabId, info) => {
      if (tabId === owner?.tabId) disconnect();
      if (owned.delete(tabId)) {
        current?.attached.delete(tabId);
        notify("chrome.tabs.onRemoved", tabId, info);
      }
    });
  }
  return {
    connect,
    disconnect(tabId: number, instanceId: string) {
      if (owner?.tabId === tabId && owner.instanceId === instanceId) {
        disconnect();
        owned.clear();
        owner = undefined;
      }
    },
  };
}
