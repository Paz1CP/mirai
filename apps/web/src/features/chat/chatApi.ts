import {
  chatHistorySchema,
  chatStatusSchema,
  chatSummarySchema,
  storedChatFileSchema,
  type ChatContext,
  type ChatEvent,
  type ChatStream,
} from "@mirai/contracts";
import { request } from "@/features/profiles/profileApi";
import { infiniteQueryOptions } from "@tanstack/react-query";

export const chatApi = {
  files: async (signal?: AbortSignal) =>
    storedChatFileSchema.array().parse(await request("chats/attachments", "GET", undefined, signal)),
  removeFile: (file: { chatId: string; messageId: string; position: number }) =>
    request(`chats/${file.chatId}/attachments/${file.messageId}/${file.position}`, "DELETE"),
  list: async (signal?: AbortSignal) =>
    chatSummarySchema.array().parse(await request("chats", "GET", undefined, signal)),
  create: async (title: string) =>
    chatSummarySchema.parse(await request("chats", "POST", { title })),
  history: async (id: string, cursor: string | null, signal?: AbortSignal) =>
    chatHistorySchema.parse(
      await request(
        `chats/${id}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        "GET",
        undefined,
        signal,
      ),
    ),
  status: async (id: string, signal?: AbortSignal) =>
    chatStatusSchema.parse(await request(`chats/${id}/status`, "GET", undefined, signal)),
  rename: async (id: string, title: string) => request(`chats/${id}`, "PATCH", { title }),
  remove: async (id: string) => request(`chats/${id}`, "DELETE"),
};

export function chatHistoryKey(accountId: string, chatId: string | undefined) {
  return ["chat", accountId, chatId, "history"] as const;
}

export function chatHistoryOptions(accountId: string, chatId?: string) {
  return infiniteQueryOptions({
    queryKey: chatHistoryKey(accountId, chatId),
    queryFn: ({ pageParam, signal }) => chatApi.history(chatId!, pageParam, signal),
    enabled: Boolean(chatId),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export const chatListKey = (accountId: string) => ["chats", accountId] as const;

export type LiveChat = {
  events?: ChatEvent[];
  status?: Extract<ChatStream, { type: "status" }>;
  context?: ChatContext;
};

export const liveChatKey = (accountId: string, instanceId?: string, chatId?: string) =>
  ["chat-live", accountId, instanceId, chatId] as const;

export function applyChatEvents(
  events: ChatEvent[],
  frames: Extract<ChatStream, { type: "event" }>[],
) {
  const byId = new Map(events.map((event) => [event.id, event]));
  for (const { event, partial } of frames) {
    if (event.activityId) byId.delete(event.activityId);
    const previous = partial ? byId.get(event.id)?.parts[0] : undefined;
    const delta = event.parts[0];
    byId.set(event.id, previous && delta && "text" in previous && "text" in delta && previous.type === delta.type
      ? { ...event, parts: [{ ...delta, text: previous.text + delta.text }] }
      : event);
  }
  return [...byId.values()];
}
