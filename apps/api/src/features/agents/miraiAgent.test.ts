import { Gemini, InMemorySessionService, type Event } from "@google/adk";
import { afterEach, expect, it, vi } from "vitest";
import { fromProviderEvent, toChatEvent } from "./chatEvents.js";
import { ChatTiming } from "./chatTiming.js";
import { createMiraiAgent } from "./miraiAgent.js";
import type { AgentScope } from "./miraiTools.js";
import { renewalInstruction, type InteractionHandoff } from "./streamingGemini.js";

const accountId = "account";
const appName = "mirai";

function text(value: string) {
  return [{ event_type: "step.delta", index: 0, delta: { type: "text", text: value } }];
}

function tool(name: string, args: object = {}, id = `call-${name}`) {
  return [
    { event_type: "step.start", index: 0, step: { type: "function_call", id, name } },
    {
      event_type: "step.delta",
      index: 0,
      delta: { type: "arguments_delta", arguments: JSON.stringify(args) },
    },
    { event_type: "step.stop", index: 0 },
  ];
}

async function setup(...script: object[][]) {
  const service = new InMemorySessionService();
  const session = await service.createSession({ appName, userId: accountId });
  const chats = {
    appName,
    service,
    capacity: async () => null,
    modelName: "gemini-4-hydrogen",
    modelRegion: "global",
    project: "test",
  } as unknown as Parameters<typeof createMiraiAgent>[0];
  let requested = 0;
  const create = vi.fn(async (request: unknown) => {
    expect(request).toMatchObject({ model: "gemini-4-hydrogen" });
    const index = requested++;
    const steps = script[index];
    if (!steps) throw new Error("Unexpected provider interaction");
    const id = `interaction-${index}`;
    return (async function* () {
      yield { event_type: "interaction.created", interaction: { id, status: "in_progress" } };
      yield* steps;
      yield {
        event_type: "interaction.completed",
        interaction: {
          id,
          status: steps.some((step) => "step" in step) ? "requires_action" : "completed",
          usage: { total_input_tokens: 1000, total_output_tokens: 20 },
        },
      };
    })();
  });
  const provider = { create, get: vi.fn(), cancel: vi.fn() };
  vi.spyOn(Gemini.prototype, "apiClient", "get").mockReturnValue({
    interactions: provider,
  } as unknown as Gemini["apiClient"]);
  const billing = {
    begin: vi.fn(async () => ({ id: crypto.randomUUID() })),
    settle: vi.fn(),
    ensureCredit: vi.fn(),
    rememberProviderId: vi.fn(),
    recover: vi.fn(async (_account: string, id: string) => ({ id })),
  };
  const createCampaign = vi.fn(async (_account: string, _chat: string, input: { id: string }) => ({
    ...input,
    status: "running",
  }));
  const listCampaigns = vi.fn(async () => ({ items: [] }));
  const agent = createMiraiAgent(
    chats,
    { createCampaign, listCampaigns } as unknown as Parameters<typeof createMiraiAgent>[1],
    { communicationAllowed: async () => false } as unknown as Parameters<
      typeof createMiraiAgent
    >[2],
    {} as Parameters<typeof createMiraiAgent>[3],
    billing as unknown as Parameters<typeof createMiraiAgent>[4],
  );
  const scope: AgentScope = {
    accountId,
    chatId: session.id,
    commandId: crypto.randomUUID(),
    runningCampaignIds: new Set(),
  };
  const seen: Event[] = [];
  const run = async ({
    signal = new AbortController().signal,
    handoff = { pause: new AbortController().signal },
    input = "User instruction",
    onEvent,
  }: {
    signal?: AbortSignal;
    handoff?: InteractionHandoff;
    input?: string;
    onEvent?: (event: Event) => void;
  } = {}) =>
    agent.run(
      scope,
      input,
      "es",
      undefined,
      signal,
      () => {
        signal.throwIfAborted();
        handoff.pause.throwIfAborted();
      },
      false,
      (event) => {
        seen.push(event);
        onEvent?.(event);
      },
      input === renewalInstruction,
      [],
      { model: "gemini-4-hydrogen", effort: "low" },
      {
        turn: { id: scope.commandId, startedAt: Date.now() },
        onSummary: () => {},
        timing: new ChatTiming(scope.commandId),
        session,
        handoff,
      },
    );
  const messages = () =>
    seen
      .filter((event) => !event.partial)
      .flatMap((event) =>
        (toChatEvent(event)?.parts ?? []).flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
      );
  return {
    scope,
    run,
    create,
    billing,
    provider,
    createCampaign,
    listCampaigns,
    session,
    seen,
    messages,
  };
}

afterEach(() => vi.restoreAllMocks());

it("keeps ordinary conversation to one response through the Workflow runner", async () => {
  const run = await setup(text("Respuesta directa"));
  await run.run();
  expect(run.create).toHaveBeenCalledOnce();
  expect(JSON.stringify(run.create.mock.calls[0])).not.toContain('"name":"finish_task"');
  expect(run.messages()).toEqual(["Respuesta directa"]);
  expect(run.billing.settle).toHaveBeenCalledOnce();
});

