import { z } from "zod";
export const instanceSchema = z.strictObject({ instanceId: z.uuid().optional() });
export const controlSchema = z.strictObject({ instanceId: z.uuid() });
export const controllerSchema = controlSchema;
export type Control = z.infer<typeof controlSchema>;
export const transferSchema = z.strictObject({ expectedInstanceId: z.uuid() });
export const connectSchema = z.union([
  instanceSchema.extend({ expectedInstanceId: z.uuid().optional() }),
  z.strictObject({ readResultsOnly: z.literal(true) }),
]);
export type ConnectRequest = z.input<typeof connectSchema>;
export const controlEventSchema = z.strictObject({
  type: z.enum(["control.ready", "control.transferred", "control.revoked", "control.refresh"]),
  instanceId: z.uuid().nullable(),
});
export type ControlEvent = z.infer<typeof controlEventSchema>;
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), instanceId: z.uuid().optional() }),
});
