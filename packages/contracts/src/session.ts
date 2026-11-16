import { z } from "zod";

export const instanceSchema = z.strictObject({ instanceId: z.uuid() });
const epochSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .pipe(z.string().refine((value) => BigInt(value) <= 9223372036854775807n));
export const controlSchema = instanceSchema.extend({ epoch: epochSchema });
export const controllerSchema = controlSchema.extend({ expiresAt: z.iso.datetime() });
export type Control = z.infer<typeof controlSchema>;
export const transferSchema = instanceSchema.extend({
  expectedEpoch: epochSchema,
});
export const linkChallengeSchema = z.strictObject({
  challenge: z.string().regex(/^[a-f0-9]{64}$/),
  installationId: z.uuid(),
});
export const extensionCredentialSchema = z.strictObject({
  deviceId: z.uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime(),
});
export const challengeResponseSchema = z.strictObject({
  challenge: z.string(),
  expiresAt: z.iso.datetime(),
});
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), epoch: z.string().optional() }),
});
