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

it.each(["completed", "interrupted", "partial", "renewal"] as const)(
  "emits a completion only for a successful textual response (%s)",
  async (outcome) => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
    const { createEvent } = await import("@google/adk");
    const controller = new AbortController();
    const send = vi.fn();
    type Run = Parameters<typeof createChatExecution>[1]["run"];
    const run = vi.fn<Run>(
      async (_scope, _input, _locale, _browser, _signal, _boundary, _restart, emit) => {
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
      outcome === "completed" || outcome === "renewal"
        ? [["chat", { type: "completed", turnId: id }]]
        : [],
    );
    await execution.disconnect(owner);
  },
);

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

it.each(["generation", "application", "abandonment"] as const)(
  "settles a campaign handoff to another execution owner during %s",
  async (stage) => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
    const campaignId = randomUUID();
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
        scope.runningCampaignId = campaignId;
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
        expect(scope.runningCampaignId).toBe(campaignId);
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
        scope.runningCampaignId = undefined;
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
      await second.resumeRenewal(b, chatId, successor);
      if (stage === "abandonment") {
        await second.disconnect(b);
        expect(continuation).not.toHaveBeenCalled();
        expect(cancelInteraction).toHaveBeenCalledExactlyOnceWith("ongoing");
        expect(transitionCampaign).toHaveBeenCalledExactlyOnceWith(
          "account",
          campaignId,
          "running",
          "stopped",
          "Workspace closed or stopped.",
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
