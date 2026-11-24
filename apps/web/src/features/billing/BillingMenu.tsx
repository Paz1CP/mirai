"use client";

import { useEffect, useState } from "react";
import { billingPackages, type BillingPackage } from "@mirai/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Flash } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { billingOptions, createCheckout } from "./billingApi";
import { openPaddleCheckout } from "./paddleCheckout";

const unitsPerCredit = 10_000_000_000n;

export function BillingMenu({ accountId }: { accountId: string }) {
  const { t, locale } = useI18n();
  const billing = t.billing;
  const [open, setOpen] = useState(false);
  const [checkoutId, setCheckoutId] = useState<string>();
  const [checkoutState, setCheckoutState] = useState<"awaiting" | "failed">();
  const [expiredSnapshot, setExpiredSnapshot] = useState<number>();
  const credits = useQuery(billingOptions(accountId));
  const { data, dataUpdatedAt, refetch } = credits;
  const expiry = data?.nextExpiry;
  useEffect(() => {
    if (!expiry) return;
    let timeout: ReturnType<typeof setTimeout>;
    function renew() {
      const remaining = Date.parse(expiry!) - Date.now();
      if (remaining > 0) timeout = setTimeout(renew, Math.min(remaining, 2_147_483_647));
      else {
        setExpiredSnapshot(dataUpdatedAt);
        void refetch();
      }
    }
    timeout = setTimeout(
      renew,
      Math.max(0, Math.min(2_147_483_647, Date.parse(expiry) - Date.now())),
    );
    return () => clearTimeout(timeout);
  }, [expiry, dataUpdatedAt, refetch]);
  const checkout = useMutation({
    mutationFn: async (packageUsd: BillingPackage) => {
      const transaction = await createCheckout(packageUsd);
      setCheckoutId(transaction.transactionId);
      setCheckoutState(undefined);
      setOpen(false);
      await openPaddleCheckout(transaction, locale, (event) => {
        if (event.data?.transaction_id !== transaction.transactionId) return;
        if (event.name === "checkout.completed") {
          setCheckoutState("awaiting");
          void refetch();
        } else if (event.name === "checkout.payment.failed") {
          setCheckoutState("failed");
        } else if (event.name === "checkout.closed") {
          setOpen(true);
          void refetch();
        }
      });
      void refetch();
    },
    onError: () => {
      setCheckoutState(undefined);
      setOpen(true);
    },
  });
  const available = data && expiredSnapshot !== dataUpdatedAt ? BigInt(data.available) : undefined;
  const lowBalance = available !== undefined && available < 200n * unitsPerCredit;
  const balanceLabel = lowBalance && available !== 0n ? billing.low : billing.available;
  const creditCount = new Intl.NumberFormat(locale, { useGrouping: "always" });
  const balance =
    available === undefined
      ? undefined
      : new Intl.NumberFormat("en-US").format(available / unitsPerCredit);
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
  });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const checkoutLot = data?.topups.find((lot) => lot.transactionId === checkoutId);
  const visibleTopups = data?.topups.filter((topup) => topup.status !== "pending");
  const paymentStatus =
    checkoutLot?.status === "confirmed"
      ? billing.confirmed
      : checkoutState === "awaiting"
        ? billing.awaiting
        : checkoutLot?.status === "failed" || checkoutState === "failed"
          ? billing.failed
          : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="min-h-9 w-full"
            aria-label={
              balance === undefined ? billing.title : `${billing.title}. ${balanceLabel} ${balance}`
            }
          />
        }
      >
        <Flash variant="Bold" aria-hidden="true" className={lowBalance ? "text-warning" : "text-primary"} />
        {balance !== undefined && (
          <span className="font-semibold tabular-nums group-data-[collapsible=icon]:hidden">{balance}</span>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{billing.title}</DialogTitle>
          <DialogDescription>{billing.description}</DialogDescription>
        </DialogHeader>
        {data?.environment === "sandbox" && (
          <p className="text-xs text-muted-foreground">{billing.sandbox}</p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {billingPackages.map((pack) => (
            <Button
              key={pack}
              variant="outline"
              className="h-auto flex-col gap-0.5 px-2 py-2"
              disabled={checkout.isPending || !data}
              onClick={() => checkout.mutate(pack)}
            >
              <span>{amount.format(pack)}</span>
              <span className="text-xs text-muted-foreground">
                +{creditCount.format(pack * 100)} {billing.unit}
              </span>
            </Button>
          ))}
        </div>
        {checkout.isPending && (
          <p role="status" className="text-sm">
            {billing.opening}
          </p>
        )}
        {paymentStatus && (
          <p role="status" className="text-sm">
            {paymentStatus}
          </p>
        )}
        {(checkout.isError || credits.isError) && (
          <p role="alert" className="text-sm text-destructive">
            {billing.unavailable}
          </p>
        )}
        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-medium">{billing.lots}</h3>
          {visibleTopups?.length === 0 && (
            <p className="text-sm text-muted-foreground">{billing.noLots}</p>
          )}
          <ul className="space-y-2 text-sm">
            {visibleTopups?.map((topup) => {
              const expires = topup.expiresAt ? new Date(topup.expiresAt) : undefined;
              return (
                <li key={topup.id} className="flex justify-between gap-4">
                  <span>{amount.format(topup.packageUsd)}</span>
                  <span className="text-right text-muted-foreground">
                    {expires
                      ? `${topup.status === "expired" ? billing.expired : billing.expiry} ${date.format(expires)}`
                      : topup.status === "failed" ? billing.failed : billing.confirmed}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
