import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { bridgeRequestSchema, bridgeResponseSchema, decodeBridgeMessage } from "@mirai/contracts";

export default defineContentScript({
  // Firefox match patterns cannot target a port; the exact origin is checked below.
  matches: [
    `${new URL(import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000").protocol}//${new URL(import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000").hostname}/*`,
  ],
  runAt: "document_start",
  main(ctx) {
    if (window.location.origin !== (import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000"))
      return;
    ctx.addEventListener(window, "message", async (event) => {
      if (
        (event.source !== window && event.source !== null) ||
        event.origin !== window.location.origin ||
        window !== window.top
      )
        return;
      const parsed = bridgeRequestSchema.safeParse(decodeBridgeMessage(event.data));
      if (!parsed.success) return;
      const request = parsed.data;
      try {
        const result = bridgeResponseSchema.parse(await browser.runtime.sendMessage(request));
        if (result.requestId === request.requestId)
          window.postMessage(JSON.stringify(result), window.location.origin);
      } catch {
        window.postMessage(
          JSON.stringify({
            channel: "mirai:extension",
            version: 1,
            requestId: request.requestId,
            status: "error",
          }),
          window.location.origin,
        );
      }
    });
  },
});
