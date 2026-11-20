import {
  chatHistorySchema,
  chatStatusSchema,
  chatStreamSchema,
  chatSummarySchema,
  storedChatFileSchema,
  type ChatStream,
  type SendChat,
} from "@mirai/contracts";
import { request, requestResponse } from "@/features/profiles/profileApi";
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
  send: async (id: string, message: SendChat) => request(`chats/${id}/messages`, "POST", message),
  action: async (
    id: string,
    action: "compact" | "stop" | "resume",
    instanceId: string,
    locale: SendChat["locale"],
    campaignId?: string,
  ) =>
    request(
      `chats/${id}/${action}`,
      "POST",
      action === "stop" ? { instanceId } : { instanceId, locale, campaignId },
    ),
  async watch(id: string, signal: AbortSignal, onEvent: (event: ChatStream) => void) {
    const response = await requestResponse(`chats/${id}/stream`, "GET", undefined, signal);
    if (!response.body) throw new Error("CHAT_STREAM_UNAVAILABLE");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += value;
        let boundary = pending.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          if (frame.startsWith("data: ")) {
            const decoded = chatStreamSchema.safeParse(JSON.parse(frame.slice(6)));
            if (decoded.success) onEvent(decoded.data);
          }
          boundary = pending.indexOf("\n\n");
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  },
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
