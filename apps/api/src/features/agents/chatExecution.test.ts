import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createChatExecution, type ChatOwner } from "./chatExecution.js";

const { end } = vi.hoisted(() => ({ end: vi.fn().mockResolvedValue(undefined) }));
vi.mock("pg", () => ({
  Client: class {
    async connect() {}
    on() {}
    off() {}
    end = end;
    async query() {
      return { rows: [{ locked: true }] };
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("aborts the socket's execution and drains an in-flight write before releasing the execution lock", async () => {
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  let finishWrite!: () => void;
  const write = new Promise<void>((resolve) => {
    finishWrite = resolve;
  });
  const executionSession = vi.fn().mockResolvedValue({ events: [] });
  const appendEvent = vi.fn().mockResolvedValue(undefined);
  type Run = Parameters<typeof createChatExecution>[1]["run"];
  const run = vi.fn<Run>(async (_scope, _text, _locale, _browser, signal) => {
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
  });
  const execution = createChatExecution(
    {
      executionSession,
      rememberExecution: vi.fn(),
      service: { appendEvent },
    } as unknown as Parameters<typeof createChatExecution>[0],
    { run } as unknown as Parameters<typeof createChatExecution>[1],
    {} as Parameters<typeof createChatExecution>[2],
  );
  const abort = new AbortController();
  const owner: ChatOwner = {
    accountId: "account",
    signal: abort.signal,
    send: vi.fn(),
    browser: async () => undefined,
  };
  const instanceId = randomUUID();
  const command = (text: string) => ({
    kind: "message" as const,
    message: { id: randomUUID(), instanceId, text, locale: "es" as const },
  });

  try {
    await execution.enqueue(owner, "chat", command("Hola"));
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    appendEvent.mockReturnValueOnce(write);
    const pending = execution.enqueue(owner, "chat", command("Otro mensaje"));
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(appendEvent).toHaveBeenCalledTimes(2));

    abort.abort();
    const finished = execution.disconnect(owner);
    expect(run.mock.calls[0]![4].aborted).toBe(true);
    expect(end).not.toHaveBeenCalled();
    await expect(execution.enqueue(owner, "chat", command("Después del cierre"))).rejects.toThrow();
    finishWrite();
    await rejected;
    await finished;
    expect(end).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  } finally {
    finishWrite();
    await execution.disconnect(owner);
  }
});
