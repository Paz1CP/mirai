import { z } from "zod";
import { campaignSummarySchema } from "./results.js";
import { documentLimits } from "./documents.js";

export const chatImageMaxBytes = 15 * 1024 * 1024;
export const chatStoredImageLimit = 30;

export const chatIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
export const chatSummarySchema = z.object({
  id: chatIdSchema,
  title: z.string(),
  updatedAt: z.iso.datetime(),
});
export const createChatSchema = z.object({
  title: z.string().trim().min(1).max(160),
});
const chatAttachmentMimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const chatAttachmentMetadata = z.object({
  name: z.string().min(1).max(255),
  mimeType: chatAttachmentMimeSchema,
  originalId: z.uuid().optional(),
});
const chatAttachmentRefSchema = chatAttachmentMetadata.extend({ position: z.int().min(0).max(19) });
export type ChatAttachmentRef = z.infer<typeof chatAttachmentRefSchema>;
const chatAttachment = chatAttachmentMetadata.extend({
  data: z.base64().max(4 * Math.ceil(chatImageMaxBytes / 3)),
});
export const chatAttachmentSchema = chatAttachment.refine(({ data, mimeType }) => {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const byteLength = (data.length / 4) * 3 - padding;
  return (
    byteLength <= (mimeType.startsWith("image/") ? chatImageMaxBytes : documentLimits.fileBytes)
  );
});
export const chatModelSchema = z.enum(["gemini-4-hydrogen", "gemini-3.8-flash"]);
export const chatThinkingLevels = {
  "gemini-4-hydrogen": ["low", "medium", "high", "xhigh"],
  "gemini-3.8-flash": ["low", "medium", "high"],
} as const;
export const chatGenerationSchema = z
  .object({
    model: chatModelSchema,
    effort: z.enum(chatThinkingLevels["gemini-4-hydrogen"]),
  })
  .refine(({ model, effort }) => chatThinkingLevels[model].some((level) => level === effort));
export type ChatGeneration = z.infer<typeof chatGenerationSchema>;
export const defaultChatGeneration: ChatGeneration = { model: "gemini-4-hydrogen", effort: "high" };

export const sendChatSchema = z
  .object({
    id: z.uuid(),
    text: z.string().trim().max(30000),
    instanceId: z.uuid(),
    locale: z.enum(["es", "en"]),
    generation: chatGenerationSchema.optional(),
    attachments: z.array(chatAttachmentSchema).max(20).optional(),
  })
  .refine((message) => Boolean(message.text || message.attachments?.length))
  .refine(
    (message) =>
      (message.attachments ?? []).filter((item) => item.mimeType.startsWith("image/")).length <= 10,
  )
  .refine(
    (message) =>
      (message.attachments ?? []).filter((item) => !item.mimeType.startsWith("image/")).length <=
      10,
  )
  .refine(
    (message) =>
      (message.attachments ?? []).reduce((sum, item) => sum + item.data.length, 0) <= 42_000_000,
  );
export const queuedChatSchema = z.union([
  sendChatSchema,
  z.object({
    ...sendChatSchema.shape,
    attachments: chatAttachmentRefSchema.array().max(20),
  }),
]);
export type QueuedMessage = z.infer<typeof queuedChatSchema>;
export const storedChatFileSchema = z.object({
  imageMimeType: z
    .enum(["image/png", "image/jpeg", "image/webp", "image/jpg"])
    .nullable()
    .optional(),
  chatId: chatIdSchema,
  messageId: z.uuid(),
  position: z.int().nonnegative(),
  name: z.string().nullable(),
});
export const chatContextSchema = z.object({
  used: z.number().int().nonnegative().nullable(),
  capacity: z.number().int().positive().nullable(),
});
const chatPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("reasoning"), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    direction: z.enum(["call", "result"]),
    id: z.string().optional(),
    name: z.string(),
    data: z.json().optional(),
  }),
  z.object({ type: z.literal("campaign"), id: z.uuid() }),
]);
export const chatEventSchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  role: z.enum(["user", "assistant"]),
  parts: chatPartSchema.array(),
  attachments: chatAttachmentRefSchema.array().max(20).optional(),
  turnId: z.string().optional(),
  activityId: z.string().optional(),
  thinkingMs: z.number().int().nonnegative().optional(),
});
const chatPhaseSchema = z.enum(["session", "waiting", "reasoning", "text", "tools"]);
export const activeTurnSchema = z.object({
  id: z.string(),
  startedAt: z.number().int().nonnegative(),
  phase: chatPhaseSchema.optional(),
});
export const chatHistorySchema = z.object({
  items: chatEventSchema.array(),
  next: z.string().nullable(),
  context: chatContextSchema,
  error: z.string().optional(),
});
export const chatStatusSchema = z.object({
  campaign: campaignSummarySchema.nullable(),
  context: chatContextSchema,
});
export const chatStreamSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("event"), event: chatEventSchema, partial: z.boolean() }),
  z.object({ type: z.literal("completed"), turnId: z.string() }),
  z.object({ type: z.literal("context"), context: chatContextSchema }),
  z.object({
    type: z.literal("status"),
    working: z.boolean(),
    error: z.string().nullable(),
    turn: activeTurnSchema.optional(),
  }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
export type ChatStream = z.infer<typeof chatStreamSchema>;
export type ChatContext = z.infer<typeof chatContextSchema>;
export type ChatTurn = z.infer<typeof activeTurnSchema>;
export type ChatPhase = z.infer<typeof chatPhaseSchema>;
export type SendChat = z.infer<typeof sendChatSchema>;
