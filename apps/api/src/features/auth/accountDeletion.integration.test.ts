import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import express from "express";
import { Client, Pool } from "pg";
import { expect, it, vi } from "vitest";
import { createInferenceBilling } from "../billing/inferenceBilling.js";
import { createWalletRepository } from "../billing/walletRepository.js";
import type { ManagedChats } from "../agents/managedChats.js";
import { createAccountDeletion } from "./accountDeletion.js";
import { createAccountActivity, hasActiveSession } from "./accountActivity.js";

const { removeInteraction } = vi.hoisted(() => ({ removeInteraction: vi.fn() }));
vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    interactions = { delete: removeInteraction };
  },
}));

const database = process.env.MIRAI_ACCOUNT_ERASURE_TEST_DATABASE_URL;

it.skipIf(!database)(
  "revokes activity and immediately erases the requested account despite unconfirmed external deletions",
  async () => {
    expect(new URL(database!).hostname).toBe("127.0.0.1");
    const pool = new Pool({ connectionString: database });
    const account = randomUUID();
    const untouched = randomUUID();
    const token = randomUUID();
    const oldToken = randomUUID();
    let storageStarted!: () => void;
    const deletingStorage = new Promise<void>((resolve) => {
      storageStarted = resolve;
    });
    let failStorage!: (reason: Error) => void;
    const storageResult = new Promise<void>((_, reject) => {
      failStorage = reject;
    });
    const removeAccount = vi.fn(() => {
      storageStarted();
      return storageResult;
    });
    const deleteSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("Session provider unavailable"))
      .mockResolvedValueOnce(undefined);
    const chats = {
      list: vi.fn().mockResolvedValue([{ id: "first" }, { id: "second" }]),
      owned: vi.fn().mockResolvedValue({ events: [{ interactionId: "identified" }] }),
      service: { deleteSession },
      forgetExecution: vi.fn(),
      appName: "fixture",
      project: "fixture",
      modelRegion: "global",
    } as unknown as ManagedChats;
    removeInteraction.mockResolvedValue(undefined);
    const app = express();
    const activity = createAccountActivity(database!);
    const verify = async (header?: string) => {
      const id =
        header === "Bearer fixture" ? account : header === "Bearer other" ? untouched : null;
      return id && (await hasActiveSession(pool, id)) ? id : null;
    };
    app.use(
      "/v1/account/deletion",
      express.json(),
      createAccountDeletion(pool, database!, verify, { removeAccount }, chats),
    );
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const workspace = new Client({ connectionString: database });
    try {
      const migrationsFolder = resolve(import.meta.dirname, "../../../database/migrations");
      // The adoption migration expects Neon to already have the profile enum types.
      await pool.query("create schema users");
      await pool.query(
        await readFile(resolve(migrationsFolder, "0004_pale_blue_marvel.sql"), "utf8"),
      );
      await migrate(drizzle(pool), { migrationsFolder });
      expect(
        (await pool.query("select to_regclass('users.account_deletions') as worker")).rows,
      ).toEqual([{ worker: null }]);
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
        `insert into neon_auth.session values
        ($1, $3, null, now(), now()+interval '1 hour'),
        ($2, $3, null, now()-interval '1 hour', now()+interval '1 hour'),
        ('other', $4, null, now(), now()+interval '1 hour')`,
        [token, oldToken, account, untouched],
      );
      await pool.query(
        "insert into billing.wallets (account_id, environment) values ($1, 'sandbox'), ($2, 'sandbox')",
        [account, untouched],
      );
      await pool.query(
        `insert into billing.ledger (account_id, environment, movement_key, kind, amount, details)
         values ($1, 'sandbox', 'unknown-id', 'inference_pending', 0, '{"operation":"chat"}')`,
        [account],
      );
      const billing = createInferenceBilling(createWalletRepository(drizzle(pool)), "sandbox");
      const oldInference = await billing.recover(account, "unknown-id");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Invalid test server address");
      const base = `http://127.0.0.1:${address.port}/v1/account/deletion`;
      const start = (sessionToken: string, authorization = "Bearer fixture") =>
        fetch(base, {
          method: "POST",
          headers: { authorization, "content-type": "application/json" },
          body: JSON.stringify({ sessionToken, confirmation: "ELIMINAR", confirmed: true }),
        });

      expect((await start(oldToken)).status).toBe(403);
      expect((await fetch(`${base}/worker`, { method: "POST" })).status).toBe(404);

      const instanceId = randomUUID();
      await workspace.connect();
      await workspace.query("LISTEN mirai_account_deletion");
      await workspace.query("select pg_advisory_lock(hashtextextended($1, 0))", [instanceId]);
      await pool.query(
        "insert into users.account_controllers (account_id, instance_id) values ($1, $2)",
        [account, instanceId],
      );
      const closingWorkspace = once(workspace, "notification");

      let active!: () => void;
      const started = new Promise<void>((resolve) => {
        active = resolve;
      });
      const stopping = vi.fn();
      const inFlight = activity(account, async (signal) => {
        active();
        await once(signal, "abort");
        stopping();
      });
      await started;
      const confirmed = start(token);
      await closingWorkspace;
      expect(removeAccount).not.toHaveBeenCalled();
      await workspace.end();
      await deletingStorage;
      expect(stopping).toHaveBeenCalledOnce();
      await inFlight;
      expect(await hasActiveSession(pool, account)).toBe(false);
      expect(await hasActiveSession(pool, untouched)).toBe(true);
      expect((await start(token)).status).toBe(401);
      const late = vi.fn();
      await expect(activity(account, late)).resolves.toBeUndefined();
      expect(late).not.toHaveBeenCalled();

      failStorage(new Error("Storage unavailable"));
      const response = await confirmed;
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "complete",
        unconfirmed: expect.arrayContaining(["interactions", "sessions", "storage"]),
      });
      expect(removeAccount).toHaveBeenCalledOnce();
      expect(deleteSession).toHaveBeenCalledTimes(2);
      expect(removeInteraction).toHaveBeenCalledExactlyOnceWith(
        "identified",
        undefined,
        expect.anything(),
      );
      await expect(billing.releaseRejected(account, oldInference, 499)).rejects.toMatchObject({
        code: "BILLING_USAGE_PENDING",
      });
      await expect(
        billing.settle(account, oldInference, {
          input: 1,
          cached: 0,
          output: 1,
          thoughts: 0,
          toolInput: 0,
        }),
      ).rejects.toMatchObject({ code: "BILLING_USAGE_PENDING" });
      expect((await pool.query("select account_id from billing.wallets")).rows).toEqual([
        { account_id: untouched },
      ]);
      expect((await pool.query("select * from billing.ledger")).rowCount).toBe(0);
      expect((await pool.query('select "userId" from neon_auth.session')).rows).toEqual([
        { userId: untouched },
      ]);
      expect((await pool.query('select id from neon_auth."user"')).rows).toEqual([
        { id: untouched },
      ]);
      expect((await pool.query("select id from neon_auth.account")).rows).toEqual([
        { id: untouched },
      ]);
      expect(await hasActiveSession(pool, account)).toBe(false);

      await pool.query('update neon_auth.session set "expiresAt" = now() where token = $1', [
        "other",
      ]);
      await expect(activity(untouched, async () => true)).resolves.toBeUndefined();
      await expect(activity(untouched, async () => true, { requireSession: false })).resolves.toBe(
        true,
      );
      await pool.query(
        `update neon_auth.session set "expiresAt" = now() + interval '1 hour' where token = $1`,
        ["other"],
      );
      vi.mocked(chats.list).mockResolvedValueOnce([]);
      removeAccount.mockResolvedValueOnce(undefined);
      const success = await start("other", "Bearer other");
      expect(success.status).toBe(200);
      expect(await success.json()).toEqual({ status: "complete", unconfirmed: [] });
    } finally {
      server.close();
      server.closeAllConnections();
      await workspace.end().catch(() => {});
      await pool.end();
    }
  },
  15_000,
);
