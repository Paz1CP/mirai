import { z } from "zod";
import { chatIdSchema, chatStreamSchema, sendChatSchema } from "./chat.js";

export const workspaceSocketPath = "/v1/workspace";
export const workspaceFrameLimit = 44 * 1024 * 1024;
const browserFrame = z.string().max(32 * 1024 * 1024);
const requestId = z.uuid();

export const workspaceClientSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("open"),
    token: z.string().min(1).max(16384),
    expectedInstanceId: z.uuid().optional(),
  }),
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
  z.object({ type: z.literal("browser.frame"), frame: browserFrame }),
  z.object({ type: z.literal("browser.closed") }),
  z.object({ type: z.literal("control.release"), requestId }),
]);

export const workspaceServerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("control.ready"), instanceId: z.uuid() }),
  z.object({ type: z.literal("control.lost"), instanceId: z.uuid().nullable() }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    instanceId: z.uuid().optional(),
    requestId: requestId.optional(),
  }),
  z.object({ type: z.literal("accepted"), requestId }),
  z.object({ type: z.literal("chat.event"), chatId: chatIdSchema, event: chatStreamSchema }),
  z.object({ type: z.literal("results.changed") }),
  z.object({ type: z.literal("browser.frame"), frame: browserFrame }),
  z.object({ type: z.literal("browser.reset") }),
]);

export type WorkspaceClientFrame = z.infer<typeof workspaceClientSchema>;
export type WorkspaceServerFrame = z.infer<typeof workspaceServerSchema>;
