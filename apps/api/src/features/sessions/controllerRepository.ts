import { randomUUID } from "node:crypto";
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
    return { instanceId: row.instanceId };
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
  return { acquire, validate, transfer, release };
}
