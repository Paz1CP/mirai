import { z } from "zod";

export const extensionPortName = "mirai:browser";
export const workspacePortName = "mirai:workspace";
export const workspaceExtensionFrame = JSON.stringify({ method: "workspace.initialized" });
export const extensionReady = { method: "extension.initialized", params: [] };
export const extensionReadyFrame = JSON.stringify(extensionReady);
export const extensionRestoreFrame = JSON.stringify({ method: "extension.restore" });
export const extensionCancelSchema = z.object({
  method: z.literal("extension.cancel"),
  params: z.tuple([z.int()]),
});
export const extensionReadySchema = z.object({
  method: z.literal("extension.initialized"),
  params: z.array(z.int().nonnegative()),
});
export const chromeTabIdSchema = z.int().nonnegative();
export const workspaceTabsSchema = z.object({
  selectedTabId: chromeTabIdSchema.optional(),
  tabs: z.array(
    z.object({
      id: chromeTabIdSchema,
      windowId: z.int(),
      url: z.string().optional(),
      title: z.string().optional(),
      active: z.boolean(),
    }),
  ),
});
const bridgeId = z.uuid();
const frame = z.string().max(32 * 1024 * 1024);

export const bridgeRequestSchema = z.discriminatedUnion("type", [
  z.object({
    channel: z.literal("mirai:web"),
    bridgeId,
    type: z.literal("connect"),
    workspace: z.literal(true).optional(),
  }),
  z.object({ channel: z.literal("mirai:web"), bridgeId, type: z.literal("frame"), frame }),
  z.object({ channel: z.literal("mirai:web"), bridgeId, type: z.literal("disconnect") }),
]);

export const bridgeResponseSchema = z.discriminatedUnion("type", [
  z.object({ channel: z.literal("mirai:extension"), bridgeId, type: z.literal("frame"), frame }),
  z.object({ channel: z.literal("mirai:extension"), bridgeId, type: z.literal("closed") }),
]);

export function decodeBridgeMessage(value: unknown): unknown {
  if (typeof value !== "string" || value.length > 40 * 1024 * 1024) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
