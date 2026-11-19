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
 * Tabs reported via `chrome.tabs.onCreated` are recorded as "known" without
 * attaching. `Target.setAutoAttach` from Playwright attaches to every known
 * tab and emits `Target.attachedToTarget` for each; later tab creates,
 * debugger detaches and removes are translated into CDP events on the fly.
 */

// Adapted by Mirai from microsoft/playwright at 28c4b2e0ad892723c17c0b8d280207c1da670998.
import ws from "ws";

import { debuglog } from "node:util";
import { z } from "zod";

import type { WebSocket } from "ws";
import type { DebuggerSession, ExtensionCommands, ExtensionEvent } from "./protocol.js";

const debugLogger = debuglog("mirai-playwright");
const targetInfoSchema = z.looseObject({ targetId: z.string() });
const tabCreatedSchema = z.object({ id: z.number().int() });
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
  private _background: boolean;
  // Tabs reported by the extension, whether or not the debugger is attached yet.
  private _knownTabIds = new Set<number>();
  // Subset of _knownTabIds we've attached the debugger to and assigned a sessionId.
  private _tabSessions = new Map<number, TabSession>();
  private _autoAttach = false;
  private _nextSessionId = 1;

  constructor(socket: WebSocket, background: boolean, delegate: BrowserModelDelegate) {
    this._delegate = delegate;
    this._background = background;
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
  ): Promise<unknown> {
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
        await this._enableAutoAttach();
        return {};
      case "Target.createTarget":
        return await this._createTarget(z.string().optional().parse(params?.url));
      case "Target.closeTarget":
        return await this._closeTarget(z.string().optional().parse(params?.targetId));
      case "Target.getTargetInfo":
        return sessionId
          ? this._findTabSession((s) => s.sessionId === sessionId)?.targetInfo
          : undefined;
      case "Page.bringToFront":
      case "Target.activateTarget":
        if (this._background) return {};
        break;
    }
    return await this._extension.send("chrome.debugger.sendCommand", [
      this._debuggerTarget(method, sessionId),
      method,
      params,
    ]);
  }

  // Turn auto-attach on and attach to every tab we already know about.
  private async _enableAutoAttach(): Promise<void> {
    this._autoAttach = true;
    const tabIds = [...this._knownTabIds];
    await Promise.all(
      tabIds.map((tabId) => {
        const existing = this._tabSessions.get(tabId);
        if (existing) {
          this._delegate.sendToCDPClient({
            method: "Target.attachedToTarget",
            params: {
              sessionId: existing.sessionId,
              targetInfo: { ...existing.targetInfo, attached: true },
              waitingForDebugger: false,
            },
          });
          return undefined;
        }
        return this._attachTab(tabId).catch(() => debugLogger("Could not attach owned tab"));
      }),
    );
  }

  disconnectCdpClient(): void {
    this._autoAttach = false;
  }

  private async _createTarget(url: string | undefined): Promise<{ targetId: string | undefined }> {
    const response = await this._extension.send("chrome.tabs.create", [
      { url, active: !this._background },
    ]);
    const tab = tabCreatedSchema.parse(response);
    this._knownTabIds.add(tab.id);
    const tabSession = await this._attachTab(tab.id);
    return { targetId: tabSession.targetInfo?.targetId };
  }

  private async _closeTarget(targetId: string | undefined): Promise<{ success: boolean }> {
    const tabSession = targetId
      ? this._findTabSession((s) => s.targetInfo?.targetId === targetId)
      : undefined;
    if (!tabSession) return { success: false };
    await this._extension.send("chrome.tabs.remove", [tabSession.tabId]);
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
    throw new Error(`No tab found for sessionId: ${sessionId}`);
  }

  private _onExtensionEvent(event: ExtensionEvent): void {
    switch (event.method) {
      case "chrome.tabs.onCreated": {
        const [tab] = event.params;
        if (tab.id === undefined) break;
        this._knownTabIds.add(tab.id);
        if (this._autoAttach)
          void this._attachTab(tab.id).catch(() => debugLogger("Could not attach owned tab"));
        break;
      }
      case "chrome.tabs.onRemoved": {
        const [tabId] = event.params;
        this._knownTabIds.delete(tabId);
        this._detachTab(tabId);
        break;
      }
      case "chrome.debugger.onEvent": {
        const [source, method, params] = event.params;
        this._onDebuggerEvent(source, method, params);
        break;
      }
      case "chrome.debugger.onDetach": {
        const [source] = event.params;
        if (source.tabId !== undefined) {
          this._knownTabIds.delete(source.tabId);
          this._detachTab(source.tabId);
        }
        break;
      }
      case "extension.initialized":
        this._delegate.onInitialized();
        break;
    }
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
    else if (method === "Target.detachedFromTarget" && childSessionId)
      tabSession.childSessions.delete(childSessionId);
    // Top-level CDP events for the tab use the tab's relay sessionId.
    // Child CDP sessions (workers, oopifs) keep their own sessionId.
    const sessionId = source.sessionId || tabSession.sessionId;
    this._delegate.sendToCDPClient({ sessionId, method, params });
  }

  private async _attachTab(tabId: number): Promise<TabSession> {
    const existing = this._tabSessions.get(tabId);
    if (existing) return existing;
    await this._extension.send("chrome.debugger.attach", [{ tabId }, "1.3"]);
    const result = await this._extension.send("chrome.debugger.sendCommand", [
      { tabId },
      "Target.getTargetInfo",
    ]);
    const { targetInfo } = z.object({ targetInfo: targetInfoSchema }).parse(result);
    const sessionId = `pw-tab-${this._nextSessionId++}`;
    const tabSession: TabSession = { tabId, sessionId, targetInfo, childSessions: new Set() };
    this._tabSessions.set(tabId, tabSession);
    this._delegate.sendToCDPClient({
      method: "Target.attachedToTarget",
      params: {
        sessionId,
        targetInfo: { ...targetInfo, attached: true },
        waitingForDebugger: false,
      },
    });
    return tabSession;
  }

  private _detachTab(tabId: number): void {
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

// Typed request/response channel over the extension WebSocket.
class ExtensionConnection {
  private readonly _ws: WebSocket;
  private readonly _callbacks = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void; error: Error }
  >();
  private _lastId = 0;
  private _onmessage: (event: ExtensionEvent) => void;
  private _onclose: (reason: string) => void;

  constructor(
    socket: WebSocket,
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
  ): Promise<unknown> {
    if (this._ws.readyState !== ws.OPEN)
      throw new Error(`Unexpected WebSocket state: ${this._ws.readyState}`);
    const id = ++this._lastId;
    this._ws.send(JSON.stringify({ id, method, params }));
    const error = new Error(`Protocol error: ${method}`);
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject, error });
    });
  }

  close(message: string) {
    debugLogger("closing extension connection:", message);
    if (this._ws.readyState === ws.OPEN) this._ws.close(1000, message);
  }

  private _onMessage(event: ws.RawData) {
    const eventData = event.toString();
    try {
      this._handleParsedMessage(extensionEnvelope.parse(JSON.parse(eventData)));
    } catch {
      debugLogger("Closing websocket due to an invalid extension frame");
      this._ws.close();
    }
  }

  private _handleParsedMessage(object: z.infer<typeof extensionEnvelope>) {
    if (object.id === undefined) {
      if (object.method !== "mirai.keepalive" && object.method && object.params)
        this._onmessage(object as ExtensionEvent);
      return;
    }
    const callback = this._callbacks.get(object.id);
    if (!callback) {
      debugLogger("Unexpected extension response");
      return;
    }
    this._callbacks.delete(object.id);
    if (object.error) callback.reject(new Error(object.error, { cause: callback.error }));
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
    this._dispose();
  }

  private _dispose() {
    for (const callback of this._callbacks.values()) callback.reject(new Error("WebSocket closed"));
    this._callbacks.clear();
  }
}
