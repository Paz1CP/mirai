"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ContextMenu } from "@base-ui/react/context-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Edit2, Trash } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { chatApi, chatHistoryOptions, chatListKey } from "./chatApi";

type Chat = Awaited<ReturnType<typeof chatApi.list>>[number];

export function ChatNavigation({ accountId }: { accountId: string }) {
  const { t } = useI18n();
  const label = t.conversation;
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const key = chatListKey(accountId);
  const [selected, setSelected] = useState<Chat | null>(null);
  const [dialog, setDialog] = useState<"rename" | "remove" | null>(null);
  const [title, setTitle] = useState("");
  const chats = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => chatApi.list(signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const change = useMutation({
    mutationFn: ({ chat, title }: { chat: Chat; title?: string }) =>
      title === undefined ? chatApi.remove(chat.id) : chatApi.rename(chat.id, title),
    onMutate: async ({ chat, title }) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Chat[]>(key, (current) =>
        current?.flatMap((item) =>
          item.id !== chat.id ? [item] : title === undefined ? [] : [{ ...item, title }],
        ),
      );
      if (title === undefined && pathname === `/chat/${chat.id}`) router.replace("/");
      return { chat };
    },
    onError: (_error, variables, context) => {
      if (context)
        client.setQueryData<Chat[]>(key, (current) => {
          if (!current) return [context.chat];
          if (variables.title === undefined)
            return current.some((item) => item.id === context.chat.id)
              ? current
              : [...current, context.chat];
          return current.map((item) => (item.id === context.chat.id ? context.chat : item));
        });
      toast.error(label.changeFailed);
    },
    onSuccess: (_data, { chat, title }) => {
      if (title === undefined) client.removeQueries({ queryKey: ["chat", accountId, chat.id] });
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  if (!chats.data?.length && !selected) return null;
  return (
    <>
      <nav
        className="mt-5 border-t border-sidebar-border pt-4 group-data-[collapsible=icon]:hidden"
        aria-label={label.history}
      >
        <h2 className="mb-2 px-2 text-xs font-medium text-muted-foreground">{label.history}</h2>
        <SidebarMenu>
          {chats.data?.map((chat) => {
            const href = `/chat/${chat.id}`;
            const prefetch = () => {
              if (pathname !== href) {
                void client.prefetchInfiniteQuery(chatHistoryOptions(accountId, chat.id));
              }
            };
            return (
              <SidebarMenuItem key={chat.id}>
                <ContextMenu.Root>
                  <ContextMenu.Trigger render={<div />}>
                    <SidebarMenuButton
                      isActive={pathname === href}
                      aria-current={pathname === href ? "page" : undefined}
                      render={<Link href={href} />}
                      title={chat.title}
                      onPointerEnter={prefetch}
                      onFocus={prefetch}
                    >
                      <span className="truncate">{chat.title}</span>
                    </SidebarMenuButton>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Positioner className="z-50">
                      <ContextMenu.Popup className="min-w-48 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
                        <ContextMenu.Item
                          disabled={change.isPending}
                          onClick={() => {
                            setSelected(chat);
                            setTitle(chat.title);
                            setDialog("rename");
                          }}
                          className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 outline-none data-highlighted:bg-accent data-disabled:opacity-50"
                        >
                          <Edit2 size={18} variant="Linear" />
                          {label.rename}
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          disabled={change.isPending}
                          onClick={() => {
                            setSelected(chat);
                            setDialog("remove");
                          }}
                          className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 outline-none data-highlighted:bg-accent data-disabled:opacity-50"
                        >
                          <Trash size={18} variant="Linear" />
                          {label.remove}
                        </ContextMenu.Item>
                      </ContextMenu.Popup>
                    </ContextMenu.Positioner>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </nav>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setSelected(null);
          }
        }}
      >
        <DialogContent>
          <DialogTitle>{dialog === "rename" ? label.rename : label.remove}</DialogTitle>
          <DialogDescription>
            {dialog === "rename" ? label.renameHint : label.removeDescription}
          </DialogDescription>
          {dialog === "rename" && (
            <Input
              autoFocus
              aria-label={label.rename}
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && title.trim() && selected) {
                  change.mutate({ chat: selected, title: title.trim() });
                  setDialog(null);
                  setSelected(null);
                }
              }}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialog(null);
                setSelected(null);
              }}
            >
              {t.cancel}
            </Button>
            <Button
              variant={dialog === "remove" ? "destructive" : "default"}
              disabled={dialog === "rename" && !title.trim()}
              onClick={() => {
                if (selected)
                  change.mutate({
                    chat: selected,
                    ...(dialog === "rename" ? { title: title.trim() } : {}),
                  });
                setDialog(null);
                setSelected(null);
              }}
            >
              {dialog === "rename" ? label.save : label.remove}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
