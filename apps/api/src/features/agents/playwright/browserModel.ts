/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * The browser as seen through the extension connection. Owns the mapping
 * between chrome tab ids and the CDP session ids exposed to Playwright, and is
 * the single place that translates between the chrome.* dialect spoken by the
 * extension and the CDP dialect spoken by Playwright, in both directions.
 *
 * The extension supplies a live tab snapshot and Chrome lifecycle events.
 * Only targets Chrome can attach are exposed to Playwright.
 */

// Adapted by Mirai from microsoft/playwright at 28c4b2e0ad892723c17c0b8d280207c1da670998.
import ws from "ws";
import { workspaceTabsSchema } from "@mirai/contracts";

import { randomInt } from "node:crypto";
import { debuglog } from "node:util";
import { z } from "zod";

import {
  chromeTabSchema,
  extensionEventSchema,
  type DebuggerSession,
  type ExtensionCommands,
  type ExtensionEvent,
} from "./protocol.js";

const debugLogger = debuglog("mirai-playwright");
let nextExtensionCommandId = randomInt(2 ** 46);
const targetInfoSchema = z.looseObject({
  targetId: z.string(),
  type: z.literal("page"),
  browserContextId: z.string().optional(),
});
const tabCommandTimeout = 4_000;
const cdpCommandTimeout = 8_000;
export const screenshotCdpTimeout = 10_000;
export class BrowserCommandTimeout extends Error {
  constructor(command: string, timeout: number) {
    super(`${command}: Chrome did not respond within ${timeout}ms.`);
  }
}
const extensionEnvelope = z.object({
  id: z.number().int().optional(),
  method: z.string().optional(),
  params: z.array(z.unknown()).optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type CDPMessage = {
  id?: number;
  sessionId?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message: string };
};

export type BrowserModelDelegate = {
  sendToCDPClient(message: CDPMessage): void;
  onInitialized(): void;
  onClose(reason: string): void;
};
export interface ExtensionTransport {
  readonly readyState: number;
  send(data: string): void | Promise<void>;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: ws.RawData) => void): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  on(event: "error", listener: (error: ws.ErrorEvent) => void): void;
}

type TabSession = {
  tabId: number;
  sessionId: string;
  targetInfo: z.infer<typeof targetInfoSchema>;
  // Child CDP sessions (workers, oopifs, ...) of this tab, tracked via
  // Target.attachedToTarget / Target.detachedFromTarget events.
  childSessions: Set<string>;
};

export class BrowserModel {
  private _extension: ExtensionConnection;
  private _delegate: BrowserModelDelegate;
  private _tabSessions = new Map<number, TabSession>();
  private _attaching = new Map<number, Promise<TabSession>>();
  selectedTabId?: number;
  get selectedSessionId() {
    return this.selectedTabId === undefined
      ? undefined
      : this._tabSessions.get(this.selectedTabId)?.sessionId;
  }
  private _autoAttach = false;
  private _nextSessionId = 1;

  constructor(socket: ExtensionTransport, delegate: BrowserModelDelegate) {
    this._delegate = delegate;
    this._extension = new ExtensionConnection(
      socket,
      (event) => this._onExtensionEvent(event),
      (reason) => delegate.onClose(reason),
    );
  }

  close(reason: string) {
    this._extension.close(reason);
  }

