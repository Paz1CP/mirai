import { ProfileError } from "./profileApi";
import { professionalMessages } from "@/shared/i18n/professional";
import type { Locale } from "@/shared/i18n/catalog";
import { billingMessages } from "@/shared/i18n/billing";
export function profileErrorText(error: unknown, locale: Locale) {
  const t = professionalMessages[locale];
  const code =
    typeof error === "string" ? error : error instanceof ProfileError ? error.code : undefined;
  const billingText = billingErrorText(code, locale);
  if (billingText) return billingText;
  return code && code in t.errors ? t.errors[code as keyof typeof t.errors] : t.errorGeneric;
}

export function billingErrorText(code: string | undefined, locale: Locale) {
  const billing = billingMessages[locale];
  if (code === "INSUFFICIENT_CREDITS" || code === "CREDITS_EXPIRED") return billing.empty;
  if (code === "BILLING_USAGE_PENDING") return billing.usagePending;
  if (code === "BILLING_INFERENCES_BUSY") return billing.inferencesBusy;
  if (code === "BILLING_UNAVAILABLE" || code === "BILLING_TARIFF_UNAVAILABLE") return billing.unavailable;
}
