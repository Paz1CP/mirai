import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { bridgeRequestSchema, type BridgeResponse } from "@mirai/contracts";
import { createRemoteBrowser } from "../lib/remoteBrowser";
export default defineBackground(() => {
  const remote = createRemoteBrowser((tabId, instanceId) => {
    void browser.tabs.sendMessage(tabId, {
      channel: "mirai:extension", type: "browser.disconnected", instanceId,
    }, { frameId: 0 }).catch(() => {});
  });
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
    const request = parsed.data;
    const tabId = sender.tab.id;
    return (async () => {
      if (request.type === "disconnect") remote.disconnect(tabId, request.control.instanceId);
      return {
        channel: "mirai:extension",
        version: 1,
        requestId: request.requestId,
        status:
          request.type === "disconnect"
            ? "disconnected"
            : request.type === "status"
              ? remote.isConnected(tabId, request.control.instanceId) ? "connected" : "available"
              : (await remote.connect(tabId, request.control.instanceId, request.ticket, request.renew))
                ? "connected"
                : "error",
      } satisfies BridgeResponse;
    })();
  });
});
