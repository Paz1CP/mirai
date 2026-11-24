import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import express from "express";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import type { ManagedChats } from "../agents/managedChats.js";
import type { createDocumentStorage } from "../profiles/documentStorage.js";
import { createAccountDeletion } from "./accountDeletion.js";
import {
  accountOpen,
  accountRequestSignal,
  fenceAccountRequests,
  withAccountOperation,
} from "./accountFence.js";

const database = process.env.MIRAI_ACCOUNT_ERASURE_TEST_DATABASE_URL;

it.skipIf(!database)(
  "authenticates, fences, retries, and erases only the requested account",
  async () => {
    expect(new URL(database!).hostname).toBe("127.0.0.1");
    const pool = new Pool({ connectionString: database });
    const account = randomUUID();
    const untouched = randomUUID();
    const token = randomUUID();
    const oldToken = randomUUID();
    const worker = randomUUID();
    const removeAccount = vi
      .fn()
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockResolvedValue(undefined);
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    const list = vi
      .fn()
      .mockResolvedValueOnce([{ id: "synthetic" }])
      .mockResolvedValue([]);
    const app = express();
    const verify = async (header?: string) => (header === "Bearer fixture" ? account : null);
    let startInference!: () => void;
    const inferenceStarted = new Promise<void>((resolve) => {
      startInference = resolve;
    });
    app.post("/extract", fenceAccountRequests(pool, verify), async (_req, res) => {
      const signal = await accountRequestSignal(res);
      startInference();
      if (!signal.aborted) await once(signal, "abort");
      res.status(409).json({ aborted: true });
    });
    app.use(
      express.json(),
      createAccountDeletion(
        pool,
        verify,
        { removeAccount } as unknown as ReturnType<typeof createDocumentStorage>,
        {
          list,
          remove: deleteSession,
          owned: async () => ({ events: [] }),
          project: "synthetic-project",
          modelRegion: "global",
        } as unknown as ManagedChats,
        worker,
      ),
    );
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const migrationsFolder = resolve(import.meta.dirname, "../../../database/migrations");
      // The adoption migration expects Neon to already have the profile enum types.
      await pool.query("create schema users");
      await pool.query(
        await readFile(resolve(migrationsFolder, "0004_pale_blue_marvel.sql"), "utf8"),
      );
      await migrate(drizzle(pool), {
        migrationsFolder,
      });
      await pool.query(`create schema neon_auth;
      create table neon_auth."user" (id text primary key, email text);
      create table neon_auth.session (
        token text primary key, "userId" text references neon_auth."user" on delete cascade,
        "impersonatedBy" text, "createdAt" timestamptz, "expiresAt" timestamptz
      );
      create table neon_auth.account (id text primary key, "userId" text references neon_auth."user" on delete cascade);
      create table neon_auth.verification (identifier text);`);
      await pool.query('insert into neon_auth."user" values ($1, $1), ($2, $2)', [
        account,
        untouched,
      ]);
      await pool.query("insert into neon_auth.account values ($1, $1), ($2, $2)", [
        account,
        untouched,
      ]);
      await pool.query(
        "insert into neon_auth.session values ($1, $3, null, now(), now()+interval '1 hour'), ($2, $3, null, now()-interval '1 hour', now()+interval '1 hour')",
        [token, oldToken, account],
      );
      await pool.query(
        "insert into billing.wallets (account_id, environment) values ($1, 'sandbox'), ($2, 'sandbox')",
        [account, untouched],
      );
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Invalid test server address");
      const base = `http://127.0.0.1:${address.port}`;
      const start = (sessionToken: string) =>
        fetch(base, {
          method: "POST",
          headers: { authorization: "Bearer fixture", "content-type": "application/json" },
          body: JSON.stringify({ sessionToken, confirmation: "ELIMINAR", confirmed: true }),
        });
      const run = () =>
        fetch(`${base}/worker`, { method: "POST", headers: { authorization: `Bearer ${worker}` } });
      let receipt: string;
      const read = async () =>
        (await fetch(base, { headers: { authorization: `DeletionReceipt ${receipt}` } })).json();

      expect((await start(oldToken)).status).toBe(403);
      const inference = fetch(`${base}/extract`, {
        method: "POST",
        headers: { authorization: "Bearer fixture" },
      });
      await inferenceStarted;
      let release!: () => void;
      let entered!: () => void;
      const admitted = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const draining = withAccountOperation(pool, account, () => {
        entered();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      await admitted;
      try {
        const accepted = await start(token);
        expect(accepted.status).toBe(202);
        ({ receipt } = await accepted.json());
        expect(typeof receipt).toBe("string");
        expect(await (await inference).json()).toEqual({ aborted: true });
        expect(await accountOpen(pool, account)).toBe(false);
        expect(await accountOpen(pool, untouched)).toBe(true);
        expect((await run()).status).toBe(204);
        expect(removeAccount).not.toHaveBeenCalled();
      } finally {
        release();
        await draining;
      }
      await run();
      expect(await read()).toEqual({ status: "pending" });
      expect(deleteSession).toHaveBeenCalledWith(account, "synthetic");
      expect(
        (
          await fetch(base, {
            headers: {
              authorization: `DeletionReceipt ${receipt.replace(/^./, receipt.startsWith("a") ? "b" : "a")}`,
            },
          })
        ).status,
      ).toBe(401);
      await pool.query(
        "update users.account_deletions set next_attempt_at = now() where account_id = $1",
        [account],
      );
      await run();
      expect(removeAccount).toHaveBeenCalledTimes(2);
      expect(await read()).toEqual({ status: "complete" });
      expect((await fetch(base, { headers: { authorization: "Bearer fixture" } })).status).toBe(
        401,
      );
      expect((await pool.query("select account_id from billing.wallets")).rows).toEqual([
        { account_id: untouched },
      ]);
      expect((await pool.query("select * from neon_auth.session")).rowCount).toBe(0);
      expect((await pool.query("select id from neon_auth.account")).rows).toEqual([
        { id: untouched },
      ]);
      expect(await accountOpen(pool, account)).toBe(false);
    } finally {
      server.close();
      server.closeAllConnections();
      await pool.end();
    }
  },
);