  async handleCDPCommand(
    method: string,
    params: Record<string, unknown> | undefined,
    sessionId: string | undefined,
    signal?: AbortSignal,
    commandTimeout = cdpCommandTimeout,
  ): Promise<unknown> {
    signal?.throwIfAborted();
    switch (method) {
      case "Browser.getVersion":
        return {
          protocolVersion: "1.3",
          product: "Chrome/Extension-Bridge",
          userAgent: "CDP-Bridge-Server/1.0.0",
        };
      case "Browser.setDownloadBehavior":
        return {};
      case "Target.setAutoAttach":
        if (sessionId) break;
        if (params?.autoAttach === false) this.disconnectCdpClient();
        else this._enableAutoAttach();
        return {};
      case "Target.getTargets":
        if (sessionId) break;
        return {
          targetInfos: [...this._tabSessions.values()].map(({ targetInfo }) => ({
            ...targetInfo,
            attached: true,
          })),
        };
      case "Target.createTarget":
        return await this._createTarget(z.string().optional().parse(params?.url), signal);
      case "Target.closeTarget":
        return await this._closeTarget(z.string().optional().parse(params?.targetId), signal);
      case "Target.getTargetInfo": {
        const targetId = z.string().optional().parse(params?.targetId);
        const tab = targetId
          ? this._findTabSession((s) => s.targetInfo.targetId === targetId)
          : sessionId
            ? this._findTabSession((s) => s.sessionId === sessionId)
            : undefined;
        if (tab) return { targetInfo: { ...tab.targetInfo, attached: true } };
        if (sessionId) break;
        if (targetId) throw new Error("Chrome tab is no longer available.");
        return {};
      }
      case "Page.bringToFront":
      case "Target.activateTarget":
        // Playwright can change its own selected tab without activating Chrome's tab.
        return {};
      case "Page.captureScreenshot": {
        if (!sessionId) throw new Error("A work tab is required for a screenshot.");
        const target = this._debuggerTarget(method, sessionId);
        const capture = { ...params, fromSurface: true, optimizeForSpeed: true };
        return await this._extension.send(
          "chrome.debugger.sendCommand",
          [target, method, capture],
          screenshotCdpTimeout,
          signal,
        );
      }
    }
    return await this._extension.send(
      "chrome.debugger.sendCommand",
      [this._debuggerTarget(method, sessionId), method, params],
      /^Page\.(navigate|reload|navigateToHistoryEntry)$/.test(method) ? 30_000 : commandTimeout,
      signal,
    );
  }

  private _enableAutoAttach(): void {
    if (!this._autoAttach) for (const tab of this._tabSessions.values()) this._announceTab(tab);
    this._autoAttach = true;
  }

  async workspaceTabs(signal?: AbortSignal) {
    try {
      return workspaceTabsSchema.parse(
        await this._extension.send("extension.workspaceTabs", [], tabCommandTimeout, signal),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.cause instanceof Error &&
        error.cause.message === "Unknown Playwright relay command."
      )
        throw new Error("Update the Mirai extension to discover existing Chrome tabs.", {
          cause: error,
        });
      throw error;
    }
  }

  async selectTab(tabId: number, signal?: AbortSignal) {
    await this._attachTab(tabId, signal);
    await this._extension.send("extension.selectTab", [tabId], tabCommandTimeout, signal);
    await this._useTab(tabId);
  }

  async ensureTab(chooseDefault: boolean, signal?: AbortSignal): Promise<number | undefined> {
    signal?.throwIfAborted();
    if (this.selectedTabId !== undefined && this._tabSessions.has(this.selectedTabId))
      return this.selectedTabId;
    const { tabs, selectedTabId } = await this.workspaceTabs(signal);
    if (selectedTabId !== undefined) {
      await this.selectTab(selectedTabId, signal);
      return selectedTabId;
    }
    if (!chooseDefault) return undefined;
    for (const tab of tabs.sort((a, b) => Number(b.active) - Number(a.active))) {
      try {
        await this._attachTab(tab.id, signal);
      } catch {
        signal?.throwIfAborted();
        continue;
      }
      await this.selectTab(tab.id, signal);
      return tab.id;
    }
    return undefined;
  }

  async closeTab(tabId: number, signal?: AbortSignal) {
    await this._extension.send("chrome.tabs.remove", [tabId], tabCommandTimeout, signal);
    this._removeTab(tabId);
  }

  private async _useTab(tabId: number) {
    this.selectedTabId = tabId;
    await this.releaseDebugger(tabId);
  }

  async releaseDebugger(exceptTabId?: number) {
    if (exceptTabId === undefined) await Promise.allSettled(this._attaching.values());
    await Promise.all(
      [...this._tabSessions.keys()]
        .filter((id) => id !== exceptTabId)
        .map(async (id) => {
          await this._extension
            .send("chrome.debugger.detach", [{ tabId: id }], tabCommandTimeout)
            .catch(() => {});
          this._detachTab(id);
        }),
    );
  }

