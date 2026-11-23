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
const tabIdSchema = z.int().nonnegative();
const targetSchema = z.strictObject({ tabId: tabIdSchema, sessionId: z.string().optional() });
type DebuggerAttachment = { ready: Promise<void>; closing?: Promise<void> };
const debuggerAttachments = new Map<number, DebuggerAttachment>();
const browserStateMethods = new Set([
  "Storage.setCookies",
  "Storage.clearCookies",
  "Network.clearBrowserCookies",
  "Network.clearBrowserCache",
  "Browser.grantPermissions",
  "Browser.resetPermissions",
  "Browser.setPermission",
  "Browser.setDownloadBehavior",
  "Browser.close",
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
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function connectRemoteBrowser(
  port: {
    postMessage(frame: string): void;
    disconnect(): void;
    onMessage: { addListener(listener: (frame: unknown) => void): void };
    onDisconnect: { addListener(listener: () => void): void };
  },
  controllerTabId: number,
) {
  const attached = new Map<number, DebuggerAttachment>();
  let selectedTabId: number | undefined;
  let active = true;
  function send(value: unknown) {
    if (!active) return;
    try {
      port.postMessage(JSON.stringify(value));
    } catch {
      close();
      port.disconnect();
    }
  }
  function notify(method: string, ...params: unknown[]) {
    send({ method, params });
  }
  function assertWorkspaceTab(tabId: number) {
    if (tabId === controllerTabId) throw new Error("The Mirai controller tab is protected.");
  }
  function forgetDebugger(tabId: number, attachment: DebuggerAttachment | undefined) {
    if (!attachment) return;
    if (attached.get(tabId) === attachment) attached.delete(tabId);
    if (debuggerAttachments.get(tabId) === attachment) debuggerAttachments.delete(tabId);
  }
  function detachTab(tabId: number) {
    const attachment = attached.get(tabId);
    if (!attachment) return;
    attached.delete(tabId);
    attachment.closing = attachment.ready
      .then(() => chrome.debugger.detach({ tabId }))
      .finally(() => forgetDebugger(tabId, attachment));
    return attachment.closing;
  }
  async function attachTab(tabId: number) {
    const closing = debuggerAttachments.get(tabId)?.closing;
    if (closing) await closing.catch(() => {});
    if (!active) throw new Error("Connection closed.");
    const current = attached.get(tabId);
    if (current) return current.ready;
    if (debuggerAttachments.has(tabId))
      throw new Error("Another Mirai connection is debugging this tab.");
    const target = { tabId };
    const attachment: DebuggerAttachment = {
      ready: chrome.debugger.attach(target, "1.3").catch(async (error: unknown) => {
        if (
          !(error instanceof Error) ||
          !error.message.startsWith("Another debugger is already attached")
        )
          throw error;
        // Chrome can retain this extension's debugger across worker restarts.
        // Chrome's API only detaches a session owned by this extension ID.
        try {
          await chrome.debugger.detach(target);
        } catch {
          throw error;
        }
        if (!active) throw new Error("Connection closed.");
        await chrome.debugger.attach(target, "1.3");
      }),
    };
    attached.set(tabId, attachment);
    debuggerAttachments.set(tabId, attachment);
    try {
      await attachment.ready;
    } catch (error) {
      forgetDebugger(tabId, attachment);
      throw error;
    }
  }
  async function execute(method: string, params: unknown[]) {
    if (!active) throw new Error("Connection closed.");
    switch (method) {
      case "chrome.debugger.attach": {
        const { tabId } = targetSchema.parse(params[0]);
        assertWorkspaceTab(tabId);
        return attachTab(tabId);
      }
      case "chrome.debugger.detach": {
        const { tabId } = targetSchema.parse(params[0]);
        assertWorkspaceTab(tabId);
        return detachTab(tabId);
      }
      case "chrome.debugger.sendCommand": {
        const target = targetSchema.parse(params[0]);
        assertWorkspaceTab(target.tabId);
        if (!attached.has(target.tabId)) throw new Error("Chrome debugger is not attached.");
        const command = z.string().parse(params[1]);
        const args = z.record(z.string(), z.unknown()).nullish().parse(params[2]) ?? undefined;
        if (
          browserStateMethods.has(command) ||
          (command === "Page.navigate" && !permittedUrl(z.string().parse(args?.url)))
        )
          throw new Error("This debugger command is not available.");
        return chrome.debugger.sendCommand(target, command, args);
      }
      case "chrome.tabs.query": {
        const tabs = await chrome.tabs.query({});
        return tabs.flatMap(({ id }) =>
          id !== undefined && id >= 0 && id !== controllerTabId ? [id] : [],
        );
      }
      case "extension.workspaceTabs": {
        const tabs = await chrome.tabs.query({});
        return {
          selectedTabId,
          tabs: tabs.flatMap(({ id, windowId, url, title, active }) =>
            id !== undefined && id >= 0 && id !== controllerTabId
              ? [{ id, windowId, url, title, active }]
              : [],
          ),
        };
      }
      case "extension.selectTab": {
        const tabId = tabIdSchema.parse(params[0]);
        assertWorkspaceTab(tabId);
        await chrome.tabs.get(tabId);
        selectedTabId = tabId;
        return undefined;
      }
      case "chrome.tabs.create": {
        const options = z.object({ url: z.string().optional() }).parse(params[0]);
        if (!permittedUrl(options.url))
          throw new Error("Chrome requires a web URL for navigation.");
        const tab = await chrome.tabs.create({
          url: options.url ?? "about:blank",
          active: false,
        });
        if (tab.id === undefined) throw new Error("Chrome did not return a tab.");
        if (!active) throw new Error("Connection closed.");
        selectedTabId = tab.id;
        return tab;
      }
      case "chrome.tabs.remove": {
        const ids = tabIdSchema.array().parse([params[0]].flat());
        for (const tabId of ids) {
          assertWorkspaceTab(tabId);
          const debuggerSession = debuggerAttachments.get(tabId);
          if (debuggerSession && debuggerSession !== attached.get(tabId))
            throw new Error("Another Mirai connection is debugging this tab.");
        }
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
    if (source.tabId !== undefined && attached.has(source.tabId))
      notify("chrome.debugger.onEvent", source, method, params);
  };
  const onDetach: Parameters<typeof chrome.debugger.onDetach.addListener>[0] = (source, reason) => {
    if (source.tabId === undefined) return;
    const attachment = attached.get(source.tabId);
    if (!attachment) return;
    forgetDebugger(source.tabId, attachment);
    notify("chrome.debugger.onDetach", source, reason);
  };
  const onCreated: Parameters<typeof chrome.tabs.onCreated.addListener>[0] = ({ id }) => {
    if (id !== undefined && id >= 0 && id !== controllerTabId)
      notify("chrome.tabs.onCreated", { id });
  };
  const onUpdated: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (tabId, change) => {
    if (tabId === controllerTabId) return;
    const { url, title, discarded } = change;
    if (url !== undefined || title !== undefined || discarded === false)
      notify("chrome.tabs.onUpdated", tabId, { url, title, discarded });
  };
  const onRemoved: Parameters<typeof chrome.tabs.onRemoved.addListener>[0] = (tabId, info) => {
    forgetDebugger(tabId, attached.get(tabId));
    if (selectedTabId === tabId) selectedTabId = undefined;
    if (tabId === controllerTabId) {
      close();
      port.disconnect();
    } else notify("chrome.tabs.onRemoved", tabId, info);
  };
  const onReplaced: Parameters<typeof chrome.tabs.onReplaced.addListener>[0] = (added, removed) => {
    forgetDebugger(removed, attached.get(removed));
    if (selectedTabId === removed) selectedTabId = added;
    if (removed === controllerTabId) {
      close();
      port.disconnect();
    } else if (added !== controllerTabId) notify("chrome.tabs.onReplaced", added, removed);
  };
  function detachDebugger() {
    return Promise.allSettled([...attached.keys()].map(detachTab));
  }
  function close() {
    if (!active) return;
    active = false;
    chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    chrome.debugger.onDetach.removeListener(onDetach);
    chrome.tabs.onCreated.removeListener(onCreated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
    chrome.tabs.onReplaced.removeListener(onReplaced);
    void detachDebugger();
  }
  chrome.debugger.onEvent.addListener(onDebuggerEvent);
  chrome.debugger.onDetach.addListener(onDetach);
  chrome.tabs.onCreated.addListener(onCreated);
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);
  chrome.tabs.onReplaced.addListener(onReplaced);
  port.onDisconnect.addListener(close);
  port.onMessage.addListener((value: unknown) => {
    if (!active || typeof value !== "string") return;
    if (value === extensionRestoreFrame) {
      void detachDebugger().then(() => send(extensionReady));
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
