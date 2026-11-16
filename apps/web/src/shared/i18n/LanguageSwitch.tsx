"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "./I18nProvider";
export function LanguageSwitch() {
  const { locale, t } = useI18n();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      aria-label={t.language}
      onClick={() => {
        document.cookie = `mirai-locale=${locale === "es" ? "en" : "es"}; Path=/; Max-Age=31536000; SameSite=Lax`;
        router.refresh();
      }}
    >
      {locale === "es" ? "English" : "Español"}
    </Button>
  );
}
