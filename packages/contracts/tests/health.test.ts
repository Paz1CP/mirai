import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "../src/index";

describe("health contract", () => {
  it("accepts the API health response", () => {
    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("rejects an unexpected status", () => {
    expect(healthResponseSchema.safeParse({ status: "error" }).success).toBe(false);
  });
});
