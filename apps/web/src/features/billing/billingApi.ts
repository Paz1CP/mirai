import { billingCheckoutSchema, billingSummarySchema, type BillingPackage } from "@mirai/contracts";
import { queryOptions } from "@tanstack/react-query";
import { request } from "@/features/profiles/profileApi";

export function billingOptions(accountId: string) {
  return queryOptions({
    queryKey: ["billing", accountId] as const,
    queryFn: async ({ signal }) =>
      billingSummarySchema.parse(await request("billing", "GET", undefined, signal)),
  });
}

export async function createCheckout(packageUsd: BillingPackage) {
  return billingCheckoutSchema.parse(await request("billing/checkout", "POST", { packageUsd }));
}
