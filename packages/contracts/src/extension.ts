import { z } from "zod";
import { controlSchema } from "./session.js";

// Strings cross Firefox's content-script compartment without exporting privileged objects.
export function decodeBridgeMessage(value: unknown): unknown {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

const envelope = { channel: z.literal("mirai:web"), version: z.literal(1), requestId: z.uuid() };
export const bridgeRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...envelope, type: z.literal("status"), control: controlSchema }),
  z.strictObject({ ...envelope, type: z.literal("disconnect"), control: controlSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal("connect"),
    control: controlSchema,
    ticket: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
export const bridgeResponseSchema = z.strictObject({
  channel: z.literal("mirai:extension"),
  version: z.literal(1),
  requestId: z.uuid(),
  status: z.enum(["connected", "disconnected", "error"]),
});
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>;
export const browserLinkSchema = z.discriminatedUnion("ready", [
  z.object({ ready: z.literal(true) }),
  z.object({ ready: z.literal(false), ticket: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
