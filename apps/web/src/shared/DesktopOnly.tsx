"use client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "./i18n/I18nProvider";
import { LanguageSwitch } from "./i18n/LanguageSwitch";
export function DesktopOnly() {
  const { t } = useI18n();
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>{t.desktopOnlyTitle}</DialogTitle>
        <DialogDescription>{t.desktopOnlyDescription}</DialogDescription>
        <LanguageSwitch />
      </DialogContent>
    </Dialog>
  );
}
