import { z } from "zod";

export const billingEnvironmentSchema = z.enum(["sandbox", "live"]);
export const billingPackages = [10, 25, 50, 100] as const;
export const billingPackageSchema = z.literal(billingPackages);
export const paddleTransactionIdSchema = z.string().regex(/^txn_[a-z0-9]{26}$/);
export const billingCheckoutSchema = z.object({
  environment: billingEnvironmentSchema,
  transactionId: paddleTransactionIdSchema,
  clientToken: z.string().min(1),
});
export const billingSummarySchema = z.object({
  environment: billingEnvironmentSchema,
  available: z.string().regex(/^\d+$/),
  nextExpiry: z.iso.datetime().nullable(),
  topups: z.array(
    z.object({
      id: z.uuid(),
      packageUsd: billingPackageSchema,
      transactionId: paddleTransactionIdSchema.nullable(),
      remaining: z.string().regex(/^\d+$/),
      createdAt: z.iso.datetime(),
      purchasedAt: z.iso.datetime().nullable(),
      expiresAt: z.iso.datetime().nullable(),
      status: z.enum(["confirmed", "expired", "failed", "pending"]),
    }),
  ),
  movements: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["purchase", "usage", "expiration", "refund", "chargeback"]),
      amount: z.string().regex(/^-?\d+$/),
      at: z.iso.datetime(),
    }),
  ),
});

export type BillingPackage = z.infer<typeof billingPackageSchema>;
