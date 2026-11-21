import { z } from "zod";
export * from "./extension.js";
export * from "./profile.js";
export * from "./preferences.js";
export * from "./preferenceOptions.js";
export * from "./documents.js";
export * from "./cvs.js";
export * from "./results.js";
export * from "./chat.js";
export * from "./workspaceSocket.js";
export * from "./billing.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
