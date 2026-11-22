import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { bridgeRequestSchema, decodeBridgeMessage, extensionPortName } from "@mirai/contracts";
import { miraiWebMatches, miraiWebOrigins } from "../lib/webOrigins";

export default defineContentScript({
  matches: miraiWebMatches,
  runAt: "document_start",
  main(ctx) {
    const origin = window.location.origin;
    if (!miraiWebOrigins.includes(origin) || window !== window.top) return;
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
        const reportClosed = () =>
          window.postMessage(
            JSON.stringify({ channel: "mirai:extension", bridgeId: id, type: "closed" }),
            origin,
          );
        let port: ReturnType<typeof browser.runtime.connect>;
        try {
          port = browser.runtime.connect({ name: extensionPortName });
        } catch {
          reportClosed();
          return;
        }
        current = { id, port };
        port.onMessage.addListener((frame: unknown) => {
          if (current?.port === port && typeof frame === "string")
            window.postMessage(
              JSON.stringify({ channel: "mirai:extension", bridgeId: id, type: "frame", frame }),
              origin,
            );
        });
        port.onDisconnect.addListener(() => {
          // Chrome exposes the disconnect reason only while this listener runs.
          void browser.runtime.lastError;
          if (current?.port !== port) return;
          current = undefined;
          reportClosed();
        });
      } else if (current?.id === message.bridgeId) {
        if (message.type === "disconnect") close();
        else current.port.postMessage(message.frame);
      }
    });
  },
});
