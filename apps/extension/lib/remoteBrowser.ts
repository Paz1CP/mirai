/// <reference types="chrome" />

/**
 * Copyright (c) Microsoft Corporation.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mirai adaptation of the Playwright extension's ClientSession and Channel
 * from microsoft/playwright at 28c4b2e0ad892723c17c0b8d280207c1da670998.
 */
import { extensionReady, extensionRestoreFrame } from "@mirai/contracts";
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
  "Page.bringToFront",
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
export function connectRemoteBrowser(
  port: Pick<chrome.runtime.Port, "postMessage" | "onMessage" | "onDisconnect" | "disconnect">,
  controllerTabId: number,
) {
  const owned = new Set<number>();
  const attached = new Set<number>();
  let active = true;
  function send(value: unknown) {
    if (!active) return;
    try {
      port.postMessage(JSON.stringify(value));
    } catch {
      close();
    }
  }
  function notify(method: string, ...params: unknown[]) {
    send({ method, params });
  }
  function held(target: unknown) {
    const result = targetSchema.parse(target);
    if (!active || !owned.has(result.tabId)) throw new Error("Tab is not owned by Mirai.");
    return result;
  }
  async function execute(method: string, params: unknown[]) {
    if (!active) throw new Error("Connection closed.");
    switch (method) {
      case "chrome.debugger.attach": {
        const { tabId } = held(params[0]);
        if (!attached.has(tabId)) {
          await chrome.debugger.attach({ tabId }, "1.3");
          if (!active) {
            await chrome.debugger.detach({ tabId });
            throw new Error("Connection closed.");
          }
          attached.add(tabId);
        }
        return undefined;
      }
      case "chrome.debugger.detach": {
        const { tabId } = held(params[0]);
        if (attached.delete(tabId)) await chrome.debugger.detach({ tabId });
        return undefined;
      }
      case "chrome.debugger.sendCommand": {
        const target = held(params[0]);
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
        const options = z.object({ url: z.string().optional() }).parse(params[0]);
        if (!permittedUrl(options.url)) throw new Error("Only job website URLs may be opened.");
        const tab = await chrome.tabs.create({
          url: options.url ?? "about:blank",
          active: false,
        });
        if (tab.id === undefined) throw new Error("Chrome did not return a tab.");
        if (!active) {
          await chrome.tabs.remove(tab.id).catch(() => {});
          throw new Error("Connection closed.");
        }
        owned.add(tab.id);
        return tab;
      }
      case "chrome.tabs.remove": {
        const ids = z.number().int().array().parse([params[0]].flat());
        for (const tabId of ids) held({ tabId });
        await chrome.tabs.remove(ids);
        return undefined;
      }
      default:
        throw new Error("Unknown Playwright relay command.");
    }
  }
  const onDebuggerEvent: Parameters<typeof chrome.debugger.onEvent.addListener>[0] = (
    source,
    method,
    params,
  ) => {
    if (source.tabId !== undefined && owned.has(source.tabId))
      notify("chrome.debugger.onEvent", source, method, params);
  };
  const onDetach: Parameters<typeof chrome.debugger.onDetach.addListener>[0] = (source, reason) => {
    if (source.tabId !== undefined && owned.has(source.tabId)) {
      attached.delete(source.tabId);
      notify("chrome.debugger.onDetach", source, reason);
    }
  };
  const onCreated: Parameters<typeof chrome.tabs.onCreated.addListener>[0] = (tab) => {
    if (
      tab.id !== undefined &&
      tab.openerTabId !== undefined &&
      owned.has(tab.openerTabId) &&
      permittedUrl(tab.pendingUrl ?? tab.url)
    ) {
      owned.add(tab.id);
      notify("chrome.tabs.onCreated", tab);
    }
  };
  const onRemoved: Parameters<typeof chrome.tabs.onRemoved.addListener>[0] = (tabId, info) => {
    if (tabId === controllerTabId) {
      close();
      port.disconnect();
    } else if (owned.delete(tabId)) {
      attached.delete(tabId);
      notify("chrome.tabs.onRemoved", tabId, info);
    }
  };
  function close() {
    if (!active) return;
    active = false;
    chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    chrome.debugger.onDetach.removeListener(onDetach);
    chrome.tabs.onCreated.removeListener(onCreated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
    void Promise.allSettled([...attached].map((tabId) => chrome.debugger.detach({ tabId })));
    attached.clear();
    owned.clear();
  }
  chrome.debugger.onEvent.addListener(onDebuggerEvent);
  chrome.debugger.onDetach.addListener(onDetach);
  chrome.tabs.onCreated.addListener(onCreated);
  chrome.tabs.onRemoved.addListener(onRemoved);
  port.onDisconnect.addListener(close);
  port.onMessage.addListener((value: unknown) => {
    if (!active || typeof value !== "string") return;
    if (value === extensionRestoreFrame) {
      // The port is still bound to the same controlling document.
      send({ ...extensionReady, params: [...owned] });
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(value) as unknown;
    } catch {
      return;
    }
    const command = commandSchema.safeParse(message);
    if (!command.success) return;
    const { id, method, params = [] } = command.data;
    void execute(method, params).then(
      (result) => send({ id, result }),
      (error: unknown) =>
        send({ id, error: error instanceof Error ? error.message : "Chrome command failed." }),
    );
  });
  send(extensionReady);
}
