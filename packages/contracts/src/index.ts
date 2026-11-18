import { z } from "zod";
export * from "./session.js";
export * from "./extension.js";
export * from "./profile.js";
export * from "./preferences.js";
export * from "./preferenceOptions.js";
export * from "./documents.js";
export * from "./cvs.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
