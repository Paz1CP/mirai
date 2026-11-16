"use client";
import { useState } from "react";
import Image from "next/image";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WorkspacePreview } from "./WorkspacePreview";
import { authClient } from "@/shared/auth/client";
import { messages, type Locale } from "@/shared/i18n/catalog";

export function SignIn({ locale, callbackError }: { locale: Locale; callbackError: boolean }) {
  const t = messages[locale];
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(callbackError);
  async function signIn() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
        errorCallbackURL: `${window.location.origin}/auth/sign-in?error=oauth`,
      });
      if (result.error) throw new Error("SIGN_IN_FAILED");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return (
    <main>
      <WorkspacePreview />
      <div className="fixed end-8 top-8 z-[60]">
        <LanguageSwitch />
      </div>
      <Dialog open modal={false}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-background/75 backdrop-blur-[2px]"
          className="flex flex-col items-center gap-6 rounded-[32px] border border-border bg-card p-8 text-center sm:max-w-[420px]"
        >
          <Image
            src="/images/mirai_logo.svg"
            width={150}
            height={90}
            className="h-auto"
            alt=""
            priority
          />
          <DialogTitle className="text-[26px] font-semibold leading-[34px]">
            {t.signInTitle}
          </DialogTitle>
          <DialogDescription>{t.signInDescription}</DialogDescription>
          <Button
            onClick={signIn}
            disabled={pending}
            className="h-11 w-full rounded-2xl bg-foreground text-background hover:bg-foreground/90"
          >
            <Image src="/images/google.svg" width={16} height={16} alt="" />
            {pending ? t.signingIn : t.signIn}
          </Button>
          {failed && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {t.signInError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t.signInFootnote}</p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
