import { Gemini, InMemorySessionService, type Event } from "@google/adk";
import { afterEach, expect, it, vi } from "vitest";
import { fromProviderEvent, toChatEvent } from "./chatEvents.js";
import { createChatExecution, type ChatOwner } from "./chatExecution.js";
import { ChatTiming } from "./chatTiming.js";
import { createMiraiAgent } from "./miraiAgent.js";
import type { AgentScope } from "./miraiTools.js";
import { renewalInstruction, type InteractionHandoff } from "./streamingGemini.js";

const accountId = "account";
const appName = "mirai";

vi.mock("pg", () => ({
  Client: class {
    on() {}
    async connect() {}
    async query() {
      return { rows: [{ locked: true }] };
    }
    async end() {}
  },
}));

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
  const loadSession = async () =>
    (await service.getSession({ appName, userId: accountId, sessionId: session.id }))!;
  const chats = {
    appName,
    service,
    capacity: async () => null,
    modelName: "gemini-4-hydrogen",
    modelRegion: "global",
    project: "test",
    executionSession: loadSession,
    rememberExecution: () => {},
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
  const campaigns = new Map<string, { id: string; status: string; statusReason: string | null }>();
  const createCampaign = vi.fn(async (_account: string, _chat: string, input: { id: string }) => {
    const campaign = { ...input, status: "running", statusReason: null };
    campaigns.set(campaign.id, campaign);
    return campaign;
  });
  const listCampaigns = vi.fn(async () => ({ items: [] }));
  const transitionCampaign = vi.fn(
    async (_account: string, id: string, from: string, to: string, reason: string | null) => {
      const campaign = campaigns.get(id);
      if (campaign?.status !== from) return null;
      Object.assign(campaign, { status: to, statusReason: reason });
      return campaign;
    },
  );
  const results = {
    createCampaign,
    listCampaigns,
    transitionCampaign,
    campaignForChat: async (_account: string, _chat: string, id: string) => campaigns.get(id),
    campaignBudget: async () => ({ reached: false }),
  } as unknown as Parameters<typeof createMiraiAgent>[1];
  const agent = createMiraiAgent(
    chats,
    results,
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
    service,
    createCampaign,
    listCampaigns,
    session,
    seen,
    messages,
    loadSession,
    transitionCampaign,
    agent,
    makeExecution: () => createChatExecution(chats, agent, results),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function workspace() {
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test");
  const send = vi.fn<ChatOwner["send"]>();
  const owner: ChatOwner = {
    accountId,
    send,
    signal: new AbortController().signal,
    browser: async () => undefined,
  };
  return { owner, send };
}

async function sendInstruction(
  execution: ReturnType<typeof createChatExecution>,
  owner: ChatOwner,
  chatId: string,
  message: string,
) {
  const id = crypto.randomUUID();
  await execution.enqueue(owner, chatId, {
    kind: "message",
    message: { id, instanceId: crypto.randomUUID(), locale: "es", text: message },
  });
  return id;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("resumes the same paused campaign from a normal reply on a new execution instance", async () => {
  const run = await setup(
    tool("createCampaign", { title: "Búsqueda", mandate: "Buscar vacantes" }),
    tool("pause_task", { result: "¿Aceptas contratos B2B?" }),
    tool("finish_task", { result: "Encargo continuado" }),
    text("Conversación posterior"),
  );
  const track = vi.spyOn(run.agent, "run");
  const first = run.makeExecution();
  const a = workspace();
  const original = await sendInstruction(first, a.owner, run.session.id, "Busca vacantes");
  await vi.waitFor(() =>
    expect(a.send).toHaveBeenCalledWith(run.session.id, {
      type: "status",
      working: false,
      error: null,
    }),
  );
  const campaignId = track.mock.calls[0]![0].campaignId;
  expect(a.send).not.toHaveBeenCalledWith(run.session.id, { type: "completed", turnId: original });
  expect((await run.loadSession()).state.miraiPendingTask).toMatchObject({
    id: original,
    campaignId,
  });
  expect(run.transitionCampaign).toHaveBeenCalledWith(
    accountId,
    campaignId,
    "running",
    "stopped",
    "Waiting for user input.",
  );

  const second = run.makeExecution();
  const b = workspace();
  const reply = await sendInstruction(second, b.owner, run.session.id, "Sí");
  await vi.waitFor(() =>
    expect(b.send).toHaveBeenCalledWith(run.session.id, { type: "completed", turnId: reply }),
  );
  expect(track.mock.calls[1]?.[0]).toMatchObject({
    commandId: reply,
    taskId: original,
    campaignId,
    taskMode: true,
  });
  expect(track.mock.calls[1]?.[1]).toBe("Sí");
  expect(run.transitionCampaign).toHaveBeenCalledWith(
    accountId,
    campaignId,
    "stopped",
    "running",
    null,
  );
  expect(run.createCampaign).toHaveBeenCalledOnce();
  expect((await run.loadSession()).state.miraiPendingTask).toBeNull();

  await vi.waitFor(() =>
    expect(b.send).toHaveBeenCalledWith(run.session.id, {
      type: "status",
      working: false,
      error: null,
    }),
  );
  const next = await sendInstruction(second, b.owner, run.session.id, "Gracias");
  await vi.waitFor(() =>
    expect(b.send).toHaveBeenCalledWith(run.session.id, { type: "completed", turnId: next }),
  );
  expect(track.mock.calls[2]?.[0].taskMode).toBe(false);
});

it.each(["same replica", "renewal"] as const)(
  "applies a new instruction without reopening the campaign or replaying a tool (%s)",
  async (mode) => {
    const run = await setup(
      tool("createCampaign", { title: "Búsqueda", mandate: "Buscar vacantes" }),
      tool("listCampaigns"),
      tool("finish_task", { result: "Continué con la prioridad nueva" }),
    );
    const blocked = deferred();
    const release = deferred();
    run.listCampaigns.mockImplementationOnce(async () => {
      blocked.resolve();
      await release.promise;
      return { items: [] };
    });
    const execution = run.makeExecution();
    const { owner, send } = workspace();
    const successorId = crypto.randomUUID();
    let handoff: Promise<void> | undefined;
    const actualRun = run.agent.run;
    const track = vi.spyOn(run.agent, "run").mockImplementationOnce(async (...args) => {
      try {
        await actualRun(...args);
      } finally {
        if (mode === "renewal") handoff = execution.suspend(owner, successorId);
      }
    });
    const initial = await sendInstruction(execution, owner, run.session.id, "Busca vacantes");
    let destination = { execution, owner, send };
    try {
      await blocked.promise;
      const followUp = await sendInstruction(execution, owner, run.session.id, "Prioriza Flutter");
      release.resolve();
      if (mode === "renewal") {
        await vi.waitFor(() => expect(handoff).toBeDefined());
        await handoff;
        destination = { execution: run.makeExecution(), ...workspace() };
        await destination.execution.resumeRenewal(destination.owner, run.session.id, successorId);
      }
      await vi.waitFor(() =>
        expect(destination.send).toHaveBeenCalledWith(run.session.id, {
          type: "completed",
          turnId: followUp,
        }),
      );
      const campaignId = track.mock.calls[0]![0].campaignId;
      expect(track.mock.calls[1]?.[0]).toMatchObject({
        taskId: initial,
        campaignId,
        commandId: followUp,
        taskMode: true,
      });
      expect(track.mock.calls[1]?.[1]).toBe("Prioriza Flutter");
      expect(track.mock.calls[1]?.[6]).toBe(true);
      expect(send).not.toHaveBeenCalledWith(run.session.id, { type: "completed", turnId: initial });
      expect(run.createCampaign).toHaveBeenCalledOnce();
      expect(run.listCampaigns).toHaveBeenCalledOnce();
      expect(run.transitionCampaign.mock.calls).toEqual([
        [
          accountId,
          campaignId,
          "running",
          "stopped",
          "Execution ended before the mandate was completed.",
        ],
      ]);
    } finally {
      release.resolve();
      if (destination.execution !== execution)
        await destination.execution.disconnect(destination.owner);
      await execution.disconnect(owner);
    }
  },
);

it("dispatches Hydrogen while the ADK user event is still being written", async () => {
  const fixture = await setup(text("Respuesta"));
  const pending = deferred();
  const append = fixture.service.appendEvent.bind(fixture.service);
  const write = vi.spyOn(fixture.service, "appendEvent").mockImplementation(async (args) => {
    const event = await append(args);
    if (event.author === "user") await pending.promise;
    return event;
  });
  const running = fixture.run();
  try {
    await vi.waitFor(() => expect(fixture.create).toHaveBeenCalledOnce());
    expect(write.mock.calls.map(([{ event }]) => event.author)).toEqual(["user"]);
    expect(fixture.billing.begin).toHaveBeenCalledOnce();
    expect(fixture.create.mock.calls[0]?.[0]).toMatchObject({
      input: expect.arrayContaining([expect.objectContaining({ type: "user_input" })]),
    });
  } finally {
    pending.resolve();
    await running;
  }
  expect(write.mock.calls.filter(([{ event }]) => event.author === "user")).toHaveLength(1);
  expect(write.mock.calls.some(([{ event }]) => event.author === "mirai_queue")).toBe(false);
});

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
    text("Segundo avance"),
    text("Tercer avance"),
    tool("listCampaigns"),
    tool("finish_task", { result: "Informe final" }),
  );
  await run.run();
  expect(run.createCampaign).toHaveBeenCalledOnce();
  expect(run.listCampaigns).toHaveBeenCalledOnce();
  expect(run.messages()).toEqual([
    "Avance intermedio",
    "Segundo avance",
    "Tercer avance",
    "Informe final",
  ]);
  expect(run.scope.taskFinished).toBe(true);
  expect(run.create).toHaveBeenCalledTimes(6);
  expect(run.billing.settle).toHaveBeenCalledTimes(6);
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
  expect(run.create.mock.calls[3]?.[0]).toMatchObject({ previous_interaction_id: "interaction-2" });
  expect(run.create.mock.calls[4]?.[0]).toMatchObject({ previous_interaction_id: "interaction-3" });
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
