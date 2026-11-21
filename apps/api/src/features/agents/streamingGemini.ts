import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  Gemini,
  genaiSchemaToJsonSchema,
  type Event,
  type LlmRequest,
  type LlmResponse,
} from "@google/adk";
import type { ChatGeneration } from "@mirai/contracts";
import { z } from "zod";
import { ChatError } from "./managedChats.js";
import type { ChatTiming } from "./chatTiming.js";
import { rejectedBeforeGeneration, type createInferenceBilling } from "../billing/inferenceBilling.js";
import { reportedUsage } from "../billing/pricing.js";
import { BillingError } from "../billing/walletRepository.js";

type InteractionClient = Gemini["apiClient"]["interactions"];
type InteractionRequest = Parameters<InteractionClient["create"]>;
type InteractionInput = Extract<InteractionRequest[0], { model: string }>["input"];
const firstEventTimeoutMs = 180_000;
const streamIdleTimeoutMs = 200_000;

type StreamEvent<T> = T extends AsyncIterable<infer E> ? E : never;
type NativeEvent = StreamEvent<Awaited<ReturnType<InteractionClient["get"]>>>;
type InteractionUsage = Extract<NativeEvent, { event_type: "interaction.completed" }>["interaction"]["usage"];

function usageFromInteraction(data: InteractionUsage) {
  return reportedUsage(
    data?.total_input_tokens, data?.total_cached_tokens, data?.total_output_tokens,
    data?.total_thought_tokens, data?.total_tool_use_tokens, data?.total_tokens,
  );
}
export const renewalInstruction =
  "Continue the current task. First inspect Chrome's current state and verify uncertain outcomes before acting.";
export const interactionCursorSchema = z.object({
  id: z.string().min(1),
  billingId: z.uuid().optional(),
  lastEventId: z.string().optional(),
  frames: z.array(
    z.custom<NativeEvent>(
      (value) => typeof value === "object" && value !== null && "event_type" in value,
    ),
  ),
  activityId: z.string().optional(),
  status: z.string().optional(),
});
export type InteractionCursor = z.infer<typeof interactionCursorSchema>;
export type InteractionHandoff = {
  pause: AbortSignal;
  restoring?: InteractionCursor;
  current?: InteractionCursor;
  inspectFirst?: boolean;
  notePending?: boolean;
  hideContinuationWrite?: boolean;
};

type RequestState = {
  signal: AbortSignal;
  accountId?: string;
  progress: (timeoutMs: number) => void;
  stopWatching: () => void;
  completionStatus?: string;
  timing?: ChatTiming;
  usage?: LlmResponse["usageMetadata"];
  summary: string;
  summaryStep?: number;
  onSummary?: (text: string) => void;
  handoff?: InteractionHandoff;
  invocation?: AbortSignal;
  activityId?: string;
  replaying?: boolean;
};

