import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../infrastructure/database/client.js";
import { accountControllers } from "./schema.js";
import {
  ControlConflict,
  ControlExpired,
  createControllerRepository,
} from "./controllerRepository.js";

config({ path: "apps/api/.env", quiet: true });

describe.skipIf(process.env.MIRAI_DB_TEST !== "1")("controller authority on PostgreSQL", () => {
  it("serializes contenders, fences transfers, consumes challenges once and isolates accounts", async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required");
    const { db, pool } = createDatabase(url);
    const repository = createControllerRepository(db);
    const account = `test:${randomUUID()}`;
    const otherAccount = `test:${randomUUID()}`;
    try {
      const instances = [randomUUID(), randomUUID()];
      const results = await Promise.allSettled(
        instances.map((id) => repository.acquire(account, id)),
      );
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const winner = results.find((result) => result.status === "fulfilled");
      if (winner?.status !== "fulfilled") throw new Error("No controller acquired");
      const control = winner.value;
      await expect(repository.heartbeat(otherAccount, control)).rejects.toBeInstanceOf(
        ControlConflict,
      );
      const pending = await repository.challenge(account, control);
      const links = await Promise.allSettled([
        repository.link(pending.challenge, randomUUID()),
        repository.link(pending.challenge, randomUUID()),
      ]);
      expect(links.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const linked = links.find((result) => result.status === "fulfilled");
      if (linked?.status !== "fulfilled") throw new Error("No extension linked");
      await expect(
        repository.verifyDevice(linked.value.deviceId, linked.value.token),
      ).resolves.toMatchObject({ epoch: control.epoch });
      const next = await repository.acquire(account, randomUUID(), control.epoch);
      expect(BigInt(next.epoch)).toBe(BigInt(control.epoch) + 1n);
      await expect(repository.heartbeat(account, control)).rejects.toBeInstanceOf(ControlConflict);
      await expect(
        repository.verifyDevice(linked.value.deviceId, linked.value.token),
      ).rejects.toBeInstanceOf(ControlConflict);
      await repository.release(account, control);
      await expect(repository.heartbeat(account, next)).resolves.toMatchObject({
        epoch: next.epoch,
      });
      await repository.release(account, next);
      await expect(repository.heartbeat(account, next)).rejects.toBeInstanceOf(ControlExpired);
      const recovered = await repository.acquire(account, randomUUID());
      expect(BigInt(recovered.epoch)).toBeGreaterThan(BigInt(next.epoch));
    } finally {
      await db.delete(accountControllers).where(eq(accountControllers.accountId, account));
      await pool.end();
    }
  }, 30_000);
});