  disconnectCdpClient(): void {
    this._autoAttach = false;
  }

  private async _createTarget(
    url: string | undefined,
    signal?: AbortSignal,
  ): Promise<{ targetId: string | undefined }> {
    const response = await this._extension.send(
      "chrome.tabs.create",
      [{ url, active: false }],
      tabCommandTimeout,
      signal,
    );
    const tab = chromeTabSchema.parse(response);
    try {
      const tabSession = await this._attachTab(tab.id, signal);
      await this._useTab(tab.id);
      signal?.throwIfAborted();
      return { targetId: tabSession.targetInfo?.targetId };
    } catch (error) {
      await this.closeTab(tab.id).catch(() => {});
      throw error;
    }
  }

  private async _closeTarget(
    targetId: string | undefined,
    signal?: AbortSignal,
  ): Promise<{ success: boolean }> {
    const tabSession = targetId
      ? this._findTabSession((s) => s.targetInfo?.targetId === targetId)
      : undefined;
    if (!tabSession) return { success: false };
    await this.closeTab(tabSession.tabId, signal);
    return { success: true };
  }

  // Resolves the chrome.debugger target for a CDP command from Playwright:
  // 1. No sessionId: browser-level command (Storage.*, Browser.*, ...). chrome.debugger.sendCommand
  //    requires a target, so route through any attached tab; the result does not depend on the tab.
  // 2. sessionId is a relay-level tab session (pw-tab-N) → strip it and route by tabId.
  // 3. sessionId is a child CDP session (worker, oopif) → route to its owning tab,
  //    keep the sessionId so the extension forwards it to chrome.debugger.
  private _debuggerTarget(method: string, sessionId: string | undefined): DebuggerSession {
    if (!sessionId) {
      const tabSession = this._tabSessions.values().next().value;
      if (!tabSession)
        throw new Error(`No attached tab to forward browser-level command: ${method}`);
      return { tabId: tabSession.tabId };
    }
    const tabSession = this._findTabSession((s) => s.sessionId === sessionId);
    if (tabSession) return { tabId: tabSession.tabId };
    const parentSession = this._findTabSession((s) => s.childSessions.has(sessionId));
    if (parentSession) return { tabId: parentSession.tabId, sessionId };
    throw new Error(
      `Chrome debugger session ${sessionId} is detached. Inspect or select the tab again.`,
    );
  }

  private _onExtensionEvent(event: ExtensionEvent): void {
    switch (event.method) {
      case "chrome.tabs.onUpdated": {
        const [tabId, change] = event.params;
        const tab = this._tabSessions.get(tabId);
        if (tab) {
          if (change.url !== undefined) tab.targetInfo.url = change.url;
          if (change.title !== undefined) tab.targetInfo.title = change.title;
        }
        break;
      }
      case "chrome.tabs.onRemoved": {
        const [tabId] = event.params;
        this._removeTab(tabId);
        break;
      }
      case "chrome.tabs.onReplaced": {
        const [, removed] = event.params;
        this._removeTab(removed);
        break;
      }
      case "chrome.debugger.onEvent": {
        const [source, method, params] = event.params;
        this._onDebuggerEvent(source, method, params ?? undefined);
        break;
      }
      case "chrome.debugger.onDetach": {
        const [source] = event.params;
        if (source.tabId !== undefined) this._detachTab(source.tabId);
        break;
      }
      case "extension.initialized":
        this._delegate.onInitialized();
        break;
    }
  }

  private _removeTab(tabId: number) {
    if (this.selectedTabId === tabId) this.selectedTabId = undefined;
    this._detachTab(tabId);
  }

