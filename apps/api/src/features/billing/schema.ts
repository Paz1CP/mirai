import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const billing = pgSchema("billing");
export type BillingEnvironment = "sandbox" | "live";
const accountId = () => text("account_id").notNull();
const environment = () => text("environment").$type<BillingEnvironment>().notNull();
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => bigint(name, { mode: "bigint" });

export const wallets = billing.table(
  "wallets",
  { accountId: accountId(), environment: environment() },
  (t) => [
    primaryKey({ columns: [t.accountId, t.environment] }),
    check("wallet_environment", sql`${t.environment} in ('sandbox', 'live')`),
  ],
);

export const topups = billing.table(
  "topups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: accountId(),
    environment: environment(),
    transactionId: text("transaction_id"),
    packageUsd: integer("package_usd").notNull(),
    priceId: text("price_id").notNull(),
    productId: text("product_id").notNull(),
    nominal: money("nominal").notNull(),
    remaining: money("remaining")
      .notNull()
      .default(sql`0`),
    revoked: money("revoked")
      .notNull()
      .default(sql`0`),
    purchasedAt: instant("purchased_at"),
    expiresAt: instant("expires_at"),
    paymentFailedAt: instant("payment_failed_at"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.environment],
      foreignColumns: [wallets.accountId, wallets.environment],
    }),
    unique().on(t.environment, t.transactionId),
    index("topups_spend_order").on(t.accountId, t.environment, t.expiresAt, t.id),
    check(
      "topup_amount",
      sql`${t.packageUsd} in (10,25,50,100)
      and ${t.nominal} = ${t.packageUsd}::bigint * 1000000000000
      and ${t.remaining} >= 0 and ${t.revoked} >= 0
      and ${t.remaining} + ${t.revoked} <= ${t.nominal}`,
    ),
    check(
      "topup_expiry",
      sql`(${t.purchasedAt} is null and ${t.expiresAt} is null and ${t.remaining} = 0)
      or (${t.transactionId} is not null and ${t.purchasedAt} is not null and ${t.expiresAt} is not null
      and ${t.expiresAt} = ${t.purchasedAt} + interval '720 hours')`,
    ),
  ],
);

export const ledger = billing.table(
  "ledger",
  {
    accountId: accountId(),
    environment: environment(),
    key: text("movement_key").notNull(),
    kind: text("kind")
      .$type<
        | "purchase"
        | "usage"
        | "expiration"
        | "refund"
        | "chargeback"
        | "event"
        | "inference_pending"
        | "inference_released"
      >()
      .notNull(),
    amount: money("amount").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    at: instant("at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.environment, t.key] }),
    foreignKey({
      columns: [t.accountId, t.environment],
      foreignColumns: [wallets.accountId, wallets.environment],
    }),
    index("ledger_history").on(t.accountId, t.environment, t.at.desc(), t.key),
    index("ledger_pending")
      .on(t.accountId, t.environment)
      .where(sql`${t.kind} = 'inference_pending'`),
    check(
      "ledger_amount",
      sql`
      (${t.kind} = 'purchase' and ${t.amount} > 0)
      or (${t.kind} in ('usage','expiration','refund','chargeback') and ${t.amount} <= 0)
      or (${t.kind} in ('event','inference_pending','inference_released') and ${t.amount} = 0)
    `,
    ),
  ],
);
