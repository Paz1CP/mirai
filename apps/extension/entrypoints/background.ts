import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { extensionPortName, workspacePortName } from "@mirai/contracts";
import { connectRemoteBrowser } from "../lib/remoteBrowser";
import { miraiWebOrigins, workspaceUrl } from "../lib/webOrigins";
import { connectWorkspace } from "../lib/workspace";

export default defineBackground(() => {
  browser.runtime.onConnect.addListener((port) => {
    const sender = port.sender;
    if (
      (port.name !== extensionPortName && port.name !== workspacePortName) ||
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
    if (port.name === workspacePortName)
      connectWorkspace(port, workspaceUrl(new URL(sender.url).origin), sender.tab.id);
    else connectRemoteBrowser(port, sender.tab.id);
  });
});