  private _onDebuggerEvent(source: DebuggerSession, method: string, params?: object): void {
    if (source.tabId === undefined) return;
    const tabSession = this._tabSessions.get(source.tabId);
    if (!tabSession) return;
    // Track child CDP sessions so we can route subsequent commands for
    // them to the correct tab. Target.attachedToTarget introduces a new
    // sessionId belonging to the same tab; Target.detachedFromTarget
    // releases it.
    const childSessionId = z.object({ sessionId: z.string() }).safeParse(params).data?.sessionId;
    if (method === "Target.attachedToTarget" && childSessionId)
      tabSession.childSessions.add(childSessionId);
    else if (method === "Target.detachedFromTarget" && childSessionId) {
      tabSession.childSessions.delete(childSessionId);
      this._extension.rejectTarget(source.tabId, childSessionId);
    }
    // Top-level CDP events for the tab use the tab's relay sessionId.
    // Child CDP sessions (workers, oopifs) keep their own sessionId.
    const sessionId = source.sessionId || tabSession.sessionId;
    this._delegate.sendToCDPClient({ sessionId, method, params });
  }

  private async _attachTab(tabId: number, signal?: AbortSignal): Promise<TabSession> {
    signal?.throwIfAborted();
    const existing = this._tabSessions.get(tabId);
    if (existing) return existing;
    const attaching = this._attaching.get(tabId);
    if (attaching) return attaching;
    const attempt = Promise.resolve()
      .then(async () => {
        let attached = false;
        try {
          await this._extension.send(
            "chrome.debugger.attach",
            [{ tabId }, "1.3"],
            tabCommandTimeout,
            signal,
          );
          attached = true;
          const result = await this._extension.send(
            "chrome.debugger.sendCommand",
            [{ tabId }, "Target.getTargetInfo"],
            tabCommandTimeout,
            signal,
          );
          if (this._attaching.get(tabId) !== attempt)
            throw new Error("Chrome tab closed or detached while connecting.");
          const { targetInfo } = z.object({ targetInfo: targetInfoSchema }).parse(result);
          const sessionId = `pw-tab-${this._nextSessionId++}`;
          targetInfo.browserContextId ??= "mirai-default";
          const tab: TabSession = { tabId, sessionId, targetInfo, childSessions: new Set() };
          this._tabSessions.set(tabId, tab);
          if (this._autoAttach) this._announceTab(tab);
          return tab;
        } catch (error) {
          if (attached && this._attaching.get(tabId) === attempt)
            await this._extension
              .send("chrome.debugger.detach", [{ tabId }], tabCommandTimeout)
              .catch(() => {});
          throw error;
        }
      })
      .finally(() => {
        if (this._attaching.get(tabId) === attempt) this._attaching.delete(tabId);
      });
    this._attaching.set(tabId, attempt);
    return attempt;
  }

  private _announceTab({ sessionId, targetInfo }: TabSession) {
    this._delegate.sendToCDPClient({
      method: "Target.attachedToTarget",
      params: {
        sessionId,
        targetInfo: { ...targetInfo, attached: true },
        waitingForDebugger: false,
      },
    });
  }

  private _detachTab(tabId: number): void {
    this._extension.rejectTarget(tabId);
    this._attaching.delete(tabId);
    const tabSession = this._tabSessions.get(tabId);
    if (!tabSession) return;
    this._tabSessions.delete(tabId);
    this._delegate.sendToCDPClient({
      method: "Target.detachedFromTarget",
      params: {
        sessionId: tabSession.sessionId,
        targetId: tabSession.targetInfo?.targetId,
      },
    });
  }

  private _findTabSession(predicate: (session: TabSession) => boolean): TabSession | undefined {
    for (const session of this._tabSessions.values()) {
      if (predicate(session)) return session;
    }
    return undefined;
  }
}

