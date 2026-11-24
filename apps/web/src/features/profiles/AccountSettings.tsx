"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { accountDeletionResultSchema } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { billingOptions } from "@/features/billing/billingApi";
import { authClient, clearAccessToken } from "@/shared/auth/client";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { ProfileError, request } from "./profileApi";

const sessionProof = z.object({ session: z.object({ token: z.string().min(1) }) });
const unitsPerUsd = 1_000_000_000_000n;

function browserPermission() {
  return typeof Notification === "undefined" ? "unavailable" : Notification.permission;
}

function subscribePermission(update: () => void) {
  window.addEventListener("focus", update);
  window.addEventListener("mirai:notification-permission", update);
  return () => {
    window.removeEventListener("focus", update);
    window.removeEventListener("mirai:notification-permission", update);
  };
}

export function AccountSettings({ accountId }: { accountId: string }) {
  const { t, locale } = useI18n();
  const copy = t.accountSettings;
  const client = useQueryClient();
  const permission = useSyncExternalStore(
    subscribePermission,
    browserPermission,
    () => "unavailable",
  );
  const [notificationError, setNotificationError] = useState(false);
  const [step, setStep] = useState<1 | 2>();
  const [typed, setTyped] = useState("");
  const [authFailed, setAuthFailed] = useState(false);
  const balance = useQuery({
    ...billingOptions(accountId),
    enabled: step === 1,
    retry: false,
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { data } = await authClient.getSession({ query: { disableCookieCache: true } });
      const proof = sessionProof.safeParse(data);
      if (!proof.success) throw new ProfileError("RECENT_AUTH_REQUIRED");
      return accountDeletionResultSchema.parse(
        await request("account/deletion", "POST", {
          confirmation: typed.trim(),
          confirmed: true,
          sessionToken: proof.data.session.token,
        }),
      );
    },
    onSuccess: clearAccessToken,
  });
  const result = remove.data;
  async function leave() {
    try {
      await authClient.signOut();
    } catch {
      // The server already revoked the session.
    } finally {
      client.clear();
      window.location.replace("/");
    }
  }
  const rawBalance = balance.isSuccess ? BigInt(balance.data.available) : undefined;
  const amount =
    rawBalance === undefined || rawBalance === 0n
      ? undefined
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(
          `${rawBalance / unitsPerUsd}.${String(rawBalance % unitsPerUsd).padStart(12, "0")}` as `${number}`,
        );
  const recentAuthRequired =
    remove.error instanceof ProfileError && remove.error.code === "RECENT_AUTH_REQUIRED";

  async function allowNotifications() {
    setNotificationError(false);
    try {
      await Notification.requestPermission();
      window.dispatchEvent(new Event("mirai:notification-permission"));
    } catch {
      setNotificationError(true);
    }
  }

  async function authenticateAgain() {
    setAuthFailed(false);
    try {
      const signOut = await authClient.signOut();
      if (signOut.error) throw signOut.error;
      clearAccessToken();
      const signIn = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${location.origin}/profile?tab=settings`,
        errorCallbackURL: `${location.origin}/auth/sign-in?error=oauth`,
      });
      if (signIn.error) throw signIn.error;
    } catch {
      setAuthFailed(true);
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-semibold">{copy.notifications}</h2>
        <p className="text-sm text-muted-foreground">{copy.notificationsDescription}</p>
        {permission === "default" ? (
          <Button size="sm" variant="secondary" onClick={() => void allowNotifications()}>
            {copy.allowNotifications}
          </Button>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {permission === "granted"
              ? copy.notificationsGranted
              : permission === "denied"
                ? copy.notificationsDenied
                : copy.notificationsUnavailable}
          </p>
        )}
        {notificationError && (
          <p role="alert" className="text-sm text-destructive">
            {copy.notificationsError}
          </p>
        )}
      </section>
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-semibold">{copy.deleteAccount}</h2>
        <p className="text-sm text-muted-foreground">{copy.deleteDescription}</p>
        {!result && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              remove.reset();
              setTyped("");
              setStep(1);
            }}
          >
            {copy.reviewDeletion}
          </Button>
        )}
      </section>
      <Dialog
        open={!!step || Boolean(result)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending && !result) setStep(undefined);
        }}
      >
        <DialogContent
          showCloseButton={!result && !remove.isPending}
          className="max-h-[85svh] overflow-y-auto sm:max-w-lg"
        >
          {!result && (
            <p className="text-xs text-muted-foreground">
              {step === 1 ? copy.firstStep : copy.secondStep}
            </p>
          )}
          <DialogTitle>{result ? copy.deletionComplete : copy.deleteAccount}</DialogTitle>
          <DialogDescription>
            {result
              ? result.unconfirmed.length
                ? copy.deletionUnconfirmed
                : copy.deletionCompleteDescription
              : remove.isPending
                ? copy.deletionPending
                : step === 1
                  ? copy.permanent
                  : copy.finalDescription}
          </DialogDescription>
          {result && (
            <>
              {result.unconfirmed.length > 0 && (
                <ul className="list-disc space-y-1 ps-5 text-sm">
                  {result.unconfirmed.map((resource) => (
                    <li key={resource}>{copy.unconfirmedResources[resource]}</li>
                  ))}
                </ul>
              )}
              <DialogFooter>
                <Button onClick={() => void leave()}>{copy.continue}</Button>
              </DialogFooter>
            </>
          )}
          {!result && step === 1 && (
            <>
              <ul className="list-disc space-y-1 ps-5 text-sm">
                {copy.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="text-sm">{copy.consequences}</p>
              {amount && <p className="text-sm font-medium">{copy.balance(amount)}</p>}
              {balance.isPending && (
                <p role="status" className="text-sm text-muted-foreground">
                  {copy.balanceLoading}
                </p>
              )}
              {balance.isError && (
                <p role="alert" className="text-sm text-muted-foreground">
                  {copy.balanceUnavailable}
                </p>
              )}
              <label className="grid gap-2 text-sm">
                {copy.typeConfirmation}
                <Input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </>
          )}
          {!result && step === 2 && (remove.isError || authFailed) && (
            <p role="alert" className="text-sm text-destructive">
              {recentAuthRequired
                ? copy.recentAuthRequired
                : remove.error instanceof ProfileError &&
                    remove.error.code === "ACCOUNT_DELETION_UNAVAILABLE"
                  ? copy.deletionUnavailable
                  : copy.deletionError}
            </p>
          )}
          {!result && (
            <DialogFooter>
              <Button
                variant="outline"
                disabled={remove.isPending}
                onClick={() => setStep(undefined)}
              >
                {t.cancel}
              </Button>
              {step === 1 ? (
                <Button disabled={typed.trim() !== copy.confirmation} onClick={() => setStep(2)}>
                  {copy.continue}
                </Button>
              ) : recentAuthRequired ? (
                <Button onClick={() => void authenticateAgain()}>{copy.authenticateAgain}</Button>
              ) : (
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? copy.deletionStarting : copy.deleteAccount}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
