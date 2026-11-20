import { once } from "node:events";
import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createBrowserRelay } from "./browserRelay.js";

it("sends commands directly to Chrome and rejects unanswered commands when its socket closes", async () => {
  const validatePresence = vi.fn().mockResolvedValue(true);
  const relay = createBrowserRelay({ validatePresence, depart: vi.fn() });
  const server = createServer();
  relay.attach(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const ticket = relay.issue("account", "controller");
  if (!address || typeof address === "string" || ticket.ready)
    throw new Error("Expected a server and ticket");
  const extensionId = process.env.MIRAI_CHROME_EXTENSION_ID ?? "abcdefghijklmnopabcdefghijklmnop";
  const chrome = new WebSocket(
    `ws://127.0.0.1:${address.port}/v1/browser/extension`,
    ["mirai.browser.v2", `mirai-ticket.${ticket.ticket}`],
    { origin: `chrome-extension://${extensionId}` },
  );
  try {
    await once(chrome, "open");
    const ready = once(chrome, "message");
    chrome.send('{"method":"extension.initialized","params":[]}');
    const [greeting] = await ready;
    expect(String(greeting)).toBe('{"method":"mirai.connectionReady"}');
    const binding = relay.bindingFor("account", "controller");
    if (!binding) throw new Error("Expected a bound browser");
    const incoming = once(chrome, "message");
    const action = binding.model.handleCDPCommand(
      "Target.createTarget",
      { url: "https://example.com/" },
      undefined,
    );
    const rejected = expect(action).rejects.toThrow("WebSocket closed");
    const [command] = await incoming;
    expect(JSON.parse(String(command))).toMatchObject({
      method: "chrome.tabs.create",
      params: [{ url: "https://example.com/", active: false }],
    });
    chrome.close();
    await rejected;
    expect(relay.bindingFor("account", "controller")).toBeUndefined();
    expect(validatePresence).toHaveBeenCalledExactlyOnceWith("account", "controller");
  } finally {
    chrome.terminate();
    relay.close();
    server.closeAllConnections();
    server.close();
  }
});
