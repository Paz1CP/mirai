import { createHmac, timingSafeEqual } from "node:crypto";
import { paddleTransactionIdSchema, type BillingPackage } from "@mirai/contracts";
import { z } from "zod";
import type { BillingEnvironment } from "./schema.js";
import { BillingError } from "./walletRepository.js";

const paddleObjectId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-z0-9]{26}$`));
export const paddleEventSchema = z.object({
  event_id: paddleObjectId("evt"),
  event_type: z.string(),
  occurred_at: z.iso.datetime({ offset: true }),
  data: z.unknown(),
});
const minorUnits = z.string().regex(/^\d{1,20}$/);
export const transactionSchema = z.object({
  id: paddleTransactionIdSchema,
  status: z.string(),
  custom_data: z.object({ mirai_credit_purchase: z.uuid() }).nullish(),
  collection_mode: z.literal("automatic"),
  currency_code: z.string().length(3),
  items: z.array(
    z.object({
      quantity: z.number().int().positive(),
      price: z.object({
        id: paddleObjectId("pri"),
        product_id: paddleObjectId("pro"),
        billing_cycle: z.null(),
      }),
    }),
  ),
  payments: z.array(
    z.object({
      status: z.string(),
      captured_at: z.iso.datetime({ offset: true }).nullable(),
      amount: minorUnits,
    }),
  ),
  details: z.object({
    totals: z.object({
      currency_code: z.string().length(3),
      grand_total: minorUnits,
      discount: minorUnits,
      tax: minorUnits,
      fee: minorUnits.nullish(),
    }),
  }),
});
export const adjustmentSchema = z.object({
  id: paddleObjectId("adj"),
  transaction_id: paddleTransactionIdSchema,
  action: z.string(),
  status: z.string(),
  type: z.enum(["full", "partial"]).nullable(),
  currency_code: z.string().length(3),
  totals: z.object({ total: minorUnits }),
});

export function verifyPaddleSignature(
  raw: Buffer,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  const parts = new URLSearchParams(signature.replaceAll(";", "&"));
  const [ts] = parts.getAll("ts");
  if (
    !ts ||
    !/^\d{1,12}$/.test(ts) ||
    parts.getAll("ts").length !== 1 ||
    Math.abs(Math.floor(now / 1000) - Number(ts)) > 5
  )
    return false;
  const expected = createHmac("sha256", secret).update(`${ts}:`).update(raw).digest();
  return parts
    .getAll("h1")
    .some(
      (value) =>
        /^[a-f0-9]{64}$/i.test(value) && timingSafeEqual(expected, Buffer.from(value, "hex")),
    );
}

export function paddleConfiguration(environment: BillingEnvironment) {
  const prefix = `PADDLE_${environment.toUpperCase()}_`;
  const env = (name: string) => process.env[prefix + name]?.trim();
  const base = environment === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const apiKey = env("API_KEY");
  const clientToken = env("CLIENT_TOKEN");
  const productId = env("PRODUCT_ID");
  const webhookSecret = env("WEBHOOK_SECRET");
  const other = environment === "live" ? "SANDBOX" : "LIVE";
  if (webhookSecret && webhookSecret === process.env[`PADDLE_${other}_WEBHOOK_SECRET`]?.trim())
    throw new BillingError("BILLING_UNAVAILABLE", 503);

  async function createTransaction(priceId: string, intentId: string) {
    if (!apiKey) throw new BillingError("BILLING_UNAVAILABLE", 503);
    const response = await fetch(`${base}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        collection_mode: "automatic",
        custom_data: { mirai_credit_purchase: intentId },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.warn({ event: "paddle_checkout_rejected", environment, status: response.status });
      throw new BillingError("BILLING_UNAVAILABLE", 503);
    }
    return z
      .object({ data: z.object({ id: paddleTransactionIdSchema }) })
      .parse(await response.json()).data.id;
  }

  function checkout(packageUsd: BillingPackage) {
    const priceId = env(`PRICE_${packageUsd}`);
    if (
      !clientToken?.startsWith(environment === "sandbox" ? "test_" : "live_") ||
      !productId ||
      !priceId ||
      !webhookSecret ||
      !apiKey
    )
      throw new BillingError("BILLING_UNAVAILABLE", 503);
    return { priceId, productId, clientToken };
  }
  async function cancelPending(transactionId: string, signal: AbortSignal) {
    if (!apiKey) throw new BillingError("BILLING_UNAVAILABLE", 503);
    const url = `${base}/transactions/${paddleTransactionIdSchema.parse(transactionId)}`;
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Paddle-Version": "1" };
    const response = await fetch(url, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) });
    if (!response.ok) throw new BillingError("BILLING_UNAVAILABLE", 503);
    const { data } = z.object({
      data: z.object({ status: z.string(), collection_mode: z.enum(["automatic", "manual"]) }),
    }).parse(await response.json());
    if (["paid", "completed", "canceled"].includes(data.status)) return;
    // Paddle does not allow cancellation of past-due automatic transactions.
    if (data.status === "past_due" && data.collection_mode === "automatic")
      throw new BillingError("BILLING_UNAVAILABLE", 503);
    const cancellation = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "canceled" }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    });
    if (!cancellation.ok) throw new BillingError("BILLING_UNAVAILABLE", 503);
    const canceled = z.object({ data: z.object({ status: z.literal("canceled") }) }).safeParse(
      await cancellation.json(),
    );
    if (!canceled.success) throw new BillingError("BILLING_UNAVAILABLE", 503);
  }

  async function findUnlinkedTransactions(intents: { id: string; created_at: Date }[], signal: AbortSignal) {
    if (!intents.length) return [];
    if (!apiKey) throw new BillingError("BILLING_UNAVAILABLE", 503);
    const ids = new Set(intents.map(({ id }) => id));
    const earliest = Math.min(...intents.map(({ created_at }) => created_at.getTime()));
    const first = new URL(`${base}/transactions`);
    first.searchParams.set("created_at[GTE]", new Date(earliest - 60_000).toISOString());
    let next: URL | undefined = first;
    const matches: string[] = [];
    while (next) {
      if (next.origin !== first.origin || next.pathname !== first.pathname)
        throw new BillingError("BILLING_UNAVAILABLE", 503);
      const response = await fetch(next, {
        headers: { Authorization: `Bearer ${apiKey}`, "Paddle-Version": "1" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      });
      if (!response.ok) throw new BillingError("BILLING_UNAVAILABLE", 503);
      const page = z.object({
        data: z.array(z.object({
          id: paddleTransactionIdSchema,
          custom_data: z.object({ mirai_credit_purchase: z.string().optional() }).nullish(),
        })),
        meta: z.object({ pagination: z.object({ has_more: z.boolean(), next: z.string().nullish() }) }),
      }).parse(await response.json());
      for (const transaction of page.data) {
        const intent = transaction.custom_data?.mirai_credit_purchase;
        if (intent && ids.has(intent)) matches.push(transaction.id);
      }
      const { pagination } = page.meta;
      if (pagination.has_more && !pagination.next) throw new BillingError("BILLING_UNAVAILABLE", 503);
      next = pagination.has_more ? new URL(pagination.next!, first) : undefined;
    }
    return matches;
  }

  return { webhookSecret, createTransaction, checkout, cancelPending, findUnlinkedTransactions };
}
