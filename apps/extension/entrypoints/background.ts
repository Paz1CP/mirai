import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { extensionPortName } from "@mirai/contracts";
import { connectRemoteBrowser } from "../lib/remoteBrowser";
import { miraiWebOrigins } from "../lib/webOrigins";

export default defineBackground(() => {
  browser.runtime.onConnect.addListener((port) => {
    const sender = port.sender;
    if (
      port.name !== extensionPortName ||
      sender?.tab?.id === undefined ||
      sender.frameId !== 0 ||
      !sender.url ||
      !miraiWebOrigins.includes(new URL(sender.url).origin) ||
      typeof chrome === "undefined" ||
      !chrome.debugger
    ) {
      port.disconnect();
      return;
    }
    connectRemoteBrowser(port, sender.tab.id);
  });
});
