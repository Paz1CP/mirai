import { Gemini, type LlmRequest } from "@google/adk";
import { afterEach, expect, it, vi } from "vitest";
import { ChatTiming } from "./chatTiming.js";
import { renewalInstruction, StreamingGemini, type InteractionHandoff } from "./streamingGemini.js";
import { BillingError } from "../billing/walletRepository.js";

afterEach(() => vi.restoreAllMocks());

const created = {
  event_type: "interaction.created",
  event_id: "created",
  interaction: { id: "same-inference", status: "in_progress" },
};
const first = {
  event_type: "step.delta",
  event_id: "first",
  index: 0,
  delta: { type: "text", text: "Hola " },
};
const second = {
  event_type: "step.delta",
  event_id: "second",
  index: 0,
  delta: { type: "text", text: "otra vez" },
};
const completed = (status: string) => ({
  event_type: "interaction.completed",
  event_id: "end",
  interaction: { id: "same-inference", status },
});

async function* stream(...events: object[]) {
  for (const event of events) yield event;
}

function modelFor(
  interactions: object,
  billing?: ConstructorParameters<typeof StreamingGemini>[2],
) {
  vi.spyOn(Gemini.prototype, "apiClient", "get").mockReturnValue({
    interactions,
  } as Gemini["apiClient"]);
  return new StreamingGemini(
    {
      model: "gemini-4-hydrogen",
      project: "test",
      location: "global",
      vertexai: true,
      useInteractionsApi: true,
    },
    "low",
    billing,
  );
}

function infer(model: StreamingGemini, handoff: InteractionHandoff, signal?: AbortSignal) {
  const request: LlmRequest = {
    model: model.model,
    toolsDict: {},
    liveConnectConfig: {},
    previousInteractionId: "existing-conversation",
    contents: [{ role: "user", parts: [{ text: "Continue" }] }],
    config: { abortSignal: signal },
  };
  model.bindAccount(request, "account");
  model.observeActivity(request, {
    turnId: "turn",
    startedAt: Date.now(),
    onSummary: vi.fn(),
    timing: new ChatTiming("turn"),
    handoff,
  });
  return model.generateContentAsync(request, true);
}

async function collect(source: ReturnType<typeof infer>) {
  const values = [];
  for await (const value of source) values.push(value);
  return values;
}

it("rejects a zero balance without retrying wallet admission or calling the provider", async () => {
  const begin = vi.fn().mockRejectedValue(new BillingError("INSUFFICIENT_CREDITS", 402));
  const create = vi.fn();
  const model = modelFor({ create }, { begin } as unknown as ConstructorParameters<
    typeof StreamingGemini
  >[2]);
  const pause = new AbortController();
  await expect(collect(infer(model, { pause: pause.signal }))).rejects.toMatchObject({
    code: "INSUFFICIENT_CREDITS",
  });
  expect(begin).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
});

it("cancels the running interaction and settles usage reported after credits run out", async () => {
  const stop = new AbortController();
  const create = vi.fn(async (_request, { signal }: { signal: AbortSignal }) =>
    (async function* () {
      yield created;
      yield first;
      if (!signal.aborted)
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
    })(),
  );
  const cancel = vi.fn().mockResolvedValue({
    id: "same-inference",
    status: "cancelled",
    usage: { total_input_tokens: 1000, total_output_tokens: 20 },
  });
  const authorization = { id: "ce41d20d-b8a0-4c53-afcc-f59ec049d241" };
  const begin = vi.fn().mockResolvedValue(authorization);
  const settle = vi.fn();
  const rememberProviderId = vi.fn();
  const model = modelFor({ create, cancel }, {
    begin,
    settle,
    rememberProviderId,
  } as unknown as ConstructorParameters<typeof StreamingGemini>[2]);
  const responses = infer(model, { pause: new AbortController().signal }, stop.signal);
  expect((await responses.next()).value).toMatchObject({ partial: true });
  stop.abort(new BillingError("INSUFFICIENT_CREDITS", 402));
  await expect(responses.next()).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
  await vi.waitFor(() =>
    expect(settle).toHaveBeenCalledExactlyOnceWith(
      "account",
      authorization,
      expect.objectContaining({ input: 1000, output: 20 }),
      "same-inference",
    ),
  );
  expect(create).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledExactlyOnceWith("same-inference");
});

