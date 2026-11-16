import { expect, it } from "vitest";
import { controlSchema, transferSchema } from "./session.js";
import { bridgeRequestSchema } from "./extension.js";
it("rejects obsolete authority and device-link messages", () => {
  const control = { instanceId: crypto.randomUUID() };
  expect(controlSchema.safeParse(control).success).toBe(true);
  expect(controlSchema.safeParse({ ...control, epoch: "1" }).success).toBe(false);
  expect(transferSchema.safeParse({ expectedInstanceId: control.instanceId }).success).toBe(true);
  expect(
    bridgeRequestSchema.safeParse({
      channel: "mirai:web",
      version: 1,
      requestId: crypto.randomUUID(),
      type: "link",
      control,
      challenge: "a".repeat(64),
    }).success,
  ).toBe(false);
});
