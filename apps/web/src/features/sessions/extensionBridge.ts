import {
  bridgeRequestSchema,
  bridgeResponseSchema,
  decodeBridgeMessage,
  type Control,
  type BridgeResponse,
} from "@mirai/contracts";

export function requestExtension(
  input:
    | { type: "status" | "disconnect"; control: Control }
    | {
        type: "connect";
        control: Control;
        ticket: string;
        renew?: boolean;
      },
) {
  const request = bridgeRequestSchema.parse({
    ...input,
    control: { instanceId: input.control.instanceId },
    channel: "mirai:web",
    version: 1,
    requestId: crypto.randomUUID(),
  });
  return new Promise<BridgeResponse["status"]>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      // Firefox can hide the source of messages crossing an extension compartment.
      if (
        (event.source !== window && event.source !== null) ||
        event.origin !== window.location.origin
      )
        return;
      const parsed = bridgeResponseSchema.safeParse(decodeBridgeMessage(event.data));
      if (!parsed.success || parsed.data.requestId !== request.requestId) return;
      cleanup();
      resolve(parsed.data.status);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("EXTENSION_UNAVAILABLE"));
    }, 7000);
    window.addEventListener("message", onMessage);
    window.postMessage(JSON.stringify(request), window.location.origin);
  });
}