it("detaches from background generation and reconnects the same inference after the delivered cursor", async () => {
  const create = vi.fn().mockImplementation(async (_request, options: { signal: AbortSignal }) => {
    return (async function* () {
      yield created;
      yield first;
      await new Promise<void>((resolve) =>
        options.signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    })();
  });
  const terminal = completed("completed");
  const get = vi.fn().mockImplementation(async () =>
    stream(second, {
      ...terminal,
      interaction: {
        ...terminal.interaction,
        usage: { total_input_tokens: 1000, total_output_tokens: 20 },
      },
    }),
  );
  const cancel = vi.fn();
  const authorization = { id: "ce41d20d-b8a0-4c53-afcc-f59ec049d241" };
  const begin = vi.fn().mockResolvedValue(authorization);
  const recover = vi.fn().mockResolvedValue(authorization);
  const settle = vi.fn();
  const rememberProviderId = vi.fn();
  const model = modelFor({ create, get, cancel }, {
    begin,
    recover,
    settle,
    rememberProviderId,
  } as unknown as ConstructorParameters<typeof StreamingGemini>[2]);
  const pause = new AbortController();
  const current: InteractionHandoff = { pause: pause.signal };
  const initial = infer(model, current);
  const partial = await initial.next();
  expect(partial.value).toMatchObject({
    partial: true,
    content: { parts: [{ text: "Hola " }] },
    customMetadata: { miraiResponseId: "same-inference" },
  });
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      background: true,
      store: true,
      stream: true,
      generation_config: expect.objectContaining({ thinking_level: "low" }),
      previous_interaction_id: "existing-conversation",
    }),
    expect.anything(),
  );

  pause.abort(new Error("renewing"));
  await expect(initial.next()).rejects.toThrow("renewing");
  expect(cancel).not.toHaveBeenCalled();
  expect(current.current?.lastEventId).toBe("first");
  expect(current.current?.billingId).toBe(authorization.id);
  expect(settle).not.toHaveBeenCalled();

  const resumed: InteractionHandoff = {
    pause: new AbortController().signal,
    restoring: current.current,
    notePending: true,
  };
  const values = await collect(infer(model, resumed));
  expect(get).toHaveBeenCalledExactlyOnceWith(
    "same-inference",
    { stream: true, last_event_id: "first" },
    expect.anything(),
  );
  expect(create).toHaveBeenCalledOnce();
  expect(begin).toHaveBeenCalledExactlyOnceWith("account", "chat", "gemini-4-hydrogen", "global");
  expect(rememberProviderId).toHaveBeenCalledExactlyOnceWith(
    "account",
    authorization.id,
    "same-inference",
  );
  expect(recover).toHaveBeenCalledExactlyOnceWith("account", authorization.id);
  expect(settle).toHaveBeenCalledExactlyOnceWith(
    "account",
    authorization,
    expect.objectContaining({ input: 1000, output: 20 }),
    "same-inference",
  );
  expect(values).toHaveLength(2);
  expect(values[0]).toMatchObject({ partial: true, content: { parts: [{ text: "otra vez" }] } });
  expect(values[1]).toMatchObject({
    partial: false,
    content: { parts: [{ text: "Hola " }, { text: "otra vez" }] },
    customMetadata: { miraiResponseId: "same-inference" },
  });
});

it("does not restart a completed inference and marks recovered tool calls for re-observation", async () => {
  const create = vi
    .fn()
    .mockImplementation(async () => stream(created, second, completed("completed")));
  const get = vi.fn().mockImplementation(async () =>
    stream(
      {
        event_type: "step.start",
        index: 1,
        step: { type: "function_call", id: "call", name: "browser_click" },
      },
      { event_type: "step.stop", index: 1 },
      completed("requires_action"),
    ),
  );
  const model = modelFor({ create, get });
  const signal = new AbortController().signal;
  const finished: InteractionHandoff = {
    pause: signal,
    restoring: {
      id: "same-inference",
      frames: [created, first, completed("completed")],
    } as NonNullable<InteractionHandoff["current"]>,
  };
  const terminal = await collect(infer(model, finished));
  expect(terminal).toHaveLength(1);
  expect(terminal[0]).toMatchObject({ turnComplete: true, interactionId: "same-inference" });
  expect(create).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();

  const handoff: InteractionHandoff = {
    pause: signal,
    restoring: { id: "same-inference", lastEventId: "created", frames: [created] } as NonNullable<
      InteractionHandoff["current"]
    >,
    notePending: true,
  };
  const call = await collect(infer(model, handoff));
  expect(call[0]).toMatchObject({
    interactionId: "same-inference",
    content: { parts: [{ functionCall: { name: "browser_click" } }] },
  });
  expect(handoff.inspectFirst).toBe(true);
  handoff.current = undefined;
  await collect(infer(model, handoff));
  expect(create).toHaveBeenCalledOnce();
  expect(JSON.stringify(create.mock.calls[0])).toContain(renewalInstruction);
  expect(handoff.inspectFirst).toBe(false);
  expect(handoff.notePending).toBe(false);
});

it("reattaches once when the provider stream ends early and ignores a repeated event", async () => {
  const create = vi.fn().mockImplementation(async () => stream(created, first));
  const get = vi.fn().mockImplementation(async () => stream(first, second, completed("completed")));
  const model = modelFor({ create, get });
  const handoff: InteractionHandoff = { pause: new AbortController().signal };
  const values = await collect(infer(model, handoff));
  expect(create).toHaveBeenCalledOnce();
  expect(get).toHaveBeenCalledExactlyOnceWith(
    "same-inference",
    { stream: true, last_event_id: "first" },
    expect.anything(),
  );
  expect(values).toHaveLength(3);
  expect(values[2]).toMatchObject({
    partial: false,
    content: { parts: [{ text: "Hola " }, { text: "otra vez" }] },
  });
});
