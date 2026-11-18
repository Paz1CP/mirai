import { ProfileError } from "@/features/profiles/profileApi";
import { profileErrorText } from "@/features/profiles/profileText";
import type { Locale } from "@/shared/i18n/catalog";
import { cvMessages } from "@/shared/i18n/cvs";
import { professionalMessages } from "@/shared/i18n/professional";

export function cvErrorText(error: unknown, locale: Locale) {
  const code = typeof error === "string" ? error : error instanceof ProfileError ? error.code : "";
  const t = cvMessages[locale];
  switch (code) {
    case "CV_CONFLICT":
      return t.conflict;
    case "CV_BUSY":
      return t.busy;
    case "CV_NOT_FOUND":
      return t.notFound;
    case "CV_ID_CONFLICT":
      return t.idConflict;
    case "INVALID_REQUEST":
      return professionalMessages[locale].validation;
    case "INVALID_PROFILE_DATES":
      return professionalMessages[locale].dateValidation;
    default:
      return profileErrorText(error, locale);
  }
}
