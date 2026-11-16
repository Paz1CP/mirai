import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Control } from "@mirai/contracts";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { accountControllers, extensionChallenges, linkedExtensions } from "./schema.js";

type Database = ReturnType<typeof createDatabase>["db"];
const leaseDuration = 15_000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export class ControlConflict extends Error {
  constructor(public readonly epoch?: string) {
    super("CONTROL_CONFLICT");
  }
}
export class ControlExpired extends Error {
  constructor() {
    super("CONTROL_EXPIRED");
  }
}

function snapshot(row: typeof accountControllers.$inferSelect) {
  return {
    instanceId: row.instanceId,
    epoch: row.epoch.toString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function createControllerRepository(db: Database) {
  // The row lock serializes every authority change, including first acquisition.
  async function acquire(accountId: string, instanceId: string, expectedEpoch?: string) {
    return db.transaction(async (tx) => {
      await tx
        .insert(accountControllers)
        .values({ accountId, instanceId, expiresAt: new Date(0) })
        .onConflictDoNothing();
      const [current] = await tx
        .select()
        .from(accountControllers)
        .where(eq(accountControllers.accountId, accountId))
        .for("update");
      if (!current) throw new Error("CONTROLLER_MISSING");
      const now = Date.now();
      const live = current.expiresAt.getTime() > now;
      const sameInstance = current.instanceId === instanceId;
      if (live && !sameInstance && expectedEpoch !== current.epoch.toString())
        throw new ControlConflict(current.epoch.toString());
      if (
        expectedEpoch !== undefined &&
        !sameInstance &&
        expectedEpoch !== current.epoch.toString()
      )
        throw new ControlConflict(current.epoch.toString());
      const [updated] = await tx
        .update(accountControllers)
        .set({
          instanceId,
          epoch: live && sameInstance ? current.epoch : current.epoch + 1n,
          expiresAt: new Date(now + leaseDuration),
        })
        .where(eq(accountControllers.accountId, accountId))
        .returning();
      if (!updated) throw new Error("CONTROLLER_MISSING");
      return snapshot(updated);
    });
  }

  async function heartbeat(accountId: string, control: Control) {
    const [row] = await db
      .update(accountControllers)
      .set({ expiresAt: new Date(Date.now() + leaseDuration) })
      .where(
        and(
          eq(accountControllers.accountId, accountId),
          eq(accountControllers.instanceId, control.instanceId),
          eq(accountControllers.epoch, BigInt(control.epoch)),
          gt(accountControllers.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!row) {
      const [current] = await db
        .select()
        .from(accountControllers)
        .where(eq(accountControllers.accountId, accountId));
      if (
        current?.instanceId === control.instanceId &&
        current.epoch.toString() === control.epoch &&
        current.expiresAt.getTime() <= Date.now()
      )
        throw new ControlExpired();
      throw new ControlConflict(current?.epoch.toString());
    }
    return snapshot(row);
  }

  async function release(accountId: string, control: Control) {
    await db
      .update(accountControllers)
      .set({ expiresAt: new Date(0) })
      .where(
        and(
          eq(accountControllers.accountId, accountId),
          eq(accountControllers.instanceId, control.instanceId),
          eq(accountControllers.epoch, BigInt(control.epoch)),
        ),
      );
  }

  async function challenge(accountId: string, control: Control) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(accountControllers)
        .where(eq(accountControllers.accountId, accountId))
        .for("update");
      if (
        !row ||
        row.instanceId !== control.instanceId ||
        row.epoch.toString() !== control.epoch ||
        row.expiresAt.getTime() <= Date.now()
      )
        throw new ControlConflict();
      await tx.delete(extensionChallenges).where(eq(extensionChallenges.accountId, accountId));
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60_000);
      await tx.insert(extensionChallenges).values({
        tokenHash: hash(token),
        accountId,
        instanceId: control.instanceId,
        epoch: row.epoch,
        expiresAt,
      });
      return { challenge: token, expiresAt: expiresAt.toISOString() };
    });
  }

  async function link(challengeToken: string, installationId: string) {
    return db.transaction(async (tx) => {
      const [pending] = await tx
        .select()
        .from(extensionChallenges)
        .where(eq(extensionChallenges.tokenHash, hash(challengeToken)));
      if (!pending) throw new ControlConflict();
      const [controller] = await tx
        .select()
        .from(accountControllers)
        .where(eq(accountControllers.accountId, pending.accountId))
        .for("update");
      if (
        !controller ||
        controller.instanceId !== pending.instanceId ||
        controller.epoch !== pending.epoch ||
        controller.expiresAt.getTime() <= Date.now()
      )
        throw new ControlConflict();
      const [consumed] = await tx
        .delete(extensionChallenges)
        .where(
          and(
            eq(extensionChallenges.tokenHash, hash(challengeToken)),
            gt(extensionChallenges.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!consumed) throw new ControlConflict();
      await tx.delete(linkedExtensions).where(eq(linkedExtensions.accountId, pending.accountId));
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [device] = await tx
        .insert(linkedExtensions)
        .values({
          accountId: pending.accountId,
          instanceId: pending.instanceId,
          epoch: pending.epoch,
          installationId,
          tokenHash: hash(token),
          expiresAt,
        })
        .returning({ id: linkedExtensions.id });
      if (!device) throw new Error("LINK_FAILED");
      return { deviceId: device.id, token, expiresAt: expiresAt.toISOString() };
    });
  }

  async function verifyDevice(deviceId: string, token: string) {
    const [row] = await db
      .select({
        instanceId: accountControllers.instanceId,
        epoch: accountControllers.epoch,
        expiresAt: accountControllers.expiresAt,
      })
      .from(linkedExtensions)
      .innerJoin(
        accountControllers,
        and(
          eq(linkedExtensions.accountId, accountControllers.accountId),
          eq(linkedExtensions.instanceId, accountControllers.instanceId),
          eq(linkedExtensions.epoch, accountControllers.epoch),
        ),
      )
      .where(
        and(
          eq(linkedExtensions.id, deviceId),
          eq(linkedExtensions.tokenHash, hash(token)),
          gt(linkedExtensions.expiresAt, sql`now()`),
          gt(accountControllers.expiresAt, sql`now()`),
        ),
      );
    if (!row) throw new ControlConflict();
    return {
      instanceId: row.instanceId,
      epoch: row.epoch.toString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  return { acquire, heartbeat, release, challenge, link, verifyDevice };
}