// Correlates requests and responses from the extension.
class ExtensionConnection {
  private readonly _ws: ExtensionTransport;
  private readonly _callbacks = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: unknown) => void;
      command: string;
      target?: DebuggerSession;
    }
  >();
  private _closed = false;
  private _onmessage: (event: ExtensionEvent) => void;
  private _onclose: (reason: string) => void;

  constructor(
    socket: ExtensionTransport,
    onmessage: (event: ExtensionEvent) => void,
    onclose: (reason: string) => void,
  ) {
    this._ws = socket;
    this._onmessage = onmessage;
    this._onclose = onclose;
    this._ws.on("message", this._onMessage.bind(this));
    this._ws.on("close", this._onClose.bind(this));
    this._ws.on("error", this._onError.bind(this));
  }

  async send<M extends keyof ExtensionCommands>(
    method: M,
    params: ExtensionCommands[M]["params"],
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    signal?.throwIfAborted();
    if (this._closed || this._ws.readyState !== ws.OPEN)
      throw new Error("Chrome extension connection is closed.");
    const id = ++nextExtensionCommandId;
    const command = method === "chrome.debugger.sendCommand" ? String(params[1]) : method;
    const first = params[0];
    const target = typeof first === "object" && first && "tabId" in first ? first : undefined;
    const response = new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject, command, target });
    });
    const cancel = (reason: unknown) => {
      const callback = this._callbacks.get(id);
      if (!callback) return;
      this._callbacks.delete(id);
      callback.reject(reason);
      this._cancelRemote(id);
    };
    const abort = () => cancel(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () => cancel(new BrowserCommandTimeout(command, timeoutMs)),
      timeoutMs,
    );
    try {
      try {
        void Promise.resolve(this._ws.send(JSON.stringify({ id, method, params }))).catch(
          (error: unknown) => this._callbacks.get(id)?.reject(error),
        );
      } catch (error) {
        this._callbacks.get(id)?.reject(error);
      }
      return await response;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      this._callbacks.delete(id);
    }
  }

  rejectTarget(tabId: number, sessionId?: string) {
    for (const [id, callback] of this._callbacks) {
      if (
        callback.target?.tabId !== tabId ||
        (sessionId !== undefined && callback.target.sessionId !== sessionId)
      )
        continue;
      this._callbacks.delete(id);
      callback.reject(
        new Error(
          `${callback.command}: Chrome debugger target detached. Inspect or select the tab again.`,
        ),
      );
      this._cancelRemote(id);
    }
  }

  private _cancelRemote(id: number) {
    if (this._closed || this._ws.readyState !== ws.OPEN) return;
    // Chrome cannot retract CDP commands it has already received. Drop late replies.
    try {
      void Promise.resolve(
        this._ws.send(JSON.stringify({ method: "extension.cancel", params: [id] })),
      ).catch(() => {});
    } catch {
      // The request is already terminal.
    }
  }

  close(message: string) {
    debugLogger("closing extension connection:", message);
    if (this._closed) return;
    this._dispose();
    if (this._ws.readyState === ws.OPEN) this._ws.close(1000, message.slice(0, 100));
  }

  private _onMessage(event: ws.RawData) {
    if (this._closed) return;
    const eventData = event.toString();
    try {
      this._handleParsedMessage(extensionEnvelope.parse(JSON.parse(eventData)));
    } catch {
      debugLogger("Closing websocket due to an invalid extension frame");
      this.close("Invalid Chrome extension frame");
    }
  }

  private _handleParsedMessage(object: z.infer<typeof extensionEnvelope>) {
    if (object.id === undefined) {
      const event = extensionEventSchema.safeParse(object);
      if (event.success) this._onmessage(event.data);
      return;
    }
    const callback = this._callbacks.get(object.id);
    if (!callback) {
      debugLogger("Unexpected extension response");
      return;
    }
    this._callbacks.delete(object.id);
    if (object.error)
      callback.reject(
        new Error(`${callback.command}: ${object.error}`, {
          cause: new Error(object.error),
        }),
      );
    else callback.resolve(object.result);
  }

  private _onClose(code: number, reason: Buffer) {
    const message = reason.toString();
    debugLogger(`<ws closed> code=${code} reason=${message}`);
    this._dispose();
    this._onclose(message);
  }

  private _onError(event: ws.ErrorEvent) {
    debugLogger(`<ws error> message=${event.message} type=${event.type} target=${event.target}`);
    this.close("Chrome extension transport failed");
  }

  private _dispose() {
    this._closed = true;
    for (const callback of this._callbacks.values())
      callback.reject(
        new Error(`${callback.command}: WebSocket closed. Reconnect the Chrome extension.`),
      );
    this._callbacks.clear();
  }
}
