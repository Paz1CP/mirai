import { z } from "zod";
import { isCompactedEvent, type Event } from "@google/adk";
import { queuedChatSchema, type ChatEvent, type QueuedMessage } from "@mirai/contracts";
import { BillingError } from "../billing/walletRepository.js";

const partSchema = z.object({
  text: z.string().optional(),
  thought: z.boolean().optional(),
  functionCall: z
    .object({ name: z.string().optional(), id: z.string().optional(), args: z.json().optional() })
    .optional(),
  functionResponse: z
    .object({
      name: z.string().optional(),
      id: z.string().optional(),
      response: z.json().optional(),
    })
    .optional(),
});
const usageSchema = z.object({ promptTokenCount: z.number().int().nonnegative().optional() });
const rawPayloadSchema = z.object({
  id: z.string().optional(),
  author: z.string().optional(),
  content: z.object({ parts: z.array(z.unknown()).optional() }).optional(),
  usageMetadata: usageSchema.optional(),
  customMetadata: z.record(z.string(), z.unknown()).optional(),
});
export const providerEventSchema = z.object({
  name: z.string(),
  timestamp: z.string(),
  author: z.string(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  content: z.object({ parts: z.array(z.unknown()).optional() }).optional(),
  eventMetadata: z
    .object({ customMetadata: z.record(z.string(), z.unknown()).optional() })
    .optional(),
  rawEvent: rawPayloadSchema.optional(),
});

export function billingErrorFromAdk(code: string, message?: string) {
  // ADK reports locally thrown tool and model errors with a generic code.
  if (code !== "UNKNOWN_ERROR") return;
  if (message === "INSUFFICIENT_CREDITS") return new BillingError(message, 402);
  if (message === "BILLING_USAGE_PENDING") return new BillingError(message, 409);
  if (message === "AI_UNAVAILABLE") return new BillingError(message, 502);
  if (message === "BILLING_TARIFF_UNAVAILABLE" || message === "BILLING_UNAVAILABLE")
    return new BillingError(message, 503);
}

export function providerErrorText(code: string, message?: string) {
  const billingError = billingErrorFromAdk(code, message);
  if (billingError) return billingError.code;
  if (!message) return code;
  const detail = message
    .replace(/\b(?:Bearer\s+[^\s"',;]+|AIza[\w-]+|ya29\.[\w.-]+)/gi, "[redacted]")
    .slice(0, 2000);
  return `${code}: ${detail}`;
}

function visibleToolData(name: string, value: unknown) {
  if (
    ["getCandidateContext", "getDocument", "prepareAttachment"].includes(name) ||
    name.startsWith("browser_")
  )
    return undefined;
  if (name === "listDocuments" && typeof value === "object" && value && "cvs" in value) {
    const inventory = z
      .object({
        cvs: z.json(),
        originals: z.json(),
        primaryId: z.json().optional(),
        defaultId: z.json(),
      })
      .safeParse(value);
    value = inventory.success ? inventory.data : undefined;
  }
  const data = z.json().safeParse(value);
  return data.success && JSON.stringify(data.data).length <= 8000 ? data.data : undefined;
}

function partsFor(input: unknown[], providerSummary?: unknown) {
  const parts: ChatEvent["parts"] = [];
  if (typeof providerSummary === "string" && providerSummary)
    parts.push({ type: "reasoning", text: providerSummary });
  for (const value of input) {
    const { data: part } = partSchema.safeParse(value);
    if (!part) continue;
    if (part.functionCall?.name) {
      const { id, name, args } = part.functionCall;
      parts.push({ type: "tool", direction: "call", id, name, data: visibleToolData(name, args) });
    } else if (part.functionResponse?.name) {
      const { id, name, response } = part.functionResponse;
      parts.push({
        type: "tool",
        direction: "result",
        id,
        name,
        data: visibleToolData(name, response),
      });
      if (name === "createCampaign") {
        const result = z.object({ id: z.uuid() }).safeParse(response);
        if (result.success) parts.push({ type: "campaign", id: result.data.id });
      }
    } else if (part.text && !part.thought) {
      const previous = parts.at(-1);
      if (previous?.type === "text") previous.text += part.text;
      else parts.push({ type: "text", text: part.text });
    }
  }
  return parts;
}

const activityMetadataSchema = z.object({
  miraiTurnId: z.string().optional(),
  miraiActivityId: z.string().optional(),
  miraiThinkingMs: z.number().int().nonnegative().optional(),
});

function activityFields(metadata: unknown) {
  const data = activityMetadataSchema.safeParse(metadata).data;
  return {
    turnId: data?.miraiTurnId,
    activityId: data?.miraiActivityId,
    thinkingMs: data?.miraiThinkingMs,
  };
}

export function toChatEvent(event: Event): ChatEvent | undefined {
  if (isCompactedEvent(event) || event.customMetadata?.miraiControlCommand) return;
  const parts = partsFor(event.content?.parts ?? [], event.customMetadata?.providerSummary);
  if (parts.length)
    return {
      id:
        event.author === "user" && typeof event.customMetadata?.miraiCommandId === "string"
          ? event.customMetadata.miraiCommandId
          : typeof event.customMetadata?.miraiResponseId === "string"
            ? event.customMetadata.miraiResponseId
            : event.id,
      at: new Date(event.timestamp).toISOString(),
      role: event.author === "user" ? "user" : "assistant",
      parts,
      ...activityFields(event.customMetadata),
    };
}

export function queuedUserContent(message: QueuedMessage): Pick<ChatEvent, "parts" | "attachments"> {
  return {
    parts: message.text ? [{ type: "text", text: message.text }] : [],
    attachments: message.attachments?.map((file, index) => ({
      name: file.name,
      mimeType: file.mimeType,
      originalId: file.originalId,
      position: "position" in file ? file.position : index,
    })),
  };
}

export function fromProviderEvent(event: z.infer<typeof providerEventSchema>) {
  const custom = event.eventMetadata?.customMetadata ?? event.rawEvent?.customMetadata;
  const usage =
    event.rawEvent?.usageMetadata ?? usageSchema.safeParse(custom?._usage_metadata).data;
  const used = usage?.promptTokenCount ?? null;
  const queued = queuedChatSchema.safeParse(custom?.miraiQueued);
  const compacted = Boolean(custom?._compaction);
  const content: Pick<ChatEvent, "parts" | "attachments"> =
    compacted || custom?.miraiControlCommand
      ? { parts: [] }
      : queued.success
        ? queuedUserContent(queued.data)
        : {
            parts: partsFor(
              event.rawEvent?.content?.parts ?? event.content?.parts ?? [],
              custom?.providerSummary,
            ),
          };
  const timestamp = new Date(event.timestamp);
  const clientEventId = custom?.miraiCommandId;
  const history =
    (content.parts.length || content.attachments?.length) && Number.isFinite(timestamp.getTime())
      ? {
          id:
            typeof clientEventId === "string"
              ? clientEventId
              : typeof custom?.miraiResponseId === "string"
                ? custom.miraiResponseId
                : event.rawEvent?.id || event.name.split("/").at(-1) || event.name,
          at: timestamp.toISOString(),
          role:
            event.author === "user" || queued.success ? ("user" as const) : ("assistant" as const),
          ...content,
          ...activityFields(custom),
        }
      : undefined;
  const error =
    event.errorCode && event.errorCode !== "INVOCATION_ABORTED"
      ? providerErrorText(event.errorCode, event.errorMessage)
      : undefined;
  return { history, used, compacted, error };
}
