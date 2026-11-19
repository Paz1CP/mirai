"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  sendChatSchema,
  type ChatEvent,
  type ChatContext,
  type ChatGeneration,
  type ChatTurn,
} from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { ProfileError } from "@/features/profiles/profileApi";
import { useWorkspaceController } from "@/features/sessions/WorkspaceShell";
import { navigateWorkspace } from "@/features/sessions/workspaceRoutes";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { CampaignSummary } from "./CampaignSummary";
import { chatApi, chatHistoryKey, chatHistoryOptions, chatListKey } from "./chatApi";
import { ChatComposer } from "./ChatComposer";
import { useChatGeneration } from "./ChatGenerationProvider";
import { useChatDraft } from "./ChatDraftsProvider";
import { ChatTranscript } from "./ChatTranscript";
import { cvApi } from "@/features/cvs/cvApi";

export function ChatWorkspace({ chatId }: { chatId?: string }) {
  const { t, locale } = useI18n();
  const label = t.conversation;
  const queryClient = useQueryClient();
  const { accountId, instanceId, browserReady } = useWorkspaceController();
  const { generation } = useChatGeneration();
  const [text, setText] = useChatDraft(chatId);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [files, setFiles] = useState<File[]>([]);
  const [live, setLive] = useState<ChatEvent[]>([]);
  const [streamContext, setStreamContext] = useState<ChatContext>();
  const [workingOnStream, setWorkingOnStream] = useState<boolean>();
  const [streamTurn, setStreamTurn] = useState<ChatTurn | null>();
  const [streamError, setStreamError] = useState<string | null>(null);
  const [pendingChat, setPendingChat] = useState<string>();
  const [pendingMessage, setPendingMessage] = useState<{
    event: ChatEvent;
    text: string;
    files: File[];
    documentIds: string[];
    sending: boolean;
  }>();
  const acknowledged = useRef<string | undefined>(undefined);
  const statusKey = ["chat", accountId, chatId, "status"] as const;
  const history = useInfiniteQuery(chatHistoryOptions(accountId, chatId));
  const status = useQuery({
    queryKey: statusKey,
    queryFn: ({ signal }) => chatApi.status(chatId!, signal),
    enabled: Boolean(chatId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  useEffect(() => {
    if (!chatId) return;
    const abort = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reconnecting = false;
    let retries = 0;
    let wasWorking = false;
    const synchronize = (cancelRefetch: boolean) => {
      const options = { cancelRefetch };
      void queryClient.invalidateQueries({ queryKey: chatHistoryKey(accountId, chatId) }, options);
      void queryClient.invalidateQueries(
        { queryKey: ["chat", accountId, chatId, "status"] },
        options,
      );
    };
    const connect = async () => {
      let connected = false;
      try {
        await chatApi.watch(chatId, abort.signal, (frame) => {
          if (frame.type === "event") {
            if (frame.event.role === "user") acknowledged.current = frame.event.id;
            setLive((events) => {
              const index = events.findIndex(({ id }) => id === frame.event.id);
              const previous = events[index];
              if (!previous) return [...events, frame.event];
              if (!frame.partial) return events.with(index, frame.event);
              const text = [...previous.parts, ...frame.event.parts]
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join("");
              return events.with(index, { ...frame.event, parts: [{ type: "text", text }] });
            });
          } else if (frame.type === "context") {
            setStreamContext(frame.context);
          } else if (frame.type === "status") {
            wasWorking = frame.working;
            setWorkingOnStream(frame.working);
            setStreamError(frame.error);
            setStreamTurn(frame.turn ?? null);
            if (!frame.working) synchronize(true);
          } else {
            connected = true;
            retries = 0;
            if (reconnecting) {
              reconnecting = false;
              synchronize(false);
            }
          }
        });
      } catch (error) {
        if (
          error instanceof ProfileError &&
          ["CHAT_NOT_FOUND", "AUTH_REQUIRED", "AGENT_NOT_CONFIGURED"].includes(error.code)
        )
          return;
      }
      if (!abort.signal.aborted) {
        setStreamContext(undefined);
        setWorkingOnStream(undefined);
        setStreamTurn(undefined);
        reconnecting ||= connected;
        retry = setTimeout(() => void connect(), Math.min(1000 * 2 ** retries++, 30000));
      }
    };
    void connect();
    return () => {
      abort.abort();
      clearTimeout(retry);
      if (wasWorking) {
        void queryClient.invalidateQueries({ queryKey: chatHistoryKey(accountId, chatId), refetchType: "none" });
        void queryClient.invalidateQueries({ queryKey: ["chat", accountId, chatId, "status"], refetchType: "none" });
      }
    };
  }, [accountId, chatId, queryClient]);

  const send = useMutation({
    mutationFn: async (input: {
      text: string;
      draft: string;
      event: ChatEvent;
      instanceId: string;
      files: File[];
      documentIds: string[];
      generation: ChatGeneration;
    }) => {
      const documents = input.files.filter((file) => !file.type.startsWith("image/"));
      const uploads = documents.length
        ? cvApi.uploadOriginals(documents, input.documentIds).then(() => {
            void queryClient.invalidateQueries({ queryKey: ["cv-originals", accountId] });
          })
        : undefined;
      const encoded = Promise.all(
        input.files.map(async (file) => {
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onload = () => resolve(String(reader.result).split(",")[1]!);
            reader.readAsDataURL(file);
          });
          return {
            name: file.name,
            mimeType: file.type.startsWith("image/")
              ? file.type
              : /\.pdf$/i.test(file.name)
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            data,
          };
        }),
      );
      const [attachments] = await Promise.all([encoded, uploads]);
      let target = chatId ?? pendingChat;
      if (!target) {
        const chat = await chatApi.create(
          (input.text || input.files[0]?.name || label.attachmentOnly)
            .replace(/\s+/g, " ")
            .slice(0, 120),
        );
        target = chat.id;
        setPendingChat(target);
        queryClient.setQueryData<Awaited<ReturnType<typeof chatApi.list>>>(
          chatListKey(accountId),
          (chats) => chats && [chat, ...chats.filter(({ id }) => id !== chat.id)],
        );
      }
      await chatApi.send(
        target,
        sendChatSchema.parse({
          id: input.event.id,
          text: input.text,
          instanceId: input.instanceId,
          locale,
          generation: input.generation,
          attachments,
        }),
      );
      return target;
    },
    onSuccess: (target, { event }) => {
      setLive((events) => (events.some(({ id }) => id === event.id) ? events : [...events, event]));
      setPendingMessage(undefined);
      if (!chatId) {
        const key = chatHistoryKey(accountId, target);
        queryClient.setQueryData<InfiniteData<Awaited<ReturnType<typeof chatApi.history>>>>(
          key,
          (history) =>
            history ?? {
              pages: [{ items: [event], next: null, context: { used: null, capacity: null } }],
              pageParams: [null],
            },
        );
        void queryClient.invalidateQueries({ queryKey: key, refetchType: "none" });
        if (mounted.current && window.location.pathname === "/")
          navigateWorkspace(`/chat/${target}`);
      } else {
        void queryClient.invalidateQueries({ queryKey: statusKey });
        if (!mounted.current)
          void queryClient.invalidateQueries({ queryKey: chatHistoryKey(accountId, chatId) });
      }
      void queryClient.invalidateQueries({ queryKey: chatListKey(accountId) });
    },
    onError: (_error, { event, draft, files }) => {
      if (acknowledged.current === event.id) {
        setPendingMessage(undefined);
        return;
      }
      setPendingMessage((message) => message && { ...message, sending: false });
      setText((current) => current || draft);
      setFiles(files);
    },
  });
  const operation = useMutation({
    mutationFn: (action: "compact" | "stop" | "resume") => {
      if (!chatId || !instanceId) throw new Error("CONTROL_REQUIRED");
      return chatApi.action(chatId, action, instanceId, locale);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });
  const persisted = history.data?.pages.toReversed().flatMap(({ items }) => items) ?? [];
  const byId = new Map([...live, ...persisted].map((event) => [event.id, event]));
  const sendConfirmed = send.variables && byId.has(send.variables.event.id);
  const pending = pendingMessage?.sending ? pendingMessage.event : undefined;
  const pendingId = pending && !byId.has(pending.id) ? pending.id : undefined;
  if (pending && pendingId) byId.set(pendingId, pending);
  const merged = [...byId.values()];
  const storedActivity = new Set(
    merged.flatMap(({ activityId }) => (activityId ? [activityId] : [])),
  );
  const events = merged
    .filter(({ id }) => !storedActivity.has(id))
    .sort((a, b) => a.at.localeCompare(b.at));
  const campaign = status.data?.campaign;
  const context = streamContext ?? history.data?.pages[0]?.context ?? status.data?.context;
  const capacity = context?.capacity ?? status.data?.context.capacity ?? null;
  const working = workingOnStream ?? status.data?.working ?? false;
  const activeTurn = streamTurn === undefined ? status.data?.turn : (streamTurn ?? undefined);
  const error = (sendConfirmed ? null : send.error) ?? operation.error ?? history.error ?? status.error;
  const errorText =
    error?.message ??
    (!working ? (streamError ?? status.data?.error ?? history.data?.pages[0]?.error) : null);
  function submit() {
    const trimmed = text.trim();
    if ((!trimmed && !files.length) || !instanceId || pendingMessage?.sending || send.isPending)
      return;
    const message =
      pendingMessage?.text === trimmed && pendingMessage.files === files
        ? pendingMessage
        : {
            event: {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              role: "user" as const,
              parts: [
                {
                  type: "text" as const,
                  text: [trimmed, ...files.map(({ name }) => name)].filter(Boolean).join("\n"),
                },
              ],
            },
            text: trimmed,
            files,
            documentIds: files
              .filter((file) => !file.type.startsWith("image/"))
              .map(() => crypto.randomUUID()),
          };
    setPendingMessage({ ...message, sending: true });
    setText("");
    setFiles([]);
    send.mutate({ ...message, draft: text, instanceId, generation });
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      {chatId && campaign?.status === "stopped" && !working && (
        <div className="flex justify-end px-4 pt-3">
          <Button
            variant="secondary"
            disabled={!instanceId || !browserReady || operation.isPending}
            onClick={() => operation.mutate("resume")}
          >
            {label.resume}
          </Button>
        </div>
      )}
      {chatId || events.length > 0 ? (
        <ChatTranscript
          events={events}
          pendingMessageId={pendingId}
          activeTurn={activeTurn}
          loading={history.isPending && !events.length}
          older={history.hasNextPage && !history.isFetchNextPageError}
          nextCursor={history.data?.pages.at(-1)?.next}
          fetchOlder={() => history.fetchNextPage()}
        >
          {campaign &&
            !events.some((event) =>
              event.parts.some((part) => part.type === "campaign" && part.id === campaign.id),
            ) && <CampaignSummary id={campaign.id} working={working} />}
        </ChatTranscript>
      ) : (
        <div className="grid min-h-0 flex-1 content-center justify-items-center gap-6 overflow-y-auto px-5 py-8 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">{t.welcome}</h2>
          <div className="flex max-w-3xl flex-wrap justify-center gap-2">
            {label.suggestions.map((suggestion) => (
              <Button key={suggestion} variant="outline" onClick={() => setText(suggestion)}>
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-3xl shrink-0 space-y-2 px-5 pb-5 sm:px-8">
        {campaign?.status === "stopped" && !browserReady && !working && (
          <p className="text-sm text-muted-foreground">{t.extensionDescription}</p>
        )}
        {errorText && (
          <p className="whitespace-pre-wrap wrap-break-word text-sm text-destructive" role="alert">
            {errorText}
          </p>
        )}
        <ChatComposer
          files={files}
          onFilesChange={setFiles}
          text={text}
          onChange={setText}
          working={working}
          enabled={Boolean(instanceId)}
          busy={
            Boolean(pendingMessage?.sending) ||
            send.isPending ||
            (operation.isPending && operation.variables !== "compact")
          }
          context={context && { used: context.used, capacity }}
          onSend={submit}
          onStop={() => operation.mutate("stop")}
          onCompact={chatId ? () => operation.mutate("compact") : undefined}
          stopping={operation.isPending && operation.variables === "stop"}
          compacting={operation.isPending && operation.variables === "compact"}
        />
      </div>
    </section>
  );
}
