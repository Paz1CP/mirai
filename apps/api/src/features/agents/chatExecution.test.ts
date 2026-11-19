import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createChatExecution } from "./chatExecution.js";

const { lock, listen } = vi.hoisted(() => ({ lock: vi.fn(), listen: vi.fn() }));
vi.mock("pg", () => ({
  Client: class {
    async connect() {}
    on() {}
    off() {}
    async end() {}
    async query(sql: string) {
      if (sql.startsWith("SELECT")) return lock();
      return listen();
    }
  },
}));

afterEach(() => vi.unstubAllEnvs());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("checks ownership while subscribing and accepts a stored message during campaign recovery", async () => {
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  const lease = deferred<{ rows: { locked: boolean }[] }>();
  const subscribed = deferred<void>();
  const recovery = deferred<void>();
  const saved = deferred<void>();
  const finished = deferred<void>();
  lock.mockReturnValue(lease.promise);
  listen.mockReturnValue(subscribed.promise);
  const owned = vi.fn().mockResolvedValue({ events: [] });
  const appendEvent = vi.fn().mockReturnValue(saved.promise);
  const run = vi.fn();
  const latestChatCampaign = vi.fn().mockResolvedValue(null);
  const execution = createChatExecution(
    { owned, service: { appendEvent } } as unknown as Parameters<typeof createChatExecution>[0],
    { run } as unknown as Parameters<typeof createChatExecution>[1],
    {
      latestChatCampaign,
      stopInterruptedCampaigns: () => recovery.promise,
    } as unknown as Parameters<typeof createChatExecution>[2],
    { validatePresence: async () => true } as unknown as Parameters<typeof createChatExecution>[3],
    async () => undefined,
  );
  const accountId = "account";
  const chatId = "chat";
  const instanceId = randomUUID();
  const unsubscribe = execution.subscribe(accountId, chatId, (event) => {
    if (event.type === "status" && !event.working) finished.resolve();
  });
  const accepted = vi.fn();
  const send = execution
    .enqueue(accountId, chatId, instanceId, {
      kind: "message",
      message: { id: randomUUID(), instanceId, text: "Hola", locale: "es" },
    })
    .then(accepted);
  try {
    await vi.waitFor(() => expect(lock).toHaveBeenCalled());
    expect(owned).not.toHaveBeenCalled();
    lease.resolve({ rows: [{ locked: true }] });
    await vi.waitFor(() => expect(owned).toHaveBeenCalledWith(accountId, chatId, true));
    expect(appendEvent).not.toHaveBeenCalled();
    subscribed.resolve();
    await vi.waitFor(() => expect(appendEvent).toHaveBeenCalledOnce());
    expect(accepted).not.toHaveBeenCalled();
    saved.resolve();
    await send;
    expect(run).not.toHaveBeenCalled();
    recovery.resolve();
    await finished.promise;
    expect(latestChatCampaign).toHaveBeenCalledWith(accountId, chatId);
    expect(run).toHaveBeenCalledOnce();
  } finally {
    lease.resolve({ rows: [{ locked: true }] });
    subscribed.resolve();
    saved.resolve();
    recovery.resolve();
    unsubscribe();
  }
});
