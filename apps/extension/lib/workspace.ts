import {
  decodeBridgeMessage,
  workspaceClientSchema,
  workspaceExtensionFrame,
  workspaceServerSchema,
  type WorkspaceClientFrame,
  type WorkspaceServerFrame,
} from "@mirai/contracts";
import type { Browser } from "wxt/browser";
import { connectRemoteBrowser } from "./remoteBrowser";

type Port = Browser.runtime.Port;
type Open = Extract<WorkspaceClientFrame, { type: "open" }>;
type Command = Extract<WorkspaceClientFrame, { requestId: string }>;

const workspaces = new Map<string, Workspace>();

class Workspace {
  private readonly sessionId = crypto.randomUUID();
  private readonly authorized = new Set<Port>();
  private readonly attaching = new Map<string, { port: Port; token: string }>();
  private readonly requests = new Map<string, { port: Port; frame: Command; queued?: boolean }>();
  private readonly browsers = new Map<
    string,
    {
      frame: (value: string) => void;
      close: () => void;
    }
  >();
  private socket: WebSocket;
  private successor?: WebSocket;
  private instanceId?: string;
  private heartbeat?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    private readonly key: string,
    private readonly url: string,
    private readonly accountId: string,
    readonly tabId: number,
    open: Open,
  ) {
    this.socket = this.connect({
      type: "open",
      token: open.token,
      accountId,
      tabId: this.sessionId,
      expectedInstanceId: open.expectedInstanceId,
    });
    this.heartbeat = setInterval(() => {
      this.send({ type: "control.keepalive" });
      if (this.successor) this.send({ type: "control.keepalive" }, this.successor);
    }, 20_000);
  }

  get instance() {
    return this.instanceId;
  }

  attach(port: Port, token: string) {
    const requestId = crypto.randomUUID();
    this.attaching.set(requestId, { port, token });
    if (this.instanceId && !this.successor) this.send({ type: "control.attach", requestId, token });
  }

  detach(port: Port) {
    this.authorized.delete(port);
    for (const [id, request] of this.attaching)
      if (request.port === port) this.attaching.delete(id);
    for (const [id, request] of this.requests) if (request.port === port) this.requests.delete(id);
  }

  command(port: Port, frame: Command) {
    if (!this.authorized.has(port) || frame.type === "control.attach") return;
    this.requests.set(frame.requestId, { port, frame, queued: Boolean(this.successor) });
    if (!this.successor) this.send(frame);
  }

  private send(frame: WorkspaceClientFrame, socket = this.socket) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  }

  private post(port: Port, frame: WorkspaceServerFrame) {
    try {
      port.postMessage(JSON.stringify(frame));
    } catch {
      this.detach(port);
    }
  }

  private broadcast(frame: WorkspaceServerFrame) {
    for (const port of this.authorized) this.post(port, frame);
  }

  private connect(open: Open, retry = true) {
    const connection = new WebSocket(this.url);
    let rejected = false;
    connection.onopen = () => this.send(open, connection);
    connection.onmessage = ({ data }) => {
      if (this.closed || (connection !== this.socket && connection !== this.successor)) return;
      const parsed = workspaceServerSchema.safeParse(decodeBridgeMessage(data));
      if (!parsed.success) return;
      const frame = parsed.data;
      switch (frame.type) {
        case "control.renew":
          if (!this.successor && this.instanceId)
            this.successor = this.connect({
              type: "open",
              accountId: this.accountId,
              tabId: this.sessionId,
              expectedInstanceId: this.instanceId,
              renewal: { chatId: frame.chatId, chatIds: frame.chatIds },
            });
          return;
        case "control.ready":
          this.instanceId = frame.instanceId;
          workspaces.set(this.key, this);
          if (connection === this.successor) {
            const previous = this.socket;
            this.socket = connection;
            this.successor = undefined;
            previous.close();
            for (const [requestId, request] of this.requests) {
              if (request.queued) {
                const command = request.frame;
                request.queued = false;
                this.send(
                  command.type === "chat.send"
                    ? { ...command, message: { ...command.message, instanceId: frame.instanceId } }
                    : command,
                );
                continue;
              }
              this.requests.delete(requestId);
              this.post(request.port, { type: "error", requestId, code: "CONNECTION_LOST" });
            }
            // Stops queued while the socket switched reach the successor before it restores.
            this.send({ type: "control.restore" });
            this.broadcast(frame);
          }
          for (const [requestId, { token }] of this.attaching)
            this.send({ type: "control.attach", requestId, token });
          return;
        case "control.attached": {
          const pending = this.attaching.get(frame.requestId);
          if (!pending) return;
          this.attaching.delete(frame.requestId);
          this.authorized.add(pending.port);
          this.post(pending.port, {
            type: "control.ready",
            instanceId: frame.instanceId,
            activeChats: frame.activeChats,
          });
          return;
        }
        case "browser.frame":
          if (frame.chatId) this.browser(frame.chatId).frame(frame.frame);
          return;
        case "browser.reset":
          if (frame.chatId) this.browsers.get(frame.chatId)?.close();
          return;
        case "accepted":
        case "error":
          if (frame.requestId) {
            const pending = this.attaching.get(frame.requestId);
            const request = this.requests.get(frame.requestId);
            if (request && frame.type === "error" && frame.code === "WORKSPACE_RENEWING") {
              request.queued = true;
              return;
            }
            this.attaching.delete(frame.requestId);
            this.requests.delete(frame.requestId);
            if (pending && frame.type === "error")
              this.post(pending.port, { type: "error", code: frame.code });
            if (request) this.post(request.port, frame);
            return;
          }
          if (connection === this.successor) {
            rejected = true;
            return;
          }
          if (frame.type === "error") {
            this.broadcast(frame);
            for (const { port } of this.attaching.values()) this.post(port, frame);
          }
          return;
        default:
          this.broadcast(frame);
      }
    };
    connection.onclose = () => {
      if (connection === this.successor) {
        this.successor = undefined;
        if (retry && !rejected && this.socket.readyState === WebSocket.OPEN)
          this.successor = this.connect(open, false);
        else if (this.socket.readyState !== WebSocket.OPEN) this.close();
      } else if (connection === this.socket && !this.successor) this.close();
    };
    return connection;
  }

  private close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    if (workspaces.get(this.key) === this) workspaces.delete(this.key);
    for (const browser of this.browsers.values()) browser.close();
    this.socket.close();
    this.successor?.close();
    for (const port of [
      ...this.authorized,
      ...[...this.attaching.values()].map(({ port }) => port),
    ])
      port.disconnect();
  }

  private browser(chatId: string) {
    const existing = this.browsers.get(chatId);
    if (existing) return existing;
    let receive!: (frame: unknown) => void;
    let disconnect!: () => void;
    const scope = {
      frame: (value: string) => receive(value),
      close: () => {
        this.browsers.delete(chatId);
        disconnect();
      },
    };
    this.browsers.set(chatId, scope);
    connectRemoteBrowser(
      {
        onMessage: {
          addListener: (listener) => {
            receive = listener;
          },
        },
        onDisconnect: {
          addListener: (listener) => {
            disconnect = listener;
          },
        },
        postMessage: (frame: string) => this.send({ type: "browser.frame", chatId, frame }),
        disconnect: scope.close,
      },
      this.tabId,
    );
    return scope;
  }
}