it("keeps working after progress and saves the native finish_task report", async () => {
  const run = await setup(
    tool("createCampaign", { title: "Búsqueda", mandate: "Buscar vacantes compatibles" }),
    text("Avance intermedio"),
    tool("listCampaigns"),
    tool("finish_task", { result: "Informe final" }),
  );
  await run.run();
  expect(run.createCampaign).toHaveBeenCalledOnce();
  expect(run.listCampaigns).toHaveBeenCalledOnce();
  expect(run.messages()).toEqual(["Avance intermedio", "Informe final"]);
  expect(run.scope.taskFinished).toBe(true);
  expect(run.create).toHaveBeenCalledTimes(4);
  expect(run.billing.settle).toHaveBeenCalledTimes(4);
  expect(run.session.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        customMetadata: expect.objectContaining({
          miraiTaskMessage: "Informe final",
          miraiTaskOutcome: "finished",
        }),
      }),
    ]),
  );
  const finished = run.session.events.find(
    (event) => event.customMetadata?.miraiTaskOutcome === "finished",
  )!;
  expect(
    fromProviderEvent({
      name: `events/${finished.id}`,
      author: finished.author ?? "mirai",
      timestamp: new Date(finished.timestamp).toISOString(),
      eventMetadata: { customMetadata: finished.customMetadata },
    }).history?.parts,
  ).toContainEqual({ type: "text", text: "Informe final" });
  expect(run.create.mock.calls[2]?.[0]).toMatchObject({
    previous_interaction_id: "interaction-1",
    input: expect.arrayContaining([expect.objectContaining({ type: "user_input" })]),
  });
});

it("pauses for indispensable user input without finishing the task", async () => {
  const run = await setup(
    tool("start_task"),
    tool("pause_task", { result: "¿Qué ubicación debo usar?" }),
  );
  await run.run();
  expect(run.scope.taskPaused).toBe(true);
  expect(run.scope.taskFinished).toBeUndefined();
  expect(run.messages()).toEqual(["¿Qué ubicación debo usar?"]);
  expect(run.create).toHaveBeenCalledTimes(2);
});

it("reconstructs an active Workflow after renewal using persisted tool results", async () => {
  const run = await setup(
    tool("start_task"),
    tool("listCampaigns"),
    text("Avance tras la renovación"),
    tool("finish_task", { result: "Informe después de renovar" }),
  );
  const pause = new AbortController();
  await expect(
    run.run({
      handoff: { pause: pause.signal },
      onEvent(event) {
        if (
          event.content?.parts?.some(
            ({ functionResponse }) => functionResponse?.name === "listCampaigns",
          )
        )
          pause.abort(new Error("WORKSPACE_RENEWING"));
      },
    }),
  ).rejects.toThrow();
  expect(run.create).toHaveBeenCalledTimes(2);
  expect(run.scope.taskMode).toBe(true);
  expect(run.scope.taskFinished).toBeUndefined();
  expect(run.listCampaigns).toHaveBeenCalledOnce();

  await run.run({ input: renewalInstruction });
  expect(run.scope.taskFinished).toBe(true);
  expect(run.listCampaigns).toHaveBeenCalledOnce();
  expect(run.create.mock.calls[2]?.[0]).toMatchObject({
    previous_interaction_id: "interaction-1",
    input: expect.arrayContaining([expect.objectContaining({ type: "function_result" })]),
  });
  expect(run.messages()).toEqual(["Avance tras la renovación", "Informe después de renovar"]);
});

it("reattaches to an in-flight interaction, settles it once, and continues its native task", async () => {
  const run = await setup(tool("finish_task", { result: "Informe recuperado" }));
  run.scope.taskMode = true;
  const priorId = "interaction-in-flight";
  const billingId = crypto.randomUUID();
  run.provider.get.mockResolvedValueOnce(
    (async function* () {
      yield* text("Avance recuperado");
      yield {
        event_type: "interaction.completed",
        interaction: {
          id: priorId,
          status: "completed",
          usage: { total_input_tokens: 1000, total_output_tokens: 20 },
        },
      };
    })(),
  );
  await run.run({
    input: renewalInstruction,
    handoff: {
      pause: new AbortController().signal,
      restoring: { id: priorId, billingId, lastEventId: "already-delivered", frames: [] },
      notePending: true,
    },
  });
  expect(run.provider.get).toHaveBeenCalledExactlyOnceWith(
    priorId,
    { stream: true, last_event_id: "already-delivered" },
    expect.anything(),
  );
  expect(run.billing.recover).toHaveBeenCalledExactlyOnceWith(accountId, billingId);
  expect(run.billing.begin).toHaveBeenCalledOnce();
  expect(run.billing.settle).toHaveBeenCalledTimes(2);
  expect(run.billing.settle).toHaveBeenCalledWith(
    accountId,
    { id: billingId },
    expect.objectContaining({ input: 1000, output: 20 }),
    priorId,
  );
  expect(run.create.mock.calls[0]?.[0]).toMatchObject({ previous_interaction_id: priorId });
  expect(run.messages()).toEqual(["Avance recuperado", "Informe recuperado"]);
  expect(run.scope.taskFinished).toBe(true);
});

it.each(["Stopped by user", "INSUFFICIENT_CREDITS"])(
  "keeps saved progress and stops before another inference on %s",
  async (reason) => {
    const run = await setup(tool("start_task"), text("Avance guardado"));
    const stop = new AbortController();
    await run
      .run({
        signal: stop.signal,
        onEvent(event) {
          if (
            !event.partial &&
            event.content?.parts?.some(({ text }) => text === "Avance guardado")
          )
            stop.abort(new Error(reason));
        },
      })
      .catch((error: unknown) =>
        expect(String(error)).toMatch(/abort|Stopped by user|INSUFFICIENT_CREDITS/i),
      );
    expect(run.create).toHaveBeenCalledTimes(2);
    expect(run.billing.settle).toHaveBeenCalledTimes(2);
    expect(run.scope.taskFinished).toBeUndefined();
    expect(run.messages()).toEqual(["Avance guardado"]);
  },
);
