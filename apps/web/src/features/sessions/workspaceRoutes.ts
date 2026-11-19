import { chatIdSchema } from "@mirai/contracts";

export const workspaceAreas = ["dashboard", "applications", "documents", "profile"] as const;

export function workspaceRoute(pathname: string) {
  if (pathname === "/") return { area: "chat" } as const;
  const area = workspaceAreas.find((value) => pathname === `/${value}`);
  if (area) return { area } as const;
  if (!pathname.startsWith("/chat/")) return;
  const id = chatIdSchema.safeParse(pathname.slice(6));
  if (id.success) return { area: "chat", chatId: id.data } as const;
}

export function navigateWorkspace(href: string, replace = false) {
  if (href === window.location.pathname + window.location.search + window.location.hash) return;
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
}