export function recoverInterruptedCalls(
  request: LlmRequest,
  previousEvent?: Event,
  restartInteraction = false,
) {
  const contents = request.contents ?? [];
  const responseIds = (history: typeof contents) =>
    new Set(
      history.flatMap(
        (content) =>
          content.parts?.flatMap(({ functionResponse }) =>
            functionResponse?.id ? [functionResponse.id] : [],
          ) ?? [],
      ),
    );
  if (request.previousInteractionId && !restartInteraction && !previousEvent?.errorCode) {
    let lastModel = contents.length - 1;
    while (lastModel >= 0 && contents[lastModel]?.role !== "model") lastModel--;
    const trailingResults = responseIds(contents.slice(lastModel + 1));
    const outstanding = previousEvent?.content?.parts?.some(({ functionCall }) =>
      Boolean(functionCall?.id && !trailingResults.has(functionCall.id)),
    );
    if (outstanding) {
      const missed =
        previousEvent?.content?.parts?.flatMap(({ functionCall }) => {
          const { id, name } = functionCall ?? {};
          return id && name && !trailingResults.has(id)
            ? [
                {
                  functionResponse: {
                    id,
                    name,
                    response: {
                      error: "TOOL_RESULT_UNRECORDED",
                      detail: "Inspect existing state before repeating an uncertain action.",
                    },
                  },
                },
              ]
            : [];
        }) ?? [];
      request.contents = [...contents, { role: "user", parts: missed }];
    }
    return;
  }
  request.previousInteractionId = undefined;
  const answered = responseIds(contents);
  const calls = new Set<string>();
  const results = new Set<string>();
  request.contents = contents.flatMap((content) => {
    const signatures = new Set<string>();
    const parts = (content.parts ?? []).flatMap((part) => {
      const call = part.functionCall?.id;
      const result = part.functionResponse?.id;
      if ((call && calls.has(call)) || (result && results.has(result))) return [];
      if (call) calls.add(call);
      if (result) results.add(result);
      if (call && part.thoughtSignature) {
        if (signatures.has(part.thoughtSignature))
          return [{ ...part, thoughtSignature: undefined }];
        signatures.add(part.thoughtSignature);
      }
      return [part];
    });
    const missed = parts.flatMap(({ functionCall }) => {
      const { id, name } = functionCall ?? {};
      return id && name && !answered.has(id)
        ? [
            {
              functionResponse: {
                id,
                name,
                response: {
                  error: "TOOL_RESULT_UNRECORDED",
                  detail:
                    "The outcome is unknown. Inspect existing state before repeating an external action.",
                },
              },
            },
          ]
        : [];
    });
    // Repair the request only. The managed conversation keeps the actual tool events.
    return [
      ...(parts.length ? [{ ...content, parts }] : []),
      ...(missed.length ? [{ role: "user", parts: missed }] : []),
    ];
  });
}

function rejectedInteraction(message: string, id: string) {
  const refersToPrevious =
    /\bprevious[\s_]+interaction(?:_id)?\b/i.test(message) ||
    (message.includes(id) && /\binteraction\b/i.test(message));
  return (
    refersToPrevious &&
    /\b(?:failed|cancelled|canceled|expired|not found|does not exist|no interaction found)\b/i.test(
      message,
    )
  );
}

type ConvertedSchema = Record<string, unknown> & {
  properties?: Record<string, ConvertedSchema>;
  items?: ConvertedSchema;
  anyOf?: ConvertedSchema[];
};

function normalizeExclusiveBounds(schema: ConvertedSchema): ConvertedSchema {
  // OpenAPI 3.0 uses flags beside the bounds. JSON Schema uses the bounds themselves.
  for (const [exclusive, inclusive] of [
    ["exclusiveMinimum", "minimum"],
    ["exclusiveMaximum", "maximum"],
  ] as const) {
    if (typeof schema[exclusive] !== "boolean") continue;
    if (schema[exclusive] && typeof schema[inclusive] === "number") {
      schema[exclusive] = schema[inclusive];
      delete schema[inclusive];
    } else {
      delete schema[exclusive];
    }
  }
  for (const property of Object.values(schema.properties ?? {})) normalizeExclusiveBounds(property);
  if (schema.items) normalizeExclusiveBounds(schema.items);
  schema.anyOf?.forEach(normalizeExclusiveBounds);
  return schema;
}

const screenshotResult = z.object({
  content: z.array(
    z
      .object({
        type: z.literal("image"),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/jpg", "image/gif"]),
        data: z.string().min(1),
      })
      .or(z.object({ type: z.literal("text"), text: z.string().min(1) })),
  ),
});

function encodeToolResults(input: InteractionInput): InteractionInput {
  if (!Array.isArray(input)) return input;
  for (const step of input) {
    if (step.type === "function_result" && step.name === "browser_take_screenshot") {
      const result = screenshotResult.safeParse(step.result);
      if (result.success && result.data.content.some((part) => part.type === "image")) {
        step.result = result.data.content.map((part) =>
          part.type === "image"
            ? { type: "image", mime_type: part.mimeType, data: part.data }
            : part,
        );
        continue;
      }
    }
    // JSON text preserves empty collections that Vertex rejects inside a function result object.
    if (
      step.type === "function_result" &&
      !(Array.isArray(step.result) && step.result.length) &&
      !(typeof step.result === "string" && step.result.length)
    ) {
      step.result = JSON.stringify(step.result ?? null);
    }
  }
  return input;
}

