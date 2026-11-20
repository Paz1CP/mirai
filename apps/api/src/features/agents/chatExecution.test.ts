import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createChatExecution } from "./chatExecution.js";

const { lock, listen, notify, end } = vi.hoisted(() => ({
  lock: vi.fn(),
  listen: vi.fn(),
  notify: vi.fn(),
  end: vi.fn(),
}));
vi.mock("pg", () => ({
  Client: class {
    async connect() {}
    on(event: string, listener: (message: { channel: string; payload: string }) => void) {
      if (event === "notification") notify.mockImplementation(listener);
    }
    off() {}
    end = end;
    async query(sql: string) {
      if (sql.startsWith("SELECT")) return lock();
      return listen();
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each(["control.departed", "control.transferred", "control.revoked"])(
  "authorizes the run once and aborts it on %s",
  async (type) => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
    const lease = deferred<{ rows: { locked: boolean }[] }>();
    const subscribed = deferred<void>();
    const saved = deferred<void>();
    const queuedWrite = deferred<void>();
    const finished = deferred<void>();
    lock.mockReturnValue(lease.promise);
    end.mockResolvedValue(undefined);
    listen.mockReturnValue(subscribed.promise);
    const executionSession = vi.fn().mockResolvedValue({ events: [] });
    const appendEvent = vi.fn().mockReturnValue(saved.promise);
    type Run = Parameters<typeof createChatExecution>[1]["run"];
    const run = vi.fn<Run>(async (_scope, _text, _locale, _browser, signal) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    });
    const listCampaigns = vi.fn();
    const validatePresence = vi.fn().mockResolvedValue(true);
    const execution = createChatExecution(
      {
        executionSession,
        rememberExecution: vi.fn(),
        service: { appendEvent },
      } as unknown as Parameters<typeof createChatExecution>[0],
      { run } as unknown as Parameters<typeof createChatExecution>[1],
      {
        listCampaigns,
      } as unknown as Parameters<typeof createChatExecution>[2],
      { validatePresence } as unknown as Parameters<typeof createChatExecution>[3],
      async () => undefined,
    );
    const accountId = "account";
    const chatId = "chat";
    const instanceId = randomUUID();
    const controlEvent = () =>
      notify({
        channel: "mirai_control",
        payload: JSON.stringify({
          type,
          accountId,
          instanceId:
            type === "control.departed"
              ? instanceId
              : type === "control.transferred"
                ? randomUUID()
                : null,
        }),
      });
    let working = false;
    const unsubscribe = execution.subscribe(accountId, chatId, (event) => {
      if (event.type === "status" && !event.working && working) finished.resolve();
      if (event.type === "status" && event.working) working = true;
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
      expect(executionSession).not.toHaveBeenCalled();
      lease.resolve({ rows: [{ locked: true }] });
      await vi.waitFor(() => expect(listen).toHaveBeenCalled());
      expect(validatePresence).not.toHaveBeenCalled();
      expect(executionSession).not.toHaveBeenCalled();
      subscribed.resolve();
      await vi.waitFor(() => expect(appendEvent).toHaveBeenCalledOnce());
      expect(accepted).not.toHaveBeenCalled();
      saved.resolve();
      await send;
      await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
      expect(listCampaigns).not.toHaveBeenCalled();
      expect(validatePresence).toHaveBeenCalledExactlyOnceWith(accountId, instanceId);
      const [scope, , , , signal] = run.mock.calls[0]!;
      expect(scope.campaignId).toBeUndefined();
      const pending =
        type === "control.transferred"
          ? execution.enqueue(accountId, chatId, instanceId, {
              kind: "message",
              message: { id: randomUUID(), instanceId, text: "Otro mensaje", locale: "es" },
            })
          : undefined;
      const rejected = pending && expect(pending).rejects.toThrow();
      if (pending) {
        appendEvent.mockReturnValueOnce(queuedWrite.promise);
        await vi.waitFor(() => expect(appendEvent).toHaveBeenCalledTimes(2));
      }
      controlEvent();
      expect(signal.aborted).toBe(true);
      await finished.promise;
      if (pending) expect(end).not.toHaveBeenCalled();
      queuedWrite.resolve();
      await rejected;
      await vi.waitFor(() => expect(end).toHaveBeenCalledOnce());
      expect(run).toHaveBeenCalledOnce();
    } finally {
      lease.resolve({ rows: [{ locked: true }] });
      subscribed.resolve();
      saved.resolve();
      queuedWrite.resolve();
      controlEvent();
      unsubscribe();
    }
  },
);