export function connectWorkspace(port: Port, url: string, controllerTabId: number) {
  let workspace: Workspace | undefined;
  port.onDisconnect.addListener(() => workspace?.detach(port));
  port.onMessage.addListener((data: unknown) => {
    const parsed = workspaceClientSchema.safeParse(decodeBridgeMessage(data));
    if (!parsed.success) return;
    const frame = parsed.data;
    if (workspace) {
      if ("requestId" in frame) workspace.command(port, frame);
      return;
    }
    if (frame.type !== "open" || !frame.token || !frame.accountId || frame.renewal) return;
    const key = JSON.stringify([url, frame.accountId]);
    const existing = workspaces.get(key);
    if (
      existing &&
      existing.tabId !== controllerTabId &&
      (!frame.expectedInstanceId || frame.expectedInstanceId !== existing.instance)
    ) {
      port.postMessage(
        JSON.stringify({ type: "error", code: "CONTROL_CONFLICT", instanceId: existing.instance }),
      );
      return;
    }
    workspace =
      existing?.tabId === controllerTabId
        ? existing
        : new Workspace(key, url, frame.accountId, controllerTabId, frame);
    if (!existing) workspaces.set(key, workspace);
    workspace.attach(port, frame.token);
  });
  port.postMessage(workspaceExtensionFrame);
}
