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

type InteractionClient = Gemini["apiClient"]["interactions"];
type InteractionRequest = Parameters<InteractionClient["create"]>;
type InteractionInput = Extract<InteractionRequest[0], { model: string }>["input"];
type RequestState = {
  signal?: AbortSignal;
  used?: number;
  summary: string;
  summaryStep?: number;
  onSummary?: (text: string) => void;
};

export function recoverInterruptedCalls(
  request: LlmRequest,
  previousEvent?: Event,
  restartInteraction = false,
) {
  const contents = request.contents ?? [];
  const answered = new Set(
    contents.flatMap(
      (content) =>
        content.parts?.flatMap(({ functionResponse }) =>
          functionResponse?.id ? [functionResponse.id] : [],
        ) ?? [],
    ),
  );
  if (
    restartInteraction ||
    previousEvent?.errorCode ||
    previousEvent?.content?.parts?.some(({ functionCall }) =>
      functionCall?.id ? !answered.has(functionCall.id) : false,
    )
  )
    request.previousInteractionId = undefined;
  if (request.previousInteractionId) return;
  request.contents = contents.flatMap((content) => {
    const missed = (content.parts ?? []).flatMap(({ functionCall }) => {
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
    return missed.length ? [content, { role: "user", parts: missed }] : [content];
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
  content: z.array(z.object({
    type: z.literal("image"),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/jpg", "image/gif"]),
    data: z.string().min(1),
  }).or(z.object({ type: z.literal("text"), text: z.string().min(1) }))),
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

export class StreamingGemini extends Gemini {
  private readonly request = new AsyncLocalStorage<RequestState>();
  private readonly activity = new WeakMap<
    LlmRequest,
    {
      turnId: string;
      startedAt: number;
      onSummary: (id: string, text: string) => void;
    }
  >();

  observeActivity(
    request: LlmRequest,
    activity: {
      turnId: string;
      startedAt: number;
      onSummary: (id: string, text: string) => void;
    },
  ) {
    this.activity.set(request, activity);
  }

  constructor(
    options: ConstructorParameters<typeof Gemini>[0],
    private readonly thinkingLevel?: ChatGeneration["effort"],
  ) {
    super(options);
  }

  override get apiClient() {
    const client = super.apiClient;
    const state = this.request.getStore();
    if (!state) return client;
    const thinkingLevel = this.thinkingLevel;
    return new Proxy(client, {
      get(target, property, receiver) {
        if (property !== "interactions") return Reflect.get(target, property, receiver);
        return new Proxy(target.interactions, {
          get(interactions, name, source) {
            if (name !== "create") return Reflect.get(interactions, name, source);
            return async (...[params, options]: InteractionRequest) => {
              state.signal?.throwIfAborted();
              const started = performance.now();
              console.info({
                event: "gemini_interaction_requested",
                model: "model" in params ? params.model : undefined,
              });
              const response = await interactions.create(
                "model" in params
                  ? {
                    ...params,
                    input: encodeToolResults(params.input),
                    generation_config: {
                      ...params.generation_config,
                      thinking_summaries: "auto",
                      ...(thinkingLevel && { thinking_level: thinkingLevel }),
                    },
                  }
                  : params,
                { ...options, signal: state.signal },
              );
              if (!(Symbol.asyncIterator in response)) return response;
              // ADK 2.5 reads the stream but drops native usage and the request's abort signal.
              return {
                async *[Symbol.asyncIterator]() {
                  for await (const event of response) {
                    if (event.event_type === "interaction.completed") {
                      state.used = event.interaction.usage?.total_input_tokens;
                      console.info({
                        event: "gemini_interaction_completed",
                        durationMs: Math.round(performance.now() - started),
                        inputTokens: state.used,
                        cachedTokens: event.interaction.usage?.total_cached_tokens,
                      });
                    } else if (
                      event.event_type === "step.delta" &&
                      event.delta.type === "thought_summary" &&
                      event.delta.content?.type === "text"
                    ) {
                      if (state.summary && state.summaryStep !== event.index)
                        state.summary += "\n\n";
                      state.summaryStep = event.index;
                      state.summary += event.delta.content.text ?? "";
                      if (!state.signal?.aborted && state.summary.trim()) {
                        state.onSummary?.(state.summary);
                      }
                    }
                    yield event;
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
    const activityId = activity ? randomUUID() : undefined;
    let thinkingMs: number | undefined;
    const state: RequestState = {
      signal: signal ?? request.config?.abortSignal,
      summary: "",
      onSummary:
        activityId && activity ? (text) => activity.onSummary(activityId, text) : undefined,
    };
    let responses = super.generateContentAsync(request, stream, state.signal);
    let final: LlmResponse | undefined;
    let emitted = false;
    const recoverRejectedLink = (message?: string) => {
      const id = request.previousInteractionId;
      if (!id || !message || emitted || final || state.summary || !rejectedInteraction(message, id))
        return false;
      state.signal?.throwIfAborted();
      console.warn({ event: "gemini_interaction_rebased", previousInteractionId: id });
      recoverInterruptedCalls(request, undefined, true);
      return true;
    };
    try {
      for (; ;) {
        const next = await this.request.run(state, () => responses.next()).catch((error: unknown) => {
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
        if (done) break;
        if (value.errorCode) {
          yield value;
          return;
        }
        if (value.partial) {
          emitted = true;
          if (activity) thinkingMs ??= Math.max(0, Date.now() - activity.startedAt);
          yield {
            ...value,
            ...(activity && {
              customMetadata: {
                ...value.customMetadata,
                miraiTurnId: activity.turnId,
                miraiThinkingMs: thinkingMs,
              },
            }),
          };
        }
        // Only the completed interaction can hand its function calls to the runner.
        else if (!stream || value.turnComplete) final = value;
      }
      state.signal?.throwIfAborted();
      if (!final?.content?.parts?.length) throw new ChatError("AGENT_EMPTY_RESPONSE", 502);
      const summary = state.summary.trim();
      if (activity && final.content.parts.some((part) => part.text && !part.thought)) {
        thinkingMs ??= Math.max(0, Date.now() - activity.startedAt);
      }
      yield {
        ...final,
        ...(state.used !== undefined && {
          usageMetadata: { ...final.usageMetadata, promptTokenCount: state.used },
        }),
        customMetadata: {
          ...final.customMetadata,
          ...(summary && { providerSummary: summary }),
          ...(summary && activityId && { miraiActivityId: activityId }),
          ...(activity && { miraiTurnId: activity.turnId }),
          ...(thinkingMs !== undefined && { miraiThinkingMs: thinkingMs }),
        },
      };
    } finally {
      await responses.return();
    }
  }
}
