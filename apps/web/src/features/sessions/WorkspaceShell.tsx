"use client";
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Message, Category, Briefcase, DocumentText, User, Warning2 } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";
import { authClient } from "@/shared/auth/client";
import { SessionError } from "./sessionApi";
import { useController } from "./useController";

const navigation = [
  { href: "/", key: "chat", icon: Message },
  { href: "/dashboard", key: "dashboard", icon: Category },
  { href: "/applications", key: "applications", icon: Briefcase },
  { href: "/documents", key: "documents", icon: DocumentText },
  { href: "/profile", key: "profile", icon: User },
] as const;

export function WorkspaceShell({
  accountId,
  name,
  children,
}: {
  accountId: string;
  name: string;
  children: ReactNode;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Workspace accountId={accountId} name={name}>
          {children}
        </Workspace>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function Workspace({
  accountId,
  name,
  children,
}: {
  accountId: string;
  name: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const session = useController(accountId);
  const client = useQueryClient();
  const [cancelled, setCancelled] = useState(false);
  const [extensionDismissed, setExtensionDismissed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const conflict =
    session.failure instanceof SessionError && session.failure.code === "CONTROL_CONFLICT";
  const conflictEpoch = session.failure instanceof SessionError ? session.failure.epoch : undefined;
  const authRequired =
    session.failure instanceof SessionError && session.failure.code === "AUTH_REQUIRED";
  useEffect(() => {
    if (authRequired) {
      client.clear();
      window.location.assign("/auth/sign-in");
    }
  }, [authRequired, client]);
  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await session.release();
      const result = await authClient.signOut();
      if (result.error) throw new Error("SIGN_OUT_FAILED");
      client.clear();
      window.location.assign("/auth/sign-in");
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }
  const currentArea = navigation.find((item) => item.href === pathname) ?? navigation[0];
  return (
    <SidebarProvider style={{ "--sidebar-width": "13.5rem" } as React.CSSProperties}>
      <Sidebar>
        <SidebarHeader className="px-6 py-8">
          <Link href="/" className="flex items-center gap-3 text-2xl font-semibold">
            <Image src="/images/mirai_logo.svg" width={26} height={16} className="h-auto" alt="" />
            mirai
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-4 py-2">
          <nav aria-label={t.navigation}>
            <SidebarMenu>
              {navigation.map(({ href, key, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={pathname === href}
                    render={<Link href={href} />}
                    className="h-11 gap-3 text-sm"
                  >
                    <Icon variant="Linear" aria-hidden="true" />
                    {t[key]}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter className="gap-3 p-4">
          <LanguageSwitch />
          <p className="truncate text-sm text-muted-foreground">{name}</p>
          <Button variant="ghost" disabled={signingOut} onClick={signOut}>
            {t.signOut}
          </Button>
          {signOutError && (
            <p role="alert" className="text-xs text-destructive">
              {t.signOutError}
            </p>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="m-2 min-w-0 rounded-3xl border border-border bg-background">
        <header className="flex h-14 items-center gap-3 border-b border-border px-6">
          <SidebarTrigger />
          <h1 className="text-sm font-medium">{t[currentArea.key]}</h1>
        </header>
        {!session.active && (
          <div role="status" className="p-6 text-sm text-muted-foreground">
            {cancelled
              ? t.cancelled
              : session.failure
                ? conflict
                  ? t.transferred
                  : t.sessionError
                : t.connecting}
            {session.failure && !conflict && (
              <Button
                className="ms-4"
                disabled={session.acquire.isPending}
                onClick={() => session.acquire.mutate(undefined)}
              >
                {t.retry}
              </Button>
            )}
          </div>
        )}
        {session.active && !session.connected && (
          <div className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-3 text-sm">
            <span>{t.disconnected}</span>
            <Button
              size="sm"
              onClick={() => {
                setExtensionDismissed(false);
                session.link.mutate();
              }}
              disabled={session.link.isPending}
            >
              {t.connect}
            </Button>
          </div>
        )}
        {children}
      </SidebarInset>
      <Dialog
        open={conflict && !cancelled}
        onOpenChange={(open) => {
          if (!open) setCancelled(true);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[480px] rounded-2xl border border-border bg-secondary p-6"
        >
          <Warning2 className="size-6 text-warning" aria-hidden="true" />
          <DialogTitle className="text-xl">
            {session.control ? t.transferred : t.secondInstance}
          </DialogTitle>
          <DialogDescription>{t.secondDescription}</DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelled(true)}>
              {t.cancel}
            </Button>
            <Button
              disabled={session.acquire.isPending}
              onClick={() => {
                if (conflictEpoch) session.acquire.mutate(conflictEpoch);
                else session.acquire.mutate(undefined);
              }}
            >
              {t.transfer}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={session.active && !session.connected && !extensionDismissed}
        onOpenChange={(open) => {
          if (!open) setExtensionDismissed(true);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[480px] rounded-2xl border border-border bg-secondary p-6"
        >
          <Warning2 className="size-6 text-warning" aria-hidden="true" />
          <DialogTitle className="text-xl">{t.extensionTitle}</DialogTitle>
          <DialogDescription>{t.extensionDescription}</DialogDescription>
          {session.link.error && (
            <p role="alert" className="text-sm text-destructive">
              {t.connectionError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t.installHelp}</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setExtensionDismissed(true)}>
              {t.later}
            </Button>
            <Button disabled={session.link.isPending} onClick={() => session.link.mutate()}>
              {session.link.isPending ? t.connecting : t.connect}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
