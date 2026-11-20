import { bridgeResponseSchema, decodeBridgeMessage } from "@mirai/contracts";

export function openExtensionBridge(onFrame: (frame: string) => void, onClose: () => void) {
  const bridgeId = crypto.randomUUID();
  const origin = window.location.origin;
  const post = (message: { type: "connect" | "disconnect" } | { type: "frame"; frame: string }) =>
    window.postMessage(JSON.stringify({ channel: "mirai:web", bridgeId, ...message }), origin);
  const receive = (event: MessageEvent<unknown>) => {
    if ((event.source !== window && event.source !== null) || event.origin !== origin) return;
    const parsed = bridgeResponseSchema.safeParse(decodeBridgeMessage(event.data));
    if (!parsed.success || parsed.data.bridgeId !== bridgeId) return;
    if (parsed.data.type === "closed") onClose();
    else onFrame(parsed.data.frame);
  };
  window.addEventListener("message", receive);
  post({ type: "connect" });
  return {
    send: (frame: string) => post({ type: "frame", frame }),
    close() {
      window.removeEventListener("message", receive);
      post({ type: "disconnect" });
    },
  };
}
