import { expect, it } from "vitest";
import { controlSchema } from "./session.js";
import { bridgeRequestSchema, decodeBridgeMessage } from "./extension.js";
it("rejects unsupported or stale-shaped commands without coercing authority", () => {
  const control = {
    instanceId: "27d132c7-71ab-4c26-91ac-ddc9cf2a49f6",
    epoch: "9223372036854775807",
  };
  expect(controlSchema.safeParse(control).success).toBe(true);
  for (const epoch of ["0", "-1", "bad", "9223372036854775808", 1])
    expect(controlSchema.safeParse({ ...control, epoch }).success).toBe(false);
  expect(controlSchema.safeParse({ ...control, expiresAt: new Date().toISOString() }).success).toBe(
    false,
  );
  expect(
    bridgeRequestSchema.safeParse({
      channel: "mirai:web",
      version: 2,
      requestId: crypto.randomUUID(),
      type: "status",
      control,
    }).success,
  ).toBe(false);
  expect(decodeBridgeMessage("{")).toBeUndefined();
  expect(decodeBridgeMessage("x".repeat(2049))).toBeUndefined();
  expect(decodeBridgeMessage({ channel: "mirai:web" })).toBeUndefined();
  expect(
    bridgeRequestSchema.safeParse({
      channel: "mirai:web",
      version: 1,
      requestId: crypto.randomUUID(),
      type: "execute",
      control,
    }).success,
  ).toBe(false);
});
