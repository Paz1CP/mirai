import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { chatApi, chatListKey, liveChatKey, type LiveChat } from "./chatApi";
import { notifyChatCompletion, requestChatNotificationPermission } from "./chatNotifications";

vi.mock("./chatApi", () => ({
  chatApi: { list: vi.fn() },
  chatListKey: (accountId: string) => ["chats", accountId],
  liveChatKey: (accountId: string, instanceId: string, chatId: string) => [
    "chat-live",
    accountId,
    instanceId,
    chatId,
  ],
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

const target = { accountId: "account", instanceId: "instance", chatId: "123", turnId: "turn" };

function setup(permission: NotificationPermission, text = "Respuesta final") {
  const show = vi.fn();
  const focus = vi.fn();
  const pushState = vi.fn();
  const close = vi.fn();
  class DesktopNotification {
    static permission = permission;
    static requestPermission = vi.fn<() => Promise<NotificationPermission>>();
    onclick?: () => void;
    close = close;
    constructor(title: string, options: NotificationOptions) {
      show(title, options, this);
    }
  }
  vi.stubGlobal("Notification", DesktopNotification);
  vi.stubGlobal("window", { focus, history: { pushState }, location: { pathname: "/profile" } });
  const client = new QueryClient();
  const { accountId, instanceId, chatId, turnId } = target;
  client.setQueryData<LiveChat>(liveChatKey(accountId, instanceId, chatId), {
    events: [
      { id: "answer", at: "", role: "assistant", turnId, parts: [{ type: "text", text }] },
      {
        id: "reason",
        at: "",
        role: "assistant",
        turnId,
        parts: [{ type: "reasoning", text: "Internal" }],
      },
    ],
  });
  const seen = new Set<string>();
  return {
    DesktopNotification,
    client,
    show,
    close,
    focus,
    pushState,
    notify: () => notifyChatCompletion(client, target, seen, () => true),
  };
}

it("shows the final text once even if permission is granted after completion", async () => {
  const { DesktopNotification, client, notify, show, close, focus, pushState } = setup(
    "default",
    `${"a".repeat(178)}🎉 texto que se recorta`,
  );
  let grant!: (permission: NotificationPermission) => void;
  DesktopNotification.requestPermission.mockReturnValue(
    new Promise((resolve) => {
      grant = resolve;
    }),
  );
  client.setQueryData(chatListKey(target.accountId), [{ id: target.chatId, title: "Búsqueda" }]);

  requestChatNotificationPermission();
  requestChatNotificationPermission();
  expect(DesktopNotification.requestPermission).toHaveBeenCalledOnce();
  const completion = notify();
  await notify();
  expect(show).not.toHaveBeenCalled();

  DesktopNotification.permission = "granted";
  grant("granted");
  await completion;
  await notify();
  expect(show).toHaveBeenCalledExactlyOnceWith(
    "Búsqueda",
    { body: `${"a".repeat(178)}🎉…`, tag: target.turnId },
    expect.anything(),
  );
  expect(chatApi.list).not.toHaveBeenCalled();
  show.mock.calls[0]![2].onclick();
  expect(focus).toHaveBeenCalledOnce();
  expect(pushState).toHaveBeenCalledExactlyOnceWith(null, "", `/chat/${target.chatId}`);
  expect(close).toHaveBeenCalledOnce();
});

it("falls back to Mirai when the chat title cannot be loaded", async () => {
  const { DesktopNotification, show, notify } = setup("granted");
  vi.mocked(chatApi.list).mockRejectedValue(new Error("offline"));
  requestChatNotificationPermission();
  await notify();
  expect(DesktopNotification.requestPermission).not.toHaveBeenCalled();
  expect(show).toHaveBeenCalledExactlyOnceWith(
    "Mirai",
    { body: "Respuesta final", tag: target.turnId },
    expect.anything(),
  );
});

it("does nothing when notifications are denied or unavailable", async () => {
  const { DesktopNotification, notify, show } = setup("denied");
  requestChatNotificationPermission();
  await notify();
  vi.stubGlobal("Notification", undefined);
  requestChatNotificationPermission();
  await notify();
  expect(DesktopNotification.requestPermission).not.toHaveBeenCalled();
  expect(show).not.toHaveBeenCalled();
});
