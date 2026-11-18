"use client";
import { useRouter } from "next/navigation";
import { Global } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";
import { useI18n } from "./I18nProvider";
export function LanguageSwitch() {
  const { locale, t } = useI18n();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      aria-label={t.language}
      className="group-data-[collapsible=icon]:px-0"
      onClick={() => {
        document.cookie = `mirai-locale=${locale === "es" ? "en" : "es"}; Path=/; Max-Age=31536000; SameSite=Lax`;
        router.refresh();
      }}
    >
      <Global className="hidden group-data-[collapsible=icon]:block" aria-hidden="true" />
      <span className="group-data-[collapsible=icon]:hidden">
        {locale === "es" ? "English" : "Español"}
      </span>
    </Button>
  );
}
