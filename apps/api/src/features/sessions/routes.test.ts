import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import { expect, it, vi } from "vitest";
import { createSessionRoutes } from "./routes.js";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("pg", () => ({
  Client: class {
    async connect() {}
    async end() {}
    on() {}
    query = query;
  },
}));

it("keeps the replacement pending until the previous execution and connections are released", async () => {
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  let releaseExecution!: () => void;
  let releaseBrowser!: () => void;
  let releaseControl!: () => void;
  const previousInstanceId = randomUUID();
  const execution = new Promise<void>((resolve) => {
    releaseExecution = resolve;
  });
  const browser = new Promise<void>((resolve) => {
    releaseBrowser = resolve;
  });
  const control = new Promise<void>((resolve) => {
    releaseControl = resolve;
  });
  query.mockImplementation((_sql: string, parameters?: string[]) => {
    if (parameters?.[0] === "mirai-execution:account") return execution;
    if (parameters?.[0] === "mirai-browser:account") return browser;
    if (parameters?.[0] === previousInstanceId) return control;
    return Promise.resolve();
  });
  const instanceId = randomUUID();
  const repository = {
    connect: vi.fn().mockResolvedValue({ instanceId, previousInstanceId }),
    validatePresence: vi.fn().mockResolvedValue(true),
  } as unknown as Parameters<typeof createSessionRoutes>[0];
  const app = express();
  app.use(
    express.json(),
    createSessionRoutes(repository, async () => "account"),
  );
  const server = app.listen(0, "127.0.0.1");
  const disconnect = new AbortController();
  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a port");
    const ready = vi.fn();
    const connecting = fetch(`http://127.0.0.1:${address.port}/session/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedInstanceId: previousInstanceId }),
      signal: disconnect.signal,
    }).then((response) => {
      ready();
      return response;
    });
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith(expect.any(String), ["mirai-execution:account"]),
    );
    expect(ready).not.toHaveBeenCalled();
    releaseExecution();
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith(expect.any(String), ["mirai-browser:account"]),
    );
    expect(ready).not.toHaveBeenCalled();
    releaseBrowser();
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith(expect.any(String), [previousInstanceId]),
    );
    expect(ready).not.toHaveBeenCalled();
    releaseControl();
    const response = await connecting;
    const reader = response.body!.getReader();
    const frame = await reader.read();
    expect(new TextDecoder().decode(frame.value)).toContain(
      JSON.stringify({ type: "control.ready", instanceId }),
    );
    await reader.cancel();
  } finally {
    releaseExecution();
    releaseBrowser();
    releaseControl();
    disconnect.abort();
    server.closeAllConnections();
    server.close();
    vi.unstubAllEnvs();
  }
});
