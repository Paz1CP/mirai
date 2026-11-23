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
    let current:
      | {
          id: string;
          port: ReturnType<typeof browser.runtime.connect>;
          keepAlive: ReturnType<typeof setInterval>;
        }
      | undefined;
    const close = () => {
      if (!current) return;
      const { port, keepAlive } = current;
      current = undefined;
      clearInterval(keepAlive);
      try {
        port.disconnect();
      } catch {
        // A reload can invalidate the extension context before cleanup.
      }
    };
    const reportClosed = (id: string) =>
      window.postMessage(
        JSON.stringify({ channel: "mirai:extension", bridgeId: id, type: "closed" }),
        origin,
      );
    const post = (frame: string | null) => {
      if (!current) return;
      const { id, port } = current;
      try {
        port.postMessage(frame);
      } catch {
        close();
        reportClosed(id);
      }
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
        let port: ReturnType<typeof browser.runtime.connect>;
        try {
          port = browser.runtime.connect({ name: extensionPortName });
        } catch {
          reportClosed(id);
          return;
        }
        // A quiet Manifest V3 port does not keep its worker alive.
        current = { id, port, keepAlive: setInterval(() => post(null), 20_000) };
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
          close();
          reportClosed(id);
        });
      } else if (current?.id === message.bridgeId) {
        if (message.type === "disconnect") close();
        else post(message.frame);
      }
    });
  },
});
