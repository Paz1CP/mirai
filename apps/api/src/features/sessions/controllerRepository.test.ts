import express from "express";
import { Client } from "pg";
import { createSessionRoutes } from "./routes.js";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../infrastructure/database/client.js";
import { accountControllers } from "./schema.js";
import { ControlConflict, createControllerRepository } from "./controllerRepository.js";
config({ path: "apps/api/.env", quiet: true });
describe.skipIf(process.env.MIRAI_DB_TEST !== "1")("persistent controller authority", () => {
  it("opens directly after the previous window closes but requires transfer while connected", async () => {
    const { db, pool } = createDatabase(process.env.DATABASE_URL!);
    const repository = createControllerRepository(db);
    const account = `test:${randomUUID()}`;
    const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT;
    const first = new Client({ connectionString: url });
    const second = new Client({ connectionString: url });
    try {
      await first.connect();
      await second.connect();
      const original = await repository.connect(first, account, {});
      await expect(repository.connect(second, account, {})).rejects.toBeInstanceOf(ControlConflict);
      await first.end();
      const reopened = await repository.connect(second, account, {});
      expect(reopened.instanceId).not.toBe(original.instanceId);
      await expect(repository.validate(account, original)).rejects.toBeInstanceOf(ControlConflict);
      const third = new Client({ connectionString: url });
      try {
        await third.connect();
        await expect(repository.connect(third, account, {})).rejects.toBeInstanceOf(
          ControlConflict,
        );
        const transferred = await repository.connect(third, account, {
          expectedInstanceId: reopened.instanceId,
        });
        expect(transferred.instanceId).not.toBe(reopened.instanceId);
        await expect(repository.validate(account, reopened)).rejects.toBeInstanceOf(
          ControlConflict,
        );
      } finally {
        await third.end();
      }
    } finally {
      await first.end().catch(() => {});
      await second.end();
      await db.delete(accountControllers).where(eq(accountControllers.accountId, account));
      await pool.end();
    }
  }, 30000);
  it("serializes acquisition and rotates authority on every transfer", async () => {
    const { db, pool } = createDatabase(process.env.DATABASE_URL!);
    const repository = createControllerRepository(db);
    const account = `test:${randomUUID()}`;
    try {
      const contenders = await Promise.allSettled([
        repository.acquire(account),
        repository.acquire(account),
      ]);
      expect(contenders.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const winner = contenders.find((result) => result.status === "fulfilled");
      if (winner?.status !== "fulfilled") throw new Error("No winner");
      const a = winner.value;
      await expect(repository.acquire(account, a.instanceId)).resolves.toEqual(a);
      await expect(repository.validate("other-account", a)).rejects.toBeInstanceOf(ControlConflict);
      const app = express();
      app.use(express.json());
      app.use(createSessionRoutes(repository, async () => account));
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No address");
      const abort = new AbortController();
      try {
        const response = await fetch(`http://127.0.0.1:${address.port}/session/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(a),
          signal: abort.signal,
        });
        expect(response.status).toBe(200);
        const reader = response.body!.getReader();
        const ready = await reader.read();
        expect(new TextDecoder().decode(ready.value)).toContain("control.ready");
        const transferred = await repository.transfer(account, a.instanceId);
        const notification = await reader.read();
        const frame = new TextDecoder().decode(notification.value);
        expect(frame).toContain("control.transferred");
        expect(frame).toContain(transferred.instanceId);
        await reader.cancel();
        await expect(repository.validate(account, a)).rejects.toBeInstanceOf(ControlConflict);
        await repository.release(account, transferred);
      } finally {
        abort.abort();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      const reset = await repository.acquire(account);
      const transfers = await Promise.allSettled([
        repository.transfer(account, reset.instanceId),
        repository.transfer(account, reset.instanceId),
      ]);
      expect(transfers.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const next = transfers.find((result) => result.status === "fulfilled");
      if (next?.status !== "fulfilled") throw new Error("No transfer");
      expect(next.value.instanceId).not.toBe(a.instanceId);
      await expect(repository.validate(account, a)).rejects.toBeInstanceOf(ControlConflict);
      await repository.release(account, a);
      await expect(repository.validate(account, next.value)).resolves.toEqual(next.value);
      const back = await repository.transfer(account, next.value.instanceId);
      expect(back.instanceId).not.toBe(a.instanceId);
      await repository.release(account, back);
      await expect(repository.validate(account, back)).rejects.toBeInstanceOf(ControlConflict);
    } finally {
      await db.delete(accountControllers).where(eq(accountControllers.accountId, account));
      await pool.end();
    }
  }, 30000);
});
