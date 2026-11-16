"use client";
import { createContext, useContext, type ReactNode } from "react";
import { messages, type Locale } from "./catalog";
const LocaleContext = createContext<Locale>("es");
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useI18n() {
  const locale = useContext(LocaleContext);
  return { locale, t: messages[locale] };
}
