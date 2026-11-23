"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "./I18nProvider";
export function LanguageSwitch() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const nextLocale = locale === "es" ? "en" : "es";
  const nextLanguage = nextLocale === "en" ? "English" : "Español";
  return (
    <Button
      variant="ghost"
      aria-label={`${t.language}: ${nextLanguage}`}
      className="group-data-[collapsible=icon]:px-0"
      onClick={() => {
        document.cookie = `mirai-locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
        router.refresh();
      }}
    >
      <Image
        src={nextLocale === "en" ? "/images/flag-us.png" : "/images/flag-es.png"}
        alt=""
        width={18}
        height={12}
        className="h-3 w-[18px] rounded-xs object-cover"
      />
      <span lang={nextLocale} className="group-data-[collapsible=icon]:hidden">{nextLanguage}</span>
    </Button>
  );
}
