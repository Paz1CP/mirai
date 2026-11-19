import type { ProfessionalProfile } from "@mirai/contracts";
import type { Locale } from "@/shared/i18n/catalog";

export async function renderCvPdf(profile: ProfessionalProfile, locale: Locale) {
  const [{ pdf }, { StandardCv, registerStandardCvFonts }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@mirai/cv-renderer"),
  ]);
  registerStandardCvFonts((name) => `/fonts/${name}`);
  return pdf(<StandardCv profile={profile} locale={locale} />).toBlob();
}

export function downloadCvPdf(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
