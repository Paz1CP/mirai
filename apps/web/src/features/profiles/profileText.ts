import { ProfileError } from "./profileApi";
import { professionalMessages } from "@/shared/i18n/professional";
import type { Locale } from "@/shared/i18n/catalog";
export function profileErrorText(error: unknown, locale: Locale) {
  const t = professionalMessages[locale];
  const code =
    typeof error === "string" ? error : error instanceof ProfileError ? error.code : undefined;
  return code && code in t.errors ? t.errors[code as keyof typeof t.errors] : t.errorGeneric;
}
