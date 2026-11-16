import { z } from "zod";
export * from "./session.js";
export * from "./extension.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