async function readEvent(
  reader: AsyncIterator<NativeEvent>,
  handoff: InteractionHandoff | undefined,
  state: RequestState,
) {
  if (!handoff?.current) return reader.next();
  const signal = AbortSignal.any([handoff.pause, state.signal]);
  signal.throwIfAborted();
  let interrupt!: () => void;
  try {
    return await Promise.race([
      reader.next(),
      new Promise<never>((_, reject) => {
        interrupt = () => reject(signal.reason);
        signal.addEventListener("abort", interrupt, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", interrupt);
  }
}

export class StreamingGemini extends Gemini {
  private readonly request = new AsyncLocalStorage<RequestState>();
  private readonly accounts = new WeakMap<LlmRequest, string>();
  private readonly activity = new WeakMap<
    LlmRequest,
    {
      turnId: string;
      startedAt: number;
      onSummary: (id: string, text: string) => void;
      timing: ChatTiming;
      handoff?: InteractionHandoff;
    }
  >();

  observeActivity(
    request: LlmRequest,
    activity: {
      turnId: string;
      startedAt: number;
      onSummary: (id: string, text: string) => void;
      timing: ChatTiming;
      handoff?: InteractionHandoff;
    },
  ) {
    this.activity.set(request, activity);
  }

  bindAccount(request: LlmRequest, accountId: string) {
    this.accounts.set(request, accountId);
  }

  constructor(
    options: ConstructorParameters<typeof Gemini>[0],
    private readonly thinkingLevel?: ChatGeneration["effort"],
    private readonly billing?: ReturnType<typeof createInferenceBilling>,
    private readonly region = "global",
  ) {
    super(options);
  }

  override get apiClient() {
    const client = super.apiClient;
    const current = this.request.getStore();
    if (!current) return client;
    const state = current;
    const thinkingLevel = this.thinkingLevel;
    const region = this.region;
    const billing = this.billing;
    return new Proxy(client, {
      get(target, property, receiver) {
        if (property !== "interactions") return Reflect.get(target, property, receiver);
        return new Proxy(target.interactions, {
          get(interactions, name, source) {
            if (name !== "create") return Reflect.get(interactions, name, source);
            return async (...[params, options]: InteractionRequest) => {
              state.signal.throwIfAborted();
              const started = performance.now();
              let firstEventMs: number | undefined;
              let firstTextMs: number | undefined;
              const handoff = state.handoff;
              const restored = params.stream ? handoff?.restoring : undefined;
              const accountId = state.accountId;
              if (billing && (!accountId || !("model" in params) || !params.model))
                throw new BillingError("BILLING_UNAVAILABLE", 503);
              const charge = billing && accountId && "model" in params && params.model
                ? restored
                  ? await billing.recover(accountId, restored.billingId ?? "")
                  : await billing.begin(accountId, "chat", params.model, region)
                : undefined;
              const settle = async (interaction: { id: string; usage?: InteractionUsage }) => {
                let reported = interaction.usage;
                if (!billing || !accountId || !charge) return reported;
                let usage = usageFromInteraction(reported);
                if (!usage) {
                  const finished = await interactions.get(
                    interaction.id,
                    { stream: false },
                    { signal: AbortSignal.timeout(5_000) },
                  ).catch(() => undefined);
                  reported = finished?.id === interaction.id ? finished?.usage : undefined;
                  usage = usageFromInteraction(reported);
                }
                if (!usage) throw new BillingError("BILLING_USAGE_PENDING", 409);
                await billing.settle(accountId, charge, usage, interaction.id);
                return reported;
              };
              const inference = restored ? undefined : state.timing?.inference();
              console.info({
                event: "gemini_interaction_requested",
                turnId: state.timing?.turnId,
                inference,
                model: "model" in params ? params.model : undefined,
                effort: thinkingLevel,
                stateful: Boolean(params.previous_interaction_id),
                resumed: Boolean(restored),
              });
              state.completionStatus = undefined;
              state.usage = undefined;
              state.progress(firstEventTimeoutMs);
              if (restored && handoff) {
                handoff.restoring = undefined;
                handoff.current = restored;
                handoff.inspectFirst = true;
              } else if (handoff) {
                handoff.inspectFirst = false;
              }
              const note = !restored && handoff?.notePending;
              if (note) handoff.notePending = false;
              const streamAbort = new AbortController();
              const requestSignal = AbortSignal.any([
                state.signal,
                streamAbort.signal,
                ...(handoff && restored ? [handoff.pause] : []),
              ]);
              const resume = (cursor: InteractionCursor) =>
                interactions.get(
                  cursor.id,
                  { stream: true, last_event_id: cursor.lastEventId },
                  { signal: requestSignal },
                );
              const response = await (
                restored
                  ? restored.frames.some((event) => event.event_type === "interaction.completed")
                    ? Promise.resolve(undefined)
                    : resume(restored)
                  : interactions.create(
                      "model" in params
                        ? {
                            ...params,
                            ...(params.stream && { background: true, store: true }),
                            input: encodeToolResults(
                              Array.isArray(params.input)
                                ? ([
                                    ...params.input.filter(
                                      (step) =>
                                        !params.previous_interaction_id ||
                                        step.type === "function_result" ||
                                        step.type === "user_input",
                                    ),
                                    ...(note
                                      ? [
                                          {
                                            type: "user_input" as const,
                                            content: [
                                              { type: "text" as const, text: renewalInstruction },
                                            ],
                                          },
                                        ]
                                      : []),
                                  ] as InteractionInput)
                                : params.input,
                            ),
                            generation_config: {
                              ...params.generation_config,
                              thinking_summaries: "auto",
                              ...(thinkingLevel && { thinking_level: thinkingLevel }),
                            },
                          }
                        : params,
                      { ...options, signal: requestSignal },
                    )
              ).catch(async (error: unknown) => {
                state.stopWatching();
                if (billing && accountId && charge && !restored && rejectedBeforeGeneration(error))
                  await billing.releaseRejected(accountId, charge, error.status);
                console.info({
                  event: "gemini_interaction_ended",
                  turnId: state.timing?.turnId,
                  inference,
                  durationMs: Math.round(performance.now() - started),
                  outcome: "request_failed",
                });
                throw error;
              });
              if (response && !(Symbol.asyncIterator in response)) {
                state.stopWatching();
                await settle(response);
                return response;
              }
              // ADK 2.5 reads the stream but drops native usage and the request's abort signal.
              return {
                async *[Symbol.asyncIterator]() {
                  let outcome = "stream_ended";
                  let reader = response?.[Symbol.asyncIterator]();
                  const delivered = new Set(
                    restored?.frames.flatMap(({ event_id }) => (event_id ? [event_id] : [])),
                  );
                  async function* events() {
                    let reconnected = false;
                    if (restored) {
                      state.replaying = true;
                      yield* [...restored.frames];
                      state.replaying = false;
                      if (state.completionStatus) return;
                    }
                    while (reader) {
                      const next = await readEvent(reader, handoff, state).catch(
                        (error: unknown) => {
                          if (
                            !handoff?.current ||
                            state.signal.aborted ||
                            handoff.pause.aborted ||
                            reconnected
                          )
                            throw error;
                          return undefined;
                        },
                      );
                      if (!next || next.done) {
                        const cursor = handoff?.current;
                        const status = cursor?.status;
                        if (cursor && (status === "completed" || status === "requires_action")) {
                          yield {
                            event_type: "interaction.completed",
                            interaction: { id: cursor.id, status },
                          } satisfies NativeEvent;
                          return;
                        }
                        if (!cursor?.id || reconnected) return;
                        reconnected = true;
                        void reader.return?.().catch(() => {});
                        reader = (await resume(cursor))[Symbol.asyncIterator]();
                        continue;
                      }
                      const event = next.value;
                      if (event.event_id && delivered.has(event.event_id)) continue;
                      if (
                        handoff &&
                        event.event_type === "interaction.created" &&
                        handoff.current?.id !== event.interaction.id
                      ) {
                        handoff.current = {
                          id: event.interaction.id,
                          billingId: charge?.id,
                          frames: [],
                          activityId: state.activityId,
                          status: event.interaction.status,
                        };
                      } else {
                        handoff?.pause.throwIfAborted();
                      }
                      const cursor = handoff?.current;
                      if (cursor) {
                        if (event.event_id) {
                          cursor.lastEventId = event.event_id;
                          delivered.add(event.event_id);
                        }
                        if (event.event_type === "interaction.status_update")
                          cursor.status = event.status;
                        if (event.event_type === "interaction.completed")
                          cursor.status = event.interaction.status;
                        cursor.frames.push(event);
                      }
                      handoff?.pause.throwIfAborted();
                      yield event;
                    }
                  }
                  try {
                    for await (const event of events()) {
                      if (firstEventMs === undefined) {
                        firstEventMs = Math.round(performance.now() - started);
                        state.timing?.mark("providerFirstEvent");
                        state.progress(streamIdleTimeoutMs);
                      }
                      if (event.event_type === "interaction.created" && billing && accountId && charge && !restored) {
                        await billing.rememberProviderId(accountId, charge.id, event.interaction.id);
                      } else if (event.event_type === "step.start" || event.event_type === "step.stop") {
                        state.progress(streamIdleTimeoutMs);
                        if (event.event_type === "step.start" && event.step.type === "thought")
                          state.timing?.progress("reasoning");
                      } else if (event.event_type === "step.delta") {
                        const { delta } = event;
                        if (delta.type === "text" && delta.text) {
                          firstTextMs ??= Math.round(performance.now() - started);
                          state.timing?.mark("providerFirstText");
                          state.timing?.progress("text");
                          state.progress(streamIdleTimeoutMs);
                        } else if (
                          delta.type === "thought_summary" &&
                          delta.content?.type === "text"
                        ) {
                          const text = delta.content.text;
                          if (text) {
                            state.timing?.progress("reasoning");
                            state.progress(streamIdleTimeoutMs);
                            const append =
                              state.summary && state.summaryStep !== event.index
                                ? `\n\n${text}`
                                : text;
                            state.summaryStep = event.index;
                            state.summary += append;
                            if (!state.replaying) state.onSummary?.(append);
                          }
                        } else if (
                          (delta.type === "arguments_delta" && delta.arguments) ||
                          (delta.type === "thought_signature" && delta.signature)
                        ) {
                          state.progress(streamIdleTimeoutMs);
                        }
                      } else if (event.event_type === "interaction.completed") {
                        state.stopWatching();
                        const usage = await settle(event.interaction);
                        state.completionStatus = event.interaction.status;
                        state.usage = usage && {
                          promptTokenCount: usage.total_input_tokens,
                          cachedContentTokenCount: usage.total_cached_tokens,
                          candidatesTokenCount: usage.total_output_tokens,
                          thoughtsTokenCount: usage.total_thought_tokens,
                          totalTokenCount: usage.total_tokens,
                        };
                        outcome = event.interaction.status;
                      } else if (event.event_type === "interaction.status_update") {
                        outcome = event.status;
                      } else if (event.event_type === "error") {
                        outcome = "provider_error";
                      }
                      yield event;
                      if (state.completionStatus) return;
                    }
                  } finally {
                    streamAbort.abort();
                    state.stopWatching();
                    // Closing the transport must not delay or invalidate a terminal event.
                    void reader?.return?.().catch(() => {});
                    reader = undefined;
                    const cursor = handoff?.current;
                    if (
                      cursor &&
                      state.invocation?.aborted &&
                      !handoff?.pause.aborted &&
                      !state.completionStatus
                    )
                      void interactions.cancel(cursor.id).catch(() => {});
                    console.info({
                      event: "gemini_interaction_ended",
                      turnId: state.timing?.turnId,
                      inference,
                      firstEventMs,
                      firstTextMs,
                      durationMs: Math.round(performance.now() - started),
                      outcome:
                        !state.completionStatus && state.signal.aborted ? "aborted" : outcome,
                      usage: state.usage,
                    });
                  }
                },
              };
            };
          },
        });
      },
    });
  }

  override async *generateContentAsync(
    request: LlmRequest,
    stream = false,
    signal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    if (request.config?.tools) {
      // Interactions expects JSON Schema. ADK's GenerateContent declarations use string limits.
      request.config.tools = request.config.tools.map((tool) =>
        "functionDeclarations" in tool && tool.functionDeclarations
          ? {
              ...tool,
              functionDeclarations: tool.functionDeclarations.map(
                ({ parameters, ...declaration }) =>
                  parameters
                    ? {
                        ...declaration,
                        parametersJsonSchema:
                          declaration.parametersJsonSchema ??
                          normalizeExclusiveBounds(genaiSchemaToJsonSchema(parameters)),
                      }
                    : declaration,
              ),
            }
          : tool,
      );
    }
    const activity = this.activity.get(request);
    const activityId = activity
      ? (activity.handoff?.restoring?.activityId ?? randomUUID())
      : undefined;
    let thinkingMs: number | undefined;
    const idle = new AbortController();
    const invocation = signal ?? request.config?.abortSignal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const state: RequestState = {
      signal: invocation ? AbortSignal.any([invocation, idle.signal]) : idle.signal,
      accountId: this.accounts.get(request),
      timing: activity?.timing,
      handoff: activity?.handoff,
      activityId,
      invocation,
      progress(timeoutMs) {
        clearTimeout(timer);
        timer = setTimeout(() => idle.abort(), timeoutMs);
      },
      stopWatching() {
        clearTimeout(timer);
      },
      summary: "",
      onSummary:
        activityId && activity ? (text) => activity.onSummary(activityId, text) : undefined,
    };
    let responses = super.generateContentAsync(request, stream, state.signal);
    let emitted = false;
    const recoverRejectedLink = (message?: string) => {
      const id = request.previousInteractionId;
      if (
        !id ||
        !message ||
        emitted ||
        state.summary ||
        state.handoff?.current ||
        state.handoff?.restoring ||
        !rejectedInteraction(message, id)
      )
        return false;
      state.signal.throwIfAborted();
      console.warn({ event: "gemini_interaction_rebased", turnId: activity?.turnId });
      recoverInterruptedCalls(request, undefined, true);
      return true;
    };
    try {
      for (;;) {
        const next = await this.request
          .run(state, () => responses.next())
          .catch((error: unknown) => {
            if (!(error instanceof Error) || !recoverRejectedLink(error.message)) throw error;
            return undefined;
          });
        if (
          !next ||
          (!next.done && next.value.errorCode && recoverRejectedLink(next.value.errorMessage))
        ) {
          await responses.return();
          responses = super.generateContentAsync(request, stream, state.signal);
          continue;
        }
        const { done, value } = next;
        if (done) throw new ChatError("AGENT_EMPTY_RESPONSE", 502);
        if (value.errorCode) {
          yield value;
          return;
        }
        if (value.partial) {
          if (state.replaying) continue;
          emitted = true;
          if (activity) thinkingMs ??= Math.max(0, Date.now() - activity.startedAt);
          yield {
            ...value,
            ...(activity && {
              customMetadata: {
                ...value.customMetadata,
                miraiTurnId: activity.turnId,
                miraiResponseId: value.interactionId,
                miraiThinkingMs: thinkingMs,
              },
            }),
          };
          continue;
        }
        state.stopWatching();
        invocation?.throwIfAborted();
        const status = state.completionStatus;
        if (!status) state.signal.throwIfAborted();
        else if (status !== "completed" && status !== "requires_action") {
          yield { errorCode: "VERTEX_INTERACTION_INCOMPLETE", errorMessage: status };
          return;
        }
        if (!value.content?.parts?.length) throw new ChatError("AGENT_EMPTY_RESPONSE", 502);
        const summary = state.summary.trim();
        if (activity && value.content.parts.some((part) => part.text && !part.thought)) {
          thinkingMs ??= Math.max(0, Date.now() - activity.startedAt);
        }
        // Release the provider stream before ADK persists the answer or invokes tools.
        await responses.return();
        yield {
          ...value,
          ...(state.usage && { usageMetadata: { ...value.usageMetadata, ...state.usage } }),
          customMetadata: {
            ...value.customMetadata,
            ...(summary && { providerSummary: summary }),
            ...(summary && activityId && { miraiActivityId: activityId }),
            ...(activity && { miraiTurnId: activity.turnId }),
            ...(value.interactionId && {
              miraiInteractionId: value.interactionId,
              miraiResponseId: value.interactionId,
            }),
            ...(thinkingMs !== undefined && { miraiThinkingMs: thinkingMs }),
          },
        };
        return;
      }
    } catch (error) {
      if (!idle.signal.aborted || invocation?.aborted) throw error;
      yield { errorCode: "VERTEX_STREAM_STALLED" };
    } finally {
      state.stopWatching();
      await responses.return();
    }
  }
}
