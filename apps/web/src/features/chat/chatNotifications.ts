import type { QueryClient } from "@tanstack/react-query";
import { navigateWorkspace } from "../sessions/workspaceRoutes";
import { chatApi, chatListKey, liveChatKey, type LiveChat } from "./chatApi";

let permissionRequest: Promise<void> | undefined;

export function requestChatNotificationPermission() {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "default" ||
    permissionRequest
  )
    return;
  try {
    permissionRequest = Notification.requestPermission()
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        permissionRequest = undefined;
      });
  } catch {
    // Notifications are optional even in browsers that expose the API.
  }
}

export async function notifyChatCompletion(
  client: QueryClient,
  {
    accountId,
    instanceId,
    chatId,
    turnId,
  }: {
    accountId: string;
    instanceId?: string;
    chatId: string;
    turnId: string;
  },
  notifiedTurns: Set<string>,
  isCurrent: () => boolean,
) {
  if (
    typeof Notification === "undefined" ||
    (Notification.permission !== "granted" && !permissionRequest) ||
    notifiedTurns.has(turnId)
  )
    return;

  const response = client
    .getQueryData<LiveChat>(liveChatKey(accountId, instanceId, chatId))
    ?.events?.findLast(
      (event) =>
        event.role === "assistant" &&
        event.turnId === turnId &&
        event.parts.some((part) => part.type === "text" && part.text.trim()),
    );
  const body = response?.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!body) return;

  notifiedTurns.add(turnId);
  await permissionRequest;
  if (!isCurrent() || Notification.permission !== "granted") return;

  const chats = await client
    .ensureQueryData({
      queryKey: chatListKey(accountId),
      queryFn: ({ signal }) => chatApi.list(signal),
      networkMode: "always",
      retry: false,
    })
    .catch(() => undefined);
  if (!isCurrent() || Notification.permission !== "granted") return;

  const characters = Array.from(body);
  try {
    const notification = new Notification(
      chats?.find(({ id }) => id === chatId)?.title || "Mirai",
      {
        body: characters.length > 180 ? `${characters.slice(0, 179).join("")}…` : body,
        tag: turnId,
      },
    );
    notification.onclick = () => {
      window.focus();
      navigateWorkspace(`/chat/${chatId}`);
      notification.close();
    };
  } catch {
    // Some browsers expose Notification but do not support its constructor.
  }
}
