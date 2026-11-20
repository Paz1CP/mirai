import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createBrowserRelay } from "./browserRelay.js";

const { query, notify, end } = vi.hoisted(() => ({
  query: vi.fn(),
  notify: vi.fn(),
  end: vi.fn(),
}));
vi.mock("pg", () => ({
  Client: class {
    async connect() {}
    on(event: string, callback: (message: { channel: string; payload: string }) => void) {
      if (event === "notification") notify.mockImplementation(callback);
    }
    query = query;
    end = end;
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it.each(["disconnect", "transfer"])("rejects unanswered Chrome commands on %s", async (reason) => {
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  let releaseExecution!: () => void;
  const executionReleased = new Promise<void>((resolve) => {
    releaseExecution = resolve;
  });
  query.mockImplementation((sql: string) =>
    sql.includes("pg_advisory_xact_lock_shared") ? executionReleased : Promise.resolve(),
  );
  end.mockResolvedValue(undefined);
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
    const closed = once(chrome, "close");
    if (reason === "transfer") {
      notify({
        channel: "mirai_control",
        payload: JSON.stringify({
          accountId: "account",
          instanceId: "replacement",
          type: "control.transferred",
        }),
      });
      expect(relay.bindingFor("account", "controller")).toBeUndefined();
      expect(chrome.readyState).toBe(WebSocket.OPEN);
      expect(end).not.toHaveBeenCalled();
      releaseExecution();
      expect((await closed)[0]).toBe(4002);
    } else {
      chrome.close();
      await closed;
    }
    await rejected;
    await vi.waitFor(() => expect(end).toHaveBeenCalledOnce());
    expect(relay.bindingFor("account", "controller")).toBeUndefined();
    expect(validatePresence).toHaveBeenCalledExactlyOnceWith("account", "controller");
  } finally {
    releaseExecution();
    chrome.terminate();
    relay.close();
    server.closeAllConnections();
    server.close();
  }
});
