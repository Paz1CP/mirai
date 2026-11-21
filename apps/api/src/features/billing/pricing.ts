import { z } from "zod";
import { BillingError } from "./walletRepository.js";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const inferenceUsageSchema = z
  .object({
    input: count,
    cached: count,
    output: count,
    thoughts: count,
    toolInput: count,
    total: count.optional(),
  })
  .refine(({ input, cached }) => cached <= input);
export type InferenceUsage = z.infer<typeof inferenceUsageSchema>;

// Rates in millionths of a dollar per million tokens, also picodollars per token.
// Standard on-demand model rates from https://cloud.google.com/model-garden/pricing.
const rates = {
  "gemini-4-hydrogen": [1_500_000, 75_000, 7_500_000],
  "gemini-3.8-flash": [750_000, 75_000, 3_750_000],
} as const;
const flashChange = new Date("2027-01-01T08:00:00Z");

export function inferenceTariff(model: string, region: string, at: Date) {
  let rate: readonly [number, number, number];
  let version = "vertex-standard-2026-11-21";
  if (model === "gemini-4-hydrogen") rate = rates[model];
  else if (model === "gemini-3.8-flash") {
    if (at >= flashChange) {
      rate = [1_500_000, 150_000, 7_500_000];
      version = "vertex-standard-2027-01-01";
    } else rate = rates[model];
  } else throw new BillingError("BILLING_TARIFF_UNAVAILABLE", 503);
  const factor = region === "global" ? 10 : 11;
  return {
    model,
    region,
    version,
    service: "standard" as const,
    input: (rate[0] * factor) / 10,
    cached: (rate[1] * factor) / 10,
    output: (rate[2] * factor) / 10,
  };
}

export type InferenceTariff = ReturnType<typeof inferenceTariff>;

export function priceInference(tariff: InferenceTariff, usage: InferenceUsage) {
  const googleCost =
    (BigInt(usage.input) - BigInt(usage.cached) + BigInt(usage.toolInput)) * BigInt(tariff.input) +
    BigInt(usage.cached) * BigInt(tariff.cached) +
    (BigInt(usage.output) + BigInt(usage.thoughts)) * BigInt(tariff.output);
  return { googleCost, charge: googleCost * 2n };
}

export function reportedUsage(
  input: number | undefined,
  cached: number | undefined,
  output: number | undefined,
  thoughts: number | undefined,
  toolInput: number | undefined,
  total: number | undefined,
) {
  if (
    output === undefined &&
    (total === undefined ||
      input === undefined ||
      input + (thoughts ?? 0) + (toolInput ?? 0) !== total)
  )
    return;
  return inferenceUsageSchema.safeParse({
    input,
    cached: cached ?? 0,
    output: output ?? 0,
    thoughts: thoughts ?? 0,
    toolInput: toolInput ?? 0,
    total,
  }).data;
}
