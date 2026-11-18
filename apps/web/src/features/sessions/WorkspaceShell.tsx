"use client";
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Message,
  Category,
  Briefcase,
  DocumentText,
  User,
  Warning2,
  Logout,
} from "iconsax-reactjs";
import { toast } from "sonner";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";
import { authClient } from "@/shared/auth/client";
import { SessionError } from "./sessionApi";
import { useController } from "./useController";
import { ProfileProvider } from "@/features/profiles/ProfileProvider";

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
  const [signingOut, setSigningOut] = useState(false);
  const { mutate: acquireControl } = session.acquire;
  const conflict =
    session.failure instanceof SessionError && session.failure.code === "CONTROL_CONFLICT";
  const conflictInstanceId =
    session.failure instanceof SessionError ? session.failure.instanceId : undefined;
  const authRequired =
    session.failure instanceof SessionError && session.failure.code === "AUTH_REQUIRED";
  useEffect(() => {
    if (authRequired) {
      client.clear();
      window.location.assign("/auth/sign-in");
    }
  }, [authRequired, client]);
  const connectionFailed = !session.active && !!session.failure && !conflict && !authRequired;
  const transferCancelled = conflict && cancelled;
  useEffect(() => {
    if (!connectionFailed && !transferCancelled) return;
    const id = transferCancelled
      ? toast.warning(t.cancelled, {
          action: { label: t.retry, onClick: () => setCancelled(false) },
        })
      : toast.error(t.sessionError, {
          action: { label: t.retry, onClick: () => acquireControl(undefined) },
        });
    return () => {
      toast.dismiss(id);
    };
  }, [connectionFailed, transferCancelled, acquireControl, t.cancelled, t.sessionError, t.retry]);
  async function signOut() {
    setSigningOut(true);
    try {
      await session.release();
      const result = await authClient.signOut();
      if (result.error) throw new Error("SIGN_OUT_FAILED");
      client.clear();
      window.location.assign("/auth/sign-in");
    } catch {
      toast.error(t.signOutError);
      setSigningOut(false);
    }
  }
  const currentArea = navigation.find((item) => item.href === pathname) ?? navigation[0];
  const logo = (
    <Image src="/images/mirai_logo.svg" width={26} height={16} className="h-auto shrink-0" alt="" />
  );
  return (
    <SidebarProvider
      className="h-svh"
      style={
        { "--sidebar-width": "13.5rem", "--sidebar-width-icon": "3.5rem" } as React.CSSProperties
      }
    >
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-4 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarTrigger className="h-10 w-fit gap-2 px-0 text-xl font-semibold hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent" />
              }
            >
              {logo}
              <span className="group-data-[collapsible=icon]:hidden">mirai</span>
            </TooltipTrigger>
          
          </Tooltip>
        </SidebarHeader>
        <SidebarContent className="px-4 py-2 group-data-[collapsible=icon]:px-2">
          <nav aria-label={t.navigation}>
            <SidebarMenu>
              {navigation.map(({ href, key, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={pathname === href}
                    aria-current={pathname === href ? "page" : undefined}
                    aria-label={t[key]}
                    tooltip={t[key]}
                    render={<Link href={href} />}
                    className="h-11 gap-3 text-sm group-data-[collapsible=icon]:mx-auto"
                  >
                    <Icon variant="Linear" aria-hidden="true" />
                    <span className="group-data-[collapsible=icon]:hidden">{t[key]}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter className="gap-3 p-4 group-data-[collapsible=icon]:px-2">
          <LanguageSwitch />
          <p className="truncate text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
            {name}
          </p>
          <Button
            variant="ghost"
            aria-label={t.signOut}
            className="group-data-[collapsible=icon]:px-0"
            disabled={signingOut}
            onClick={signOut}
          >
            <Logout className="hidden group-data-[collapsible=icon]:block" aria-hidden="true" />
            <span className="group-data-[collapsible=icon]:hidden">{t.signOut}</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarTrigger className="fixed bottom-4 start-4 z-20 size-10 border-border bg-sidebar md:hidden">
        {logo}
      </SidebarTrigger>
      <SidebarInset className="m-2 min-h-0 min-w-0 overflow-y-auto rounded-3xl border border-border bg-background">
        <h1 className="sr-only">{t[currentArea.key]}</h1>
        <ProfileProvider accountId={accountId} available={session.active && session.connected}>
          {children}
        </ProfileProvider>
      </SidebarInset>
      <Dialog open={session.active && !session.connected && !session.checkingExtension}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-background/75 backdrop-blur-[2px]"
          className="flex flex-col items-center gap-6 rounded-[32px] border border-border bg-card p-8 text-center sm:max-w-[420px]"
        >
          <Image src="/images/mirai_logo.svg" width={150} height={90} className="h-auto" alt="" />
          <DialogTitle className="text-[26px] font-semibold leading-[34px]">
            {t.extensionTitle}
          </DialogTitle>
          <DialogDescription>{t.extensionDescription}</DialogDescription>
          <Button
            className="h-11 w-full rounded-2xl bg-foreground text-background hover:bg-foreground/90"
            onClick={() => session.detect.mutate()}
            disabled={session.detect.isPending}
          >
            {session.detect.isPending ? t.connecting : t.retry}
          </Button>
          <p className="text-xs text-muted-foreground">{t.extensionDetectionHelp}</p>
        </DialogContent>
      </Dialog>
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
                if (conflictInstanceId) session.acquire.mutate(conflictInstanceId);
                else session.acquire.mutate(undefined);
              }}
            >
              {t.transfer}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
