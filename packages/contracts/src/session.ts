import { z } from "zod";
export const instanceSchema = z.strictObject({ instanceId: z.uuid().optional() });
export const controlSchema = z.strictObject({ instanceId: z.uuid() });
export const controllerSchema = controlSchema;
export type Control = z.infer<typeof controlSchema>;
export const transferSchema = z.strictObject({ expectedInstanceId: z.uuid() });
export const controlEventSchema = z.strictObject({
  type: z.enum(["control.ready", "control.transferred", "control.revoked"]),
  instanceId: z.uuid().nullable(),
});
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), instanceId: z.uuid().optional() }),
});
