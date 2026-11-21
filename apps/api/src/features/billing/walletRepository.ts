import { and, asc, desc, eq, gt, isNotNull, lte, sql } from "drizzle-orm";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { ledger, topups, wallets, type BillingEnvironment } from "./schema.js";

export const unitsPerUsd = 1_000_000_000_000n;
export const creditLifetimeMs = 30 * 24 * 60 * 60 * 1000;
type Database = ReturnType<typeof createDatabase>["db"];
type Wallet = typeof wallets.$inferInsert;

export class BillingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

export function createWalletRepository(db: Database) {
  const sandboxAccounts = new Set(
    (process.env.BILLING_SANDBOX_ACCOUNT_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  function withWallet<T>(
    accountId: string,
    environment: BillingEnvironment,
    action: (wallet: ReturnType<typeof walletOperations>) => Promise<T>,
  ) {
    if (
      environment === "sandbox" &&
      process.env.NODE_ENV === "production" &&
      !sandboxAccounts.has(accountId)
    )
      throw new BillingError("BILLING_UNAVAILABLE", 503);
    const owner = { accountId, environment };
    return db.transaction(async (tx) => {
      await tx.insert(wallets).values(owner).onConflictDoNothing();
      await tx
        .select()
        .from(wallets)
        .where(and(eq(wallets.accountId, accountId), eq(wallets.environment, environment)))
        .for("update");
      const { rows } = await tx.execute<{ now: string }>(
        sql`select clock_timestamp()::text as now`,
      );
      const wallet = walletOperations(tx, owner, new Date(rows[0]!.now));
      await wallet.expire();
      return action(wallet);
    });
  }

  async function summary(accountId: string, environment: BillingEnvironment) {
    return withWallet(accountId, environment, async (wallet) => {
      const totals = await wallet.totals();
      const lots = await wallet.tx
        .select()
        .from(topups)
        .where(wallet.lotScope)
        .orderBy(desc(topups.createdAt), asc(topups.id))
        .limit(50);
      const movements = await wallet.tx
        .select({
          id: ledger.key,
          kind: ledger.kind,
          amount: ledger.amount,
          at: ledger.at,
        })
        .from(ledger)
        .where(
          and(
            wallet.ledgerScope,
            sql`${ledger.kind} in ('purchase','usage','expiration','refund','chargeback')`,
          ),
        )
        .orderBy(desc(ledger.at), asc(ledger.key))
        .limit(100);
      return {
        environment,
        ...totals,
        available: totals.available.toString(),
        topups: lots.map((lot) => ({
          id: lot.id,
          packageUsd: lot.packageUsd,
          transactionId: lot.transactionId,
          remaining: lot.remaining.toString(),
          createdAt: lot.createdAt.toISOString(),
          purchasedAt: lot.purchasedAt?.toISOString() ?? null,
          expiresAt: lot.expiresAt?.toISOString() ?? null,
          status:
            lot.expiresAt && lot.expiresAt <= wallet.now
              ? ("expired" as const)
              : lot.purchasedAt
                ? ("confirmed" as const)
                : lot.paymentFailedAt
                  ? ("failed" as const)
                  : ("pending" as const),
        })),
        movements: movements.map((movement) => ({
          ...movement,
          amount: movement.amount.toString(),
          at: movement.at.toISOString(),
        })),
      };
    });
  }

  return { withWallet, summary };
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
function walletOperations(tx: Transaction, owner: Wallet, now: Date) {
  const lotScope = and(
    eq(topups.accountId, owner.accountId),
    eq(topups.environment, owner.environment),
  );
  const ledgerScope = and(
    eq(ledger.accountId, owner.accountId),
    eq(ledger.environment, owner.environment),
  );
  const validLots = and(lotScope, gt(topups.expiresAt, now));

  async function movement(
    key: string,
    kind: typeof ledger.$inferInsert.kind,
    amount: bigint,
    details: Record<string, unknown>,
  ) {
    await tx.insert(ledger).values({ ...owner, key, kind, amount, details, at: now });
  }

  async function publish() {
    await tx.execute(sql`select pg_notify('mirai_billing', ${JSON.stringify(owner)})`);
  }

  async function findMovement(key: string) {
    const [entry] = await tx
      .select()
      .from(ledger)
      .where(and(ledgerScope, eq(ledger.key, key)));
    return entry;
  }

  async function expire() {
    const expired = await tx
      .select({ id: topups.id, amount: topups.remaining, expiresAt: topups.expiresAt })
      .from(topups)
      .where(and(lotScope, lte(topups.expiresAt, now), gt(topups.remaining, 0n)));
    if (!expired.length) return;
    await tx
      .update(topups)
      .set({ remaining: 0n })
      .where(and(lotScope, lte(topups.expiresAt, now), gt(topups.remaining, 0n)));
    await tx.insert(ledger).values(
      expired.map((lot) => ({
        ...owner,
        key: `expiration:${lot.id}`,
        kind: "expiration" as const,
        amount: -lot.amount,
        details: { topupId: lot.id },
        at: lot.expiresAt!,
      })),
    );
    await publish();
  }

  async function totals() {
    const [result] = await tx
      .select({
        available: sql<string>`coalesce(sum(${topups.remaining}), 0)`,
        capacity: sql<string>`coalesce(sum(${topups.nominal} - ${topups.revoked}), 0)`,
        nextExpiry: sql<
          string | null
        >`min(${topups.expiresAt}) filter (where ${topups.remaining} > 0)::text`,
      })
      .from(topups)
      .where(validLots);
    const available = BigInt(result!.available);
    const capacity = BigInt(result!.capacity);
    return {
      available,
      percentage: capacity > 0n ? Number((available * 10_000n) / capacity) / 100 : 0,
      nextExpiry: result!.nextExpiry ? new Date(result!.nextExpiry).toISOString() : null,
    };
  }

  async function debit(charge: bigint) {
    const lots = await tx
      .select({ id: topups.id, remaining: topups.remaining })
      .from(topups)
      .where(and(validLots, isNotNull(topups.purchasedAt), gt(topups.remaining, 0n)))
      .orderBy(asc(topups.expiresAt), asc(topups.id));
    let uncollected = charge;
    const allocations: { topupId: string; amount: string }[] = [];
    for (const lot of lots) {
      if (!uncollected) break;
      const amount = uncollected < lot.remaining ? uncollected : lot.remaining;
      await tx
        .update(topups)
        .set({ remaining: lot.remaining - amount })
        .where(and(lotScope, eq(topups.id, lot.id)));
      allocations.push({ topupId: lot.id, amount: amount.toString() });
      uncollected -= amount;
    }
    return { collected: charge - uncollected, allocations };
  }

  return {
    tx,
    owner,
    now,
    lotScope,
    ledgerScope,
    expire,
    movement,
    findMovement,
    totals,
    debit,
    publish,
  };
}
