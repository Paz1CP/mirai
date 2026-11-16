import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { bridgeRequestSchema, type BridgeResponse } from "@mirai/contracts";
export default defineBackground(() => {
  // Presence only: workflow commands will use a live port owned by the controller tab.
  browser.runtime.onMessage.addListener((data: unknown, sender) => {
    const parsed = bridgeRequestSchema.safeParse(data);
    const origin = import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000";
    if (
      !parsed.success ||
      sender.tab?.id === undefined ||
      sender.frameId !== 0 ||
      !sender.url ||
      new URL(sender.url).origin !== origin
    )
      return;
    return Promise.resolve({
      channel: "mirai:extension",
      version: 1,
      requestId: parsed.data.requestId,
      status: parsed.data.type === "status" ? "connected" : "disconnected",
    } satisfies BridgeResponse);
  });
});
