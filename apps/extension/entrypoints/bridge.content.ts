import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { bridgeRequestSchema, decodeBridgeMessage, extensionPortName } from "@mirai/contracts";

export default defineContentScript({
  matches: [
    `${new URL(import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000").protocol}//${new URL(import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000").hostname}/*`,
  ],
  runAt: "document_start",
  main(ctx) {
    const origin = window.location.origin;
    if (
      origin !== (import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000") ||
      window !== window.top
    )
      return;
    let current: { id: string; port: ReturnType<typeof browser.runtime.connect> } | undefined;
    const close = () => {
      current?.port.disconnect();
      current = undefined;
    };
    ctx.onInvalidated(close);
    ctx.addEventListener(window, "message", (event) => {
      if ((event.source !== window && event.source !== null) || event.origin !== origin) return;
      const parsed = bridgeRequestSchema.safeParse(decodeBridgeMessage(event.data));
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.type === "connect") {
        close();
        const id = message.bridgeId;
        const port = browser.runtime.connect({ name: extensionPortName });
        current = { id, port };
        port.onMessage.addListener((frame: unknown) => {
          if (current?.port === port && typeof frame === "string")
            window.postMessage(
              JSON.stringify({ channel: "mirai:extension", bridgeId: id, type: "frame", frame }),
              origin,
            );
        });
        port.onDisconnect.addListener(() => {
          if (current?.port !== port) return;
          current = undefined;
          window.postMessage(
            JSON.stringify({ channel: "mirai:extension", bridgeId: id, type: "closed" }),
            origin,
          );
        });
      } else if (current?.id === message.bridgeId) {
        if (message.type === "disconnect") close();
        else current.port.postMessage(message.frame);
      }
    });
  },
});
