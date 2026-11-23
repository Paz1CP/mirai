import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { BillingPackage } from "@mirai/contracts";
import type { createDatabase } from "../../infrastructure/database/client.js";
import {
  adjustmentSchema,
  paddleConfiguration,
  transactionSchema,
  type paddleEventSchema,
} from "./paddleClient.js";
import { ledger, topups, type BillingEnvironment } from "./schema.js";
import {
  BillingError,
  creditLifetimeMs,
  unitsPerUsd,
  type createWalletRepository,
} from "./walletRepository.js";

type Database = ReturnType<typeof createDatabase>["db"];
type WalletRepository = ReturnType<typeof createWalletRepository>;
type PaddleEvent = z.infer<typeof paddleEventSchema>;
type Wallet = Parameters<Parameters<WalletRepository["withWallet"]>[2]>[0];
type Adjustment = z.infer<typeof adjustmentSchema>;

export function createPaddleBilling(db: Database, wallets: WalletRepository) {
  async function checkout(
    accountId: string,
    environment: BillingEnvironment,
    packageUsd: BillingPackage,
  ) {
    const paddle = paddleConfiguration(environment);
    const { priceId, productId, clientToken } = paddle.checkout(packageUsd);
    const intentId = await wallets.withWallet(accountId, environment, async (wallet) => {
      const [intent] = await wallet.tx
        .insert(topups)
        .values({
          ...wallet.owner,
          packageUsd,
          nominal: BigInt(packageUsd) * unitsPerUsd,
          priceId,
          productId,
        })
        .returning({ id: topups.id });
      return intent!.id;
    });
    const transactionId = await paddle.createTransaction(priceId, intentId);
    await wallets.withWallet(accountId, environment, async (wallet) => {
      const linked = await wallet.tx
        .update(topups)
        .set({ transactionId })
        .where(and(wallet.lotScope, eq(topups.id, intentId), isNull(topups.transactionId)))
        .returning({ id: topups.id });
      if (!linked.length) throw new BillingError("PAYMENT_NOT_CONFIRMED", 409);
    });
    return { environment, clientToken, transactionId };
  }

  async function processTransaction(environment: BillingEnvironment, event: PaddleEvent) {
    const reference = z
      .object({ custom_data: z.object({ mirai_credit_purchase: z.uuid() }).nullish() })
      .safeParse(event.data).data?.custom_data?.mirai_credit_purchase;
    if (!reference) return;
    const payment = transactionSchema.parse(event.data);
    const [intent] = await db
      .select()
      .from(topups)
      .where(and(eq(topups.environment, environment), eq(topups.id, reference)));
    if (!intent) return;
    const [item] = payment.items;
    if (
      payment.items.length !== 1 ||
      item?.quantity !== 1 ||
      item.price.id !== intent.priceId ||
      item.price.product_id !== intent.productId
    )
      throw new BillingError("INVALID_BILLING_PACKAGE", 422);

    await wallets.withWallet(intent.accountId, environment, async (wallet) => {
      const [lot] = await wallet.tx
        .select()
        .from(topups)
        .where(and(wallet.lotScope, eq(topups.id, reference)));
      if (!lot?.transactionId) throw new BillingError("PAYMENT_NOT_CONFIRMED", 503);
      if (lot.transactionId !== payment.id) throw new BillingError("PAYMENT_NOT_CONFIRMED", 422);
      const eventKey = `paddle:${event.event_id}`;
      if (await wallet.findMovement(eventKey)) return;
      const details = { topupId: lot.id, transactionId: payment.id, occurredAt: event.occurred_at };
      if (event.event_type === "transaction.payment_failed") {
        const failedAt = new Date(event.occurred_at);
        if (!lot.purchasedAt && (!lot.paymentFailedAt || failedAt > lot.paymentFailedAt)) {
          await wallet.tx
            .update(topups)
            .set({ paymentFailedAt: failedAt })
            .where(and(wallet.lotScope, eq(topups.id, lot.id)));
        }
      } else if (!lot.purchasedAt) {
        const totals = payment.details.totals;
        const captured = payment.payments.filter(
          (entry) => entry.status === "captured" && entry.captured_at,
        );
        const paidAmount = captured.reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
        const confirmation = captured
          .map((entry) => entry.captured_at!)
          .sort()
          .at(-1);
        if (
          payment.status !== "completed" ||
          !confirmation ||
          paidAmount <= 0n ||
          BigInt(totals.discount) !== 0n ||
          paidAmount !== BigInt(totals.grand_total) ||
          totals.currency_code !== payment.currency_code
        )
          throw new BillingError("PAYMENT_NOT_CONFIRMED", 422);
        const purchasedAt = new Date(confirmation);
        const expiresAt = new Date(purchasedAt.getTime() + creditLifetimeMs);
        await wallet.tx
          .update(topups)
          .set({ purchasedAt, expiresAt, remaining: lot.nominal })
          .where(and(wallet.lotScope, eq(topups.id, lot.id)));
        await wallet.movement(`purchase:${payment.id}`, "purchase", lot.nominal, {
          ...details,
          purchasedAt: purchasedAt.toISOString(),
          ...totals,
        });
        await wallet.expire();
        const earlierAdjustments = await wallet.tx
          .select({ details: ledger.details })
          .from(ledger)
          .where(
            and(
              wallet.ledgerScope,
              eq(ledger.kind, "event"),
              sql`${ledger.details}->>'transactionId' = ${payment.id} and ${ledger.details} ? 'adjustment'`,
            ),
          )
          .orderBy(sql`${ledger.details}->>'occurredAt'`, ledger.key);
        for (const record of earlierAdjustments) {
          const adjustment = adjustmentSchema.parse(record.details.adjustment);
          await applyAdjustment(wallet, adjustment);
        }
      }
      await wallet.movement(eventKey, "event", 0n, { ...details, eventType: event.event_type });
      wallet.markChanged();
    });
  }

  async function applyAdjustment(wallet: Wallet, adjustment: Adjustment) {
    if (
      adjustment.status !== "approved" ||
      (adjustment.action !== "refund" && adjustment.action !== "chargeback")
    )
      return;
    const adjustmentKey = `adjustment:${adjustment.id}`;
    if (await wallet.findMovement(adjustmentKey)) return;
    const purchase = await wallet.findMovement(`purchase:${adjustment.transaction_id}`);
    if (!purchase) return;
    const [lot] = await wallet.tx
      .select()
      .from(topups)
      .where(and(wallet.lotScope, eq(topups.transactionId, adjustment.transaction_id)));
    if (!lot?.purchasedAt) throw new BillingError("PAYMENT_NOT_CONFIRMED", 503);
    const checkout = z
      .object({ currency_code: z.string(), grand_total: z.string().regex(/^\d+$/) })
      .parse(purchase.details);
    if (checkout.currency_code !== adjustment.currency_code)
      throw new BillingError("INVALID_PAYMENT_ADJUSTMENT", 422);
    const total = BigInt(checkout.grand_total);
    const adjusted = BigInt(adjustment.totals.total);
    const intended =
      adjustment.type === "full" || adjusted >= total
        ? lot.nominal
        : (lot.nominal * adjusted) / total;
    const revocable = lot.nominal - lot.revoked;
    const revoked = intended < revocable ? intended : revocable;
    const recovered = revoked < lot.remaining ? revoked : lot.remaining;
    await wallet.tx
      .update(topups)
      .set({ remaining: lot.remaining - recovered, revoked: lot.revoked + revoked })
      .where(and(wallet.lotScope, eq(topups.id, lot.id)));
    await wallet.movement(adjustmentKey, adjustment.action, -recovered, {
      adjustment,
      topupId: lot.id,
      intended: intended.toString(),
      revoked: revoked.toString(),
      originalTotal: total.toString(),
    });
    return recovered;
  }

  async function processAdjustment(environment: BillingEnvironment, event: PaddleEvent) {
    const adjustment = adjustmentSchema.parse(event.data);
    const [intent] = await db
      .select({ accountId: topups.accountId })
      .from(topups)
      .where(
        and(
          eq(topups.environment, environment),
          eq(topups.transactionId, adjustment.transaction_id),
        ),
      );
    if (!intent) return;
    await wallets.withWallet(intent.accountId, environment, async (wallet) => {
      const eventKey = `paddle:${event.event_id}`;
      if (await wallet.findMovement(eventKey)) return;
      const details = {
        adjustment,
        transactionId: adjustment.transaction_id,
        occurredAt: event.occurred_at,
      };
      const recovered = await applyAdjustment(wallet, adjustment);
      await wallet.movement(eventKey, "event", 0n, { ...details, eventType: event.event_type });
      wallet.markChanged((recovered ?? 0n) > 0n);
    });
  }

  async function webhook(environment: BillingEnvironment, event: PaddleEvent) {
    if (
      event.event_type === "transaction.completed" ||
      event.event_type === "transaction.payment_failed"
    )
      await processTransaction(environment, event);
    if (event.event_type === "adjustment.created" || event.event_type === "adjustment.updated")
      await processAdjustment(environment, event);
  }

  return { checkout, webhook };
}
