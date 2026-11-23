import { z } from "zod";
import {
  activeTurnSchema,
  chatEventSchema,
  chatIdSchema,
  chatStreamSchema,
  sendChatSchema,
} from "./chat.js";

export const workspaceSocketPath = "/v1/workspace";
export const workspaceFrameLimit = 44 * 1024 * 1024;
const browserFrame = z.string().max(32 * 1024 * 1024);
const requestId = z.uuid();
const renewal = z.object({
  chatId: chatIdSchema.optional(),
  chatIds: chatIdSchema.array().optional(),
});
const activeChat = z.object({
  chatId: chatIdSchema,
  turn: activeTurnSchema.optional(),
  partials: chatEventSchema.array().optional(),
});

export const workspaceClientSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("open"),
    token: z.string().min(1).max(16384).optional(),
    accountId: z.string().min(1).max(256).optional(),
    tabId: z.uuid().optional(),
    expectedInstanceId: z.uuid().optional(),
    renewal: renewal.optional(),
  }),
  z.object({ type: z.literal("control.attach"), requestId, token: z.string().min(1).max(16384) }),
  z.object({ type: z.literal("control.keepalive") }),
  z.object({ type: z.literal("control.restore") }),
  z.object({
    type: z.literal("chat.send"),
    requestId,
    chatId: chatIdSchema,
    message: sendChatSchema,
  }),
  z.object({
    type: z.literal("chat.action"),
    requestId,
    chatId: chatIdSchema,
    action: z.enum(["stop", "compact", "resume"]),
    locale: z.enum(["es", "en"]),
    campaignId: z.uuid().optional(),
  }),
  z.object({
    type: z.literal("browser.frame"),
    chatId: chatIdSchema.optional(),
    frame: browserFrame,
  }),
  z.object({ type: z.literal("browser.closed"), chatId: chatIdSchema.optional() }),
  z.object({ type: z.literal("control.release"), requestId }),
]);

export const workspaceServerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("control.ready"),
    instanceId: z.uuid(),
    activeChats: activeChat.array().optional(),
  }),
  z.object({
    type: z.literal("control.attached"),
    requestId,
    instanceId: z.uuid(),
    activeChats: activeChat.array(),
  }),
  z.object({ type: z.literal("control.renew"), ...renewal.shape }),
  z.object({ type: z.literal("control.lost"), instanceId: z.uuid().nullable() }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    instanceId: z.uuid().optional(),
    requestId: requestId.optional(),
  }),
  z.object({ type: z.literal("accepted"), requestId }),
  z.object({ type: z.literal("chat.event"), chatId: chatIdSchema, event: chatStreamSchema }),
  z.object({ type: z.literal("billing.changed") }),
  z.object({ type: z.literal("control.idle") }),
  z.object({ type: z.literal("results.changed") }),
  z.object({
    type: z.literal("browser.frame"),
    chatId: chatIdSchema.optional(),
    frame: browserFrame,
  }),
  z.object({ type: z.literal("browser.reset"), chatId: chatIdSchema.optional() }),
]);

export type WorkspaceClientFrame = z.infer<typeof workspaceClientSchema>;
export type WorkspaceServerFrame = z.infer<typeof workspaceServerSchema>;
