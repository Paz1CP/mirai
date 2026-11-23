import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createChatExecution, type ChatOwner } from "./chatExecution.js";
import { createEvent, type Event } from "@google/adk";
import { miraiTools } from "./miraiTools.js";

const { end, held } = vi.hoisted(() => ({
  end: vi.fn().mockResolvedValue(undefined),
  held: new Set<string>(),
}));
vi.mock("pg", () => ({
  Client: class {
    private key?: string;
    async connect() {}
    on() {}
    off() {}
    async end() {
      if (this.key) held.delete(this.key);
      await end();
    }
    async query(_sql: string, [key]: [string]) {
      if (held.has(key)) return { rows: [{ locked: false }] };
      held.add(key);
      this.key = key;
      return { rows: [{ locked: true }] };
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  held.clear();
});

it("runs 37 independent chats, deduplicates a turn, and isolates cancellation and failure", async () => {
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  const chats = new Map<string, { events: Event[] }>();
  const sessions = {
    async executionSession(_accountId: string, chatId: string) {
      if (!chats.has(chatId)) chats.set(chatId, { events: [] });
      return chats.get(chatId)!;
    },
    rememberExecution() {},
    service: {
      async appendEvent({ session, event }: { session: { events: Event[] }; event: Event }) {
        session.events.push(event);
      },
    },
  } as unknown as Parameters<typeof createChatExecution>[0];
  const signals = new Map<string, AbortSignal>();
  const rejectRun = new Map<string, (reason: Error) => void>();
  const run = vi.fn<Parameters<typeof createChatExecution>[1]["run"]>(
    async ({ chatId, commandId }, _input, _locale, _browser, signal) => {
      chats.get(chatId)?.events.push(
        createEvent({
          author: "user",
          customMetadata: { miraiCommandId: commandId },
        }),
      );
      signals.set(chatId, signal);
      await new Promise<void>((resolve, reject) => {
        rejectRun.set(chatId, reject);
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  );
  const agent = { run, compact: vi.fn(), cancelInteraction: vi.fn() };
  const results = {
    executionActive: async () => false,
    listCampaigns: vi.fn(),
    campaignForChat: vi.fn(),
    transitionCampaign: vi.fn(),
    campaignBudget: vi.fn(),
  };
  const execution = createChatExecution(sessions, agent, results);
  const replica = createChatExecution(sessions, agent, results);
  const owner: ChatOwner = {
    accountId: "parallel-account",
    signal: new AbortController().signal,
    send: vi.fn(),
    browser: async () => undefined,
  };
  const command = {
    kind: "message" as const,
    message: {
      id: randomUUID(),
      instanceId: randomUUID(),
      text: "Research a fixture",
      locale: "en" as const,
    },
  };
  const ids = Array.from({ length: 37 }, (_, index) => `chat-${index}`);
  try {
    await Promise.all(ids.map((chatId) => execution.enqueue(owner, chatId, command)));
    await vi.waitFor(() => expect(signals.size).toBe(37));
    expect(execution.runningChats(owner).map(({ chatId }) => chatId)).toEqual(ids);
    await execution.enqueue(owner, ids[0]!, command);
    const duplicate = { ...owner, send: vi.fn() };
    await replica.enqueue(duplicate, ids[0]!, command);
    await vi.waitFor(() =>
      expect(duplicate.send).toHaveBeenCalledWith(ids[0], {
        type: "status",
        working: false,
        error: "EXECUTION_ALREADY_ACTIVE",
      }),
    );
    expect(run).toHaveBeenCalledTimes(37);
    expect(chats.get(ids[0]!)?.events).toHaveLength(1);

    await execution.stop(owner, ids[1]!);
    expect(signals.get(ids[1]!)?.aborted).toBe(true);
    expect(signals.get(ids[0]!)?.aborted).toBe(false);
    expect(signals.get(ids[2]!)?.aborted).toBe(false);

    rejectRun.get(ids[2]!)!(new Error("Fixture failure"));
    await vi.waitFor(() => expect(execution.runningChats(owner)).toHaveLength(35));
    expect(signals.get(ids[0]!)?.aborted).toBe(false);
    expect(execution.runningChats(owner).map(({ chatId }) => chatId)).toContain(ids[36]);
  } finally {
    await execution.disconnect(owner);
  }
});

it.each([
  "completed",
  "interrupted",
  "partial",
  "renewal",
  "task progress",
  "task paused",
  "task finished",
] as const)("emits a completion only for a successful textual response (%s)", async (outcome) => {
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  const { createEvent } = await import("@google/adk");
  const controller = new AbortController();
  const send = vi.fn();
  type Run = Parameters<typeof createChatExecution>[1]["run"];
  const run = vi.fn<Run>(
    async (scope, _input, _locale, _browser, _signal, _boundary, _restart, emit) => {
      scope.taskMode = outcome.startsWith("task ");
      scope.taskPaused = outcome === "task paused";
      scope.taskFinished = outcome === "task finished";
      emit(
        createEvent({
          author: "mirai",
          partial: outcome === "partial",
          content: { role: "model", parts: [{ text: "Respuesta final" }] },
        }),
      );
      if (outcome === "interrupted") controller.abort();
    },
  );
  const execution = createChatExecution(
    {
      executionSession: vi.fn().mockResolvedValue({ events: [] }),
      rememberExecution: vi.fn(),
      service: { appendEvent: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Parameters<typeof createChatExecution>[0],
    { run } as unknown as Parameters<typeof createChatExecution>[1],
    {} as Parameters<typeof createChatExecution>[2],
  );
  const owner: ChatOwner = {
    accountId: "account",
    signal: controller.signal,
    send,
    browser: async () => undefined,
  };
  if (outcome === "renewal") {
    send.mockImplementation((_chatId: string, event: Parameters<ChatOwner["send"]>[1]) => {
      if (event.type !== "event" || event.event.role !== "assistant") return;
      controller.abort();
      void execution.suspend(owner, randomUUID());
    });
  }
  const id = randomUUID();
  await execution.enqueue(owner, "chat", {
    kind: "message",
    message: { id, instanceId: randomUUID(), text: "Hola", locale: "es" },
  });
  await vi.waitFor(() => expect(end).toHaveBeenCalled());
  const completed = send.mock.calls.filter(([, event]) => event.type === "completed");
  expect(completed).toEqual(
    outcome === "completed" || outcome === "renewal" || outcome === "task finished"
      ? [["chat", { type: "completed", turnId: id }]]
      : [],
  );
  await execution.disconnect(owner);
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
    await write;
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
    await execution.enqueue(owner, "chat", command("Otro mensaje"));
    expect(appendEvent).not.toHaveBeenCalled();

    abort.abort();
    const finished = execution.disconnect(owner);
    expect(run.mock.calls[0]![4].aborted).toBe(true);
    expect(end).not.toHaveBeenCalled();
    await expect(execution.enqueue(owner, "chat", command("Después del cierre"))).rejects.toThrow();
    finishWrite();
    await finished;
    expect(end).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  } finally {
    finishWrite();
    await execution.disconnect(owner);
  }
});

it("finalizes every running campaign selected without requesting a resume", async () => {
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  const first = randomUUID();
  const second = randomUUID();
  const stopped = randomUUID();
  const chatId = "chat";
  const transitionCampaign = vi.fn().mockResolvedValue(undefined);
  const results = {
    campaignForChat: vi.fn(async (_accountId: string, _chatId: string, id: string) => ({
      id,
      status: id === stopped ? "stopped" : "running",
    })),
    campaignBudget: vi.fn(async (_accountId: string, id: string) => ({ reached: id === second })),
    transitionCampaign,
  } as unknown as Parameters<typeof miraiTools>[1];
  const owner: ChatOwner = {
    accountId: "account",
    signal: new AbortController().signal,
    send: vi.fn(),
    browser: async () => undefined,
  };
  const run: Parameters<typeof createChatExecution>[1]["run"] = async (scope) => {
    const tool = miraiTools(
      scope,
      results,
      {} as Parameters<typeof miraiTools>[2],
      {} as Parameters<typeof miraiTools>[3],
      false,
    ).find(({ name }) => name === "selectCampaign")!;
    const toolContext = {} as Parameters<typeof tool.runAsync>[0]["toolContext"];
    for (const args of [{ id: first, resume: false }, { id: second }, { id: stopped }])
      await tool.runAsync({ args, toolContext });
    expect(scope.campaignId).toBe(stopped);
    expect(scope.runningCampaignIds).toEqual(new Set([first, second]));
    expect(transitionCampaign).not.toHaveBeenCalled();
  };
  const execution = createChatExecution(
    {
      executionSession: vi.fn().mockResolvedValue({ events: [] }),
      rememberExecution: vi.fn(),
      service: { appendEvent: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Parameters<typeof createChatExecution>[0],
    { run, compact: async () => false, cancelInteraction: async () => {} },
    results,
  );
  try {
    await execution.enqueue(owner, chatId, {
      kind: "message",
      message: {
        id: randomUUID(),
        instanceId: randomUUID(),
        text: "Revisa las campañas",
        locale: "es",
      },
    });
    await vi.waitFor(() =>
      expect(owner.send).toHaveBeenCalledWith(chatId, {
        type: "status",
        working: false,
        error: null,
      }),
    );
    expect(transitionCampaign.mock.calls).toEqual([
      [
        owner.accountId,
        first,
        "running",
        "stopped",
        "Execution ended before the mandate was completed.",
      ],
      [owner.accountId, second, "running", "completed", "Application limit reached."],
    ]);
  } finally {
    await execution.disconnect(owner);
  }
});

it.each(["generation", "application", "abandonment"] as const)(
  "settles a campaign handoff to another execution owner during %s",
  async (stage) => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
    const campaignId = randomUUID();
    const otherCampaignId = randomUUID();
    const instanceId = randomUUID();
    const successor = randomUUID();
    const chatId = "campaign-chat";
    const session = { events: [] as import("@google/adk").Event[] };
    const appendEvent = vi.fn(async ({ event }: { event: import("@google/adk").Event }) => {
      session.events.push(event);
      return event;
    });
    const chats = {
      executionSession: vi.fn().mockResolvedValue(session),
      rememberExecution: vi.fn(),
      service: { appendEvent },
      capacity: vi.fn().mockResolvedValue(1_048_576),
    } as unknown as Parameters<typeof createChatExecution>[0];
    const transitionCampaign = vi.fn().mockResolvedValue(undefined);
    const results = {
      transitionCampaign,
      campaignBudget: vi.fn().mockResolvedValue({ reached: false }),
    } as unknown as Parameters<typeof createChatExecution>[2];
    const cancelInteraction = vi.fn().mockResolvedValue(undefined);
    const { createEvent } = await import("@google/adk");
    type Run = Parameters<typeof createChatExecution>[1]["run"];
    let finishTool!: () => void;
    const tool = new Promise<void>((resolve) => {
      finishTool = resolve;
    });
    const observePage = vi.fn(() => ({ tabId: 42, applied: submitted }));
    const submitApplication = vi.fn(async () => {
      submitted = true;
    });
    const recordApplication = vi.fn();
    let submitted = false;
    const initial = vi.fn<Run>(
      async (
        scope,
        input,
        _locale,
        _browser,
        _signal,
        boundary,
        _restart,
        _emit,
        _hidden,
        _attachments,
        _generation,
        activity,
      ) => {
        scope.campaignId = campaignId;
        scope.runningCampaignIds.add(campaignId);
        if (stage === "abandonment") scope.runningCampaignIds.add(otherCampaignId);
        await appendEvent({
          event: createEvent({
            author: "user",
            content: { role: "user", parts: [{ text: input }] },
            customMetadata: { miraiCommandId: scope.commandId },
          }),
        });
        const handoff = activity!.handoff!;
        if (stage !== "application") {
          handoff.current = { id: "ongoing", lastEventId: "cursor", frames: [] };
          await new Promise<void>((resolve) =>
            handoff.pause.addEventListener("abort", () => resolve(), { once: true }),
          );
        } else {
          await tool;
          await submitApplication();
          await appendEvent({
            event: createEvent({
              author: "mirai",
              content: {
                role: "user",
                parts: [
                  {
                    functionResponse: {
                      name: "browser_click",
                      id: "old-click",
                      response: { tabId: 42, status: "applied" },
                    },
                  },
                ],
              },
            }),
          });
        }
        boundary();
      },
    );
    const continuation = vi.fn<Run>(
      async (
        scope,
        input,
        _locale,
        _browser,
        _signal,
        _boundary,
        restart,
        _emit,
        hidden,
        _attachments,
        generation,
        activity,
      ) => {
        expect(scope.campaignId).toBe(campaignId);
        expect(scope.runningCampaignIds).toEqual(new Set([campaignId]));
        expect(hidden).toBe(true);
        expect(restart).toBe(false);
        expect(input).toContain("inspect Chrome");
        expect(generation).toEqual({ model: "gemini-4-hydrogen", effort: "low" });
        expect(activity?.handoff?.restoring?.lastEventId).toBe(
          stage === "generation" ? "cursor" : undefined,
        );
        expect(observePage()).toEqual({ tabId: 42, applied: stage === "application" });
        if (stage === "application") {
          expect(
            session.events.some(({ content }) =>
              content?.parts?.some(({ functionResponse }) => functionResponse?.id === "old-click"),
            ),
          ).toBe(true);
          if (!submitted) await submitApplication();
          recordApplication({ campaignId, tabId: 42 });
        }
        scope.runningCampaignIds.delete(campaignId);
      },
    );
    const replica = (run: Run) =>
      createChatExecution(
        chats,
        { run, cancelInteraction } as unknown as Parameters<typeof createChatExecution>[1],
        results,
      );
    const first = replica(initial);
    const second = replica(continuation);
    const owner = (): ChatOwner => ({
      accountId: "account",
      signal: new AbortController().signal,
      send: vi.fn(),
      browser: async () => undefined,
    });
    const a = owner();
    const b = owner();
    const commandId = randomUUID();
    try {
      await first.enqueue(a, chatId, {
        kind: "message",
        message: {
          id: commandId,
          instanceId,
          text: "Find and apply",
          locale: "en",
          generation: { model: "gemini-4-hydrogen", effort: "low" },
        },
      });
      await vi.waitFor(() => {
        expect(initial).toHaveBeenCalledOnce();
        expect(session.events.some(({ author }) => author === "user")).toBe(true);
      });
      const paused = first.suspend(a, successor);
      if (stage === "application") {
        expect(transitionCampaign).not.toHaveBeenCalled();
        expect(end).not.toHaveBeenCalled();
        finishTool();
      }
      await paused;
      expect(transitionCampaign).not.toHaveBeenCalled();
      expect(a.send).not.toHaveBeenCalledWith(chatId, expect.objectContaining({ working: false }));
      if (stage === "application") {
        const checkpoint = session.events.find(
          ({ customMetadata }) => customMetadata?.miraiWorkspaceHandoff,
        )!.customMetadata!;
        checkpoint.miraiWorkspaceHandoff = {
          successor,
          turn: {
            commandId,
            startedAt: Date.now(),
            locale: "en",
            campaignId,
            runningCampaignId: campaignId,
          },
          queue: [],
        };
      }
      await second.resumeRenewal(b, chatId, successor);
      if (stage === "abandonment") {
        await second.disconnect(b);
        expect(continuation).not.toHaveBeenCalled();
        expect(cancelInteraction).toHaveBeenCalledExactlyOnceWith("ongoing");
        expect(transitionCampaign.mock.calls).toEqual(
          [campaignId, otherCampaignId].map((id) => [
            "account",
            id,
            "running",
            "stopped",
            "Workspace closed or stopped.",
          ]),
        );
        return;
      }
      await vi.waitFor(() => expect(continuation).toHaveBeenCalledOnce());
      await vi.waitFor(() =>
        expect(b.send).toHaveBeenCalledWith(chatId, expect.objectContaining({ working: false })),
      );
      expect(initial).toHaveBeenCalledOnce();
      expect(submitApplication).toHaveBeenCalledTimes(stage === "application" ? 1 : 0);
      expect(recordApplication).toHaveBeenCalledTimes(stage === "application" ? 1 : 0);
      expect(session.events.filter(({ author }) => author === "user")).toHaveLength(1);
    } finally {
      finishTool();
      await first.disconnect(a);
      await second.disconnect(b);
    }
  },
);
