import {
  bridgeResponseSchema,
  decodeBridgeMessage,
  extensionReadySchema,
  extensionRestoreFrame,
  workspaceExtensionFrame,
  workspaceTabsSchema,
} from "@mirai/contracts";
import { z } from "zod";

// Backend commands use positive IDs. This read-only probe stays on the local bridge.
const probeId = -1;
const probeResponse = z.object({
  id: z.literal(probeId),
  result: workspaceTabsSchema.optional(),
  error: z.string().optional(),
});
type BridgeFailure = "disconnected" | "incompatible";

type ExtensionConnection = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  send(frame: string): void;
  close(): void;
};

export function openWorkspaceExtension(): Promise<ExtensionConnection | undefined> {
  const page = window;
  const origin = page.location.origin;
  const bridgeId = crypto.randomUUID();
  const post = (
    message:
      | { type: "connect"; workspace: true }
      | { type: "disconnect" }
      | { type: "frame"; frame: string },
  ) => page.postMessage(JSON.stringify({ channel: "mirai:web", bridgeId, ...message }), origin);
  return new Promise((resolve) => {
    const connection: ExtensionConnection = {
      readyState: WebSocket.CONNECTING,
      onopen: null,
      onmessage: null,
      onclose: null,
      send: (frame) => post({ type: "frame", frame }),
      close() {
        clearTimeout(timer);
        page.removeEventListener("message", receive);
        connection.readyState = WebSocket.CLOSED;
        post({ type: "disconnect" });
      },
    };
    function receive(event: MessageEvent<unknown>) {
      if (event.source !== page || event.origin !== origin) return;
      const reply = bridgeResponseSchema.safeParse(decodeBridgeMessage(event.data));
      if (!reply.success || reply.data.bridgeId !== bridgeId) return;
      if (reply.data.type === "closed") {
        connection.close();
        connection.onclose?.();
        resolve(undefined);
      } else if (connection.readyState === WebSocket.CONNECTING) {
        if (reply.data.frame !== workspaceExtensionFrame) {
          connection.close();
          resolve(undefined);
          return;
        }
        clearTimeout(timer);
        connection.readyState = WebSocket.OPEN;
        resolve(connection);
      } else connection.onmessage?.({ data: reply.data.frame });
    }
    const timer = setTimeout(() => {
      connection.close();
      resolve(undefined);
    }, 2_000);
    page.addEventListener("message", receive);
    post({ type: "connect", workspace: true });
  });
}

export function openExtensionBridge(
  onFrame: (frame: string) => void,
  onReady: () => void,
  onClose: (reason: BridgeFailure) => void,
) {
  const bridgeId = crypto.randomUUID();
  const page = window;
  const origin = page.location.origin;
  let readyFrame: string | undefined;
  let connected = false;
  const post = (message: { type: "connect" | "disconnect" } | { type: "frame"; frame: string }) =>
    page.postMessage(JSON.stringify({ channel: "mirai:web", bridgeId, ...message }), origin);
  const receive = (event: MessageEvent<unknown>) => {
    if (event.source !== page || event.origin !== origin) return;
    const parsed = bridgeResponseSchema.safeParse(decodeBridgeMessage(event.data));
    if (!parsed.success || parsed.data.bridgeId !== bridgeId) return;
    if (parsed.data.type === "closed") return onClose("disconnected");
    const { frame } = parsed.data;
    if (
      frame.startsWith('{"method":"extension.initialized",') &&
      extensionReadySchema.safeParse(decodeBridgeMessage(frame)).success
    ) {
      connected = false;
      readyFrame = frame;
      post({
        type: "frame",
        frame: JSON.stringify({ id: probeId, method: "extension.workspaceTabs", params: [] }),
      });
      return;
    }
    if (readyFrame) {
      const reply = probeResponse.safeParse(decodeBridgeMessage(frame));
      if (!reply.success) return;
      if (reply.data.error || !reply.data.result)
        return onClose(
          reply.data.error === "Unknown Playwright relay command."
            ? "incompatible"
            : "disconnected",
        );
      const initialized = readyFrame;
      readyFrame = undefined;
      connected = true;
      onFrame(initialized);
      onReady();
    } else if (connected) onFrame(frame);
  };
  page.addEventListener("message", receive);
  post({ type: "connect" });
  return {
    send: (frame: string) => {
      if (connected) post({ type: "frame", frame });
    },
    restore() {
      connected = false;
      post({ type: "frame", frame: extensionRestoreFrame });
    },
    close() {
      page.removeEventListener("message", receive);
      post({ type: "disconnect" });
    },
  };
}
