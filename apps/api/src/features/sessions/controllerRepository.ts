import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { and, eq, sql } from "drizzle-orm";
import type { Control } from "@mirai/contracts";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { accountControllers } from "./schema.js";
type Database = ReturnType<typeof createDatabase>["db"];
export class ControlConflict extends Error {
  constructor(public readonly instanceId?: string) {
    super("CONTROL_CONFLICT");
  }
}
export function createControllerRepository(db: Database) {
  // The direct SSE connection owns the presence lock; closing it releases presence, not account data.
  async function connect(
    client: Client,
    accountId: string,
    input: { instanceId?: string; expectedInstanceId?: string },
  ) {
    await client.query("BEGIN");
    try {
      const candidate = randomUUID();
      await client.query(
        "INSERT INTO users.account_controllers(account_id, instance_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [accountId, candidate],
      );
      const result = await client.query<{ instance_id: string }>(
        "SELECT instance_id FROM users.account_controllers WHERE account_id=$1 FOR UPDATE",
        [accountId],
      );
      const current = result.rows[0]!.instance_id;
      if (input.expectedInstanceId && input.expectedInstanceId !== current)
        throw new ControlConflict(current);
      const instanceId =
        !input.expectedInstanceId && (current === candidate || input.instanceId === current)
          ? current
          : candidate;
      if (instanceId !== current) {
        if (!input.expectedInstanceId) {
          const { rows } = await client.query<{ available: boolean }>(
            "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS available", [current],
          );
          if (!rows[0]?.available) throw new ControlConflict(current);
          await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [current]);
        }
        await client.query(
          "UPDATE users.account_controllers SET instance_id=$2 WHERE account_id=$1",
          [accountId, instanceId],
        );
        await client.query("SELECT pg_notify('mirai_control',$1)", [
          JSON.stringify({ accountId, type: "control.transferred", instanceId }),
        ]);
      }
      await client.query("SELECT pg_advisory_lock_shared(hashtextextended($1,0))", [instanceId]);
      await client.query("COMMIT");
      return { instanceId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  async function acquire(accountId: string, instanceId?: string) {
    const candidate = randomUUID();
    await db
      .insert(accountControllers)
      .values({ accountId, instanceId: candidate })
      .onConflictDoNothing();
    const [current] = await db
      .select()
      .from(accountControllers)
      .where(eq(accountControllers.accountId, accountId));
    if (!current || (current.instanceId !== candidate && current.instanceId !== instanceId))
      throw new ControlConflict(current?.instanceId);
    return { instanceId: current.instanceId };
  }
  async function validate(accountId: string, control: Control) {
    const [row] = await db
      .select()
      .from(accountControllers)
      .where(eq(accountControllers.accountId, accountId));
    if (row?.instanceId !== control.instanceId) throw new ControlConflict(row?.instanceId);
    await db.execute(
      sql`select pg_notify('mirai_control', ${JSON.stringify({
        accountId,
        type: "control.refreshed",
        instanceId: control.instanceId,
      })})`,
    );
    return { instanceId: row.instanceId };
  }
  async function validatePresence(accountId: string, instanceId: string) {
    // Inspect the real presence lock without acquiring a probe that other requests could see.
    const result = await db.execute<{ present: boolean }>(sql`
      select exists (
        select 1 from pg_catalog.pg_locks
        where locktype = 'advisory'
          and database = (select oid from pg_catalog.pg_database where datname = current_database())
          and objsubid = 1
          and granted
          and mode in ('ShareLock', 'ExclusiveLock')
          and ((classid::bigint << 32) | objid::bigint) = hashtextextended(${accountControllers.instanceId}::text, 0)
      ) as present
      from ${accountControllers}
      where account_id = ${accountId} and instance_id = ${instanceId}::uuid
    `);
    return result.rows[0]?.present === true;
  }
  async function transfer(accountId: string, expectedInstanceId: string) {
    return db.transaction(async (tx) => {
      const instanceId = randomUUID();
      const [row] = await tx
        .update(accountControllers)
        .set({ instanceId })
        .where(
          and(
            eq(accountControllers.accountId, accountId),
            eq(accountControllers.instanceId, expectedInstanceId),
          ),
        )
        .returning();
      if (!row) {
        const [current] = await tx
          .select()
          .from(accountControllers)
          .where(eq(accountControllers.accountId, accountId));
        throw new ControlConflict(current?.instanceId);
      }
      await tx.execute(
        sql`select pg_notify('mirai_control', ${JSON.stringify({ accountId, type: "control.transferred", instanceId })})`,
      );
      return { instanceId };
    });
  }
  async function release(accountId: string, control: Control) {
    await db.transaction(async (tx) => {
      const rows = await tx
        .delete(accountControllers)
        .where(
          and(
            eq(accountControllers.accountId, accountId),
            eq(accountControllers.instanceId, control.instanceId),
          ),
        )
        .returning();
      if (rows.length)
        await tx.execute(
          sql`select pg_notify('mirai_control', ${JSON.stringify({ accountId, type: "control.revoked", instanceId: null })})`,
        );
    });
  }
  async function browserDisconnected(accountId: string, instanceId: string) {
    await db.execute(sql`select pg_notify('mirai_control', ${JSON.stringify({
      accountId, instanceId, type: "browser.disconnected",
    })})`);
  }
  return { acquire, validate, validatePresence, transfer, release, connect, browserDisconnected };
}
