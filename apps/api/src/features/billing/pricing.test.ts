import { expect, it } from "vitest";
import { inferenceTariff, priceInference, reportedUsage } from "./pricing.js";

it("prices cached input and reasoning once with exact picodollar arithmetic", () => {
  const rate = inferenceTariff("gemini-4-hydrogen", "global", new Date("2026-11-21Z"));
  const usage = reportedUsage(4, 1, 1, 2, 0, 7)!;
  expect(priceInference(rate, usage)).toEqual({ googleCost: 27_075_000n, charge: 54_150_000n });
});

it("retains fractions of a cent and switches Flash rates at their effective date", () => {
  const before = inferenceTariff("gemini-3.8-flash", "us-east4", new Date("2027-01-01T07:59:59Z"));
  const after = inferenceTariff("gemini-3.8-flash", "us-east4", new Date("2027-01-01T08:00:00Z"));
  const usage = reportedUsage(1, 1, 0, 0, 0, 1)!;
  expect(priceInference(before, usage).charge).toBe(165_000n);
  expect(priceInference(after, usage).charge).toBe(330_000n);
});

it("keeps incomplete or inconsistent provider usage unresolved", () => {
  expect(reportedUsage(undefined, undefined, 1, 0, 0, 1)).toBeUndefined();
  expect(reportedUsage(1, 2, 1, 0, 0, 2)).toBeUndefined();
  expect(reportedUsage(1, 0, undefined, undefined, 0, 2)).toBeUndefined();
});
