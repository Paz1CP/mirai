import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { extensionPortName } from "@mirai/contracts";
import { connectRemoteBrowser } from "../lib/remoteBrowser";

export default defineBackground(() => {
  browser.runtime.onConnect.addListener((port) => {
    const sender = port.sender;
    const origin = import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000";
    if (
      port.name !== extensionPortName ||
      sender?.tab?.id === undefined ||
      sender.frameId !== 0 ||
      !sender.url ||
      new URL(sender.url).origin !== origin ||
      typeof chrome === "undefined" ||
      !chrome.debugger
    ) {
      port.disconnect();
      return;
    }
    connectRemoteBrowser(port, sender.tab.id);
  });
});
