import { z } from "zod";

const accountDeletionResourceSchema = z.enum([
  "activity",
  "sessions",
  "interactions",
  "storage",
  "paddle",
]);

export type AccountDeletionResource = z.infer<typeof accountDeletionResourceSchema>;
export const accountDeletionResultSchema = z.object({
  status: z.literal("complete"),
  unconfirmed: z.array(accountDeletionResourceSchema),
});
