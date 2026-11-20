"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  extensionReadyFrame,
  workspaceServerSchema,
  workspaceSocketPath,
  type ChatStream,
  type WorkspaceClientFrame,
} from "@mirai/contracts";
import {
  applyChatEvents,
  chatHistoryKey,
  liveChatKey,
  type LiveChat,
} from "@/features/chat/chatApi";
import { ProfileError } from "@/features/profiles/profileApi";
import { accessToken, clearAccessToken } from "@/shared/auth/client";
import { openExtensionBridge } from "./extensionBridge";

export class SessionError extends Error {
  constructor(
    public readonly code: string,
    public readonly instanceId?: string,
  ) {
    super(code);
  }
}

type WithoutRequestId<T> = T extends { requestId: string } ? Omit<T, "requestId"> : never;
type Command = WithoutRequestId<WorkspaceClientFrame>;
type TranscriptFrame = Extract<ChatStream, { type: "event" }>;

export function useController(accountId: string) {
  const client = useQueryClient();
  const [control, setControl] = useState<{ instanceId: string }>();
  const [failure, setFailure] = useState<Error | null>(null);
  const [active, setActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [checkingExtension, setCheckingExtension] = useState(false);
  const [attempt, setAttempt] = useState<{ expectedInstanceId?: string }>({});
  const requestRef = useRef<(command: Command) => Promise<void>>(undefined);
  const detectRef = useRef<() => void>(undefined);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let bridge: ReturnType<typeof openExtensionBridge> | undefined;
    let detection: ReturnType<typeof setTimeout> | undefined;
    let released = false;
    let instanceId: string | undefined;
    let animation: number | undefined;
    const transcript = new Map<string, TranscriptFrame[]>();
    function flush() {
      if (animation !== undefined) cancelAnimationFrame(animation);
      animation = undefined;
      for (const [chatId, frames] of transcript) {
        client.setQueryData<LiveChat>(liveChatKey(accountId, instanceId, chatId), (current) => ({
          ...current,
          events: applyChatEvents(current?.events ?? [], frames),
        }));
      }
      transcript.clear();
    }
    const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
    const send = (frame: WorkspaceClientFrame) => {
      if (socket?.readyState !== WebSocket.OPEN) throw new ProfileError("CONNECTION_LOST");
      socket.send(JSON.stringify(frame));
    };
    function closeBridge() {
      clearTimeout(detection);
      bridge?.close();
      bridge = undefined;
    }
    function detect() {
      closeBridge();
      setConnected(false);
      setCheckingExtension(true);
      send({ type: "browser.closed" });
      bridge = openExtensionBridge(
        (frame) => {
          if (socket?.readyState !== WebSocket.OPEN) return;
          if (frame === extensionReadyFrame) {
            clearTimeout(detection);
            setCheckingExtension(false);
            setConnected(true);
          }
          send({ type: "browser.frame", frame });
        },
        () => {
          closeBridge();
          setConnected(false);
          setCheckingExtension(false);
          if (socket?.readyState === WebSocket.OPEN) send({ type: "browser.closed" });
        },
      );
      detection = setTimeout(() => setCheckingExtension(false), 1000);
    }
    function detach() {
      requestRef.current = undefined;
      detectRef.current = undefined;
      flush();
      closeBridge();
      for (const command of pending.values()) command.reject(new ProfileError("CONNECTION_LOST"));
      pending.clear();
    }
    const onPageHide = () => {
      disposed = true;
      detach();
      socket?.close();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    void accessToken()
      .then((token) => {
        if (disposed) return;
        if (!token) throw new SessionError("AUTH_REQUIRED");
        const url = new URL(
          workspaceSocketPath,
          process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000",
        );
        if (url.protocol === "https:") url.protocol = "wss:";
        else if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
          url.protocol = "ws:";
        else throw new SessionError("CONNECTION_LOST");
        socket = new WebSocket(url);
        socket.onopen = () => {
          if (!disposed)
            send({ type: "open", token, expectedInstanceId: attempt.expectedInstanceId });
        };
        socket.onclose = () => {
          if (disposed) return;
          detach();
          setActive(false);
          setConnected(false);
          setCheckingExtension(false);
          if (!released) setFailure((previous) => previous ?? new SessionError("CONNECTION_LOST"));
        };
        socket.onmessage = ({ data }) => {
          if (disposed || typeof data !== "string") return;
          let candidate: unknown;
          try {
            candidate = JSON.parse(data) as unknown;
          } catch {
            return;
          }
          const parsed = workspaceServerSchema.safeParse(candidate);
          if (!parsed.success) return;
          const frame = parsed.data;
          if (frame.type === "control.ready") {
            instanceId = frame.instanceId;
            requestRef.current = (command) =>
              new Promise<void>((resolve, reject) => {
                const requestId = crypto.randomUUID();
                send({ ...command, requestId });
                pending.set(requestId, {
                  resolve: () => {
                    if (command.type === "control.release") released = true;
                    resolve();
                  },
                  reject,
                });
              });
            detectRef.current = detect;
            detect();
            setControl({ instanceId: frame.instanceId });
            setFailure(null);
            const persisted = {
              predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
                queryKey[0] === "results" ||
                (queryKey[1] === accountId && (queryKey[0] === "chat" || queryKey[0] === "chats")),
            };
            void client
              .cancelQueries(persisted)
              .then(() => client.invalidateQueries(persisted))
              .then(() => {
                if (!disposed && requestRef.current && socket?.readyState === WebSocket.OPEN)
                  setActive(true);
              });
          } else if (frame.type === "accepted" || (frame.type === "error" && frame.requestId)) {
            const requestId = frame.requestId!;
            const command = pending.get(requestId);
            pending.delete(requestId);
            if (frame.type === "accepted") command?.resolve();
            else command?.reject(new ProfileError(frame.code));
          } else if (frame.type === "control.lost" || frame.type === "error") {
            if (frame.type === "error" && frame.code === "AUTH_REQUIRED") clearAccessToken();
            const code = frame.type === "error" ? frame.code : "CONTROL_CONFLICT";
            setFailure(new SessionError(code, frame.instanceId ?? undefined));
            setActive(false);
            setConnected(false);
            setCheckingExtension(false);
            detach();
          } else if (frame.type === "browser.frame") {
            bridge?.send(frame.frame);
          } else if (frame.type === "browser.reset") {
            detect();
          } else if (frame.type === "results.changed") {
            void client.invalidateQueries({ queryKey: ["results"] });
            void client.invalidateQueries({
              predicate: ({ queryKey }) =>
                queryKey[0] === "chat" && queryKey[1] === accountId && queryKey[3] === "status",
            });
          } else if (frame.type === "chat.event") {
            const { chatId, event } = frame;
            const key = liveChatKey(accountId, instanceId, chatId);
            if (event.type === "event") {
              const frames = transcript.get(chatId) ?? [];
              frames.push(event);
              transcript.set(chatId, frames);
              if (event.event.role === "user") flush();
              else animation ??= requestAnimationFrame(flush);
            } else if (event.type === "context") {
              client.setQueryData<LiveChat>(key, (current) => ({
                ...current,
                context: event.context,
              }));
            } else {
              flush();
              const previous = client.getQueryData<LiveChat>(key)?.status;
              client.setQueryData<LiveChat>(key, (current) => ({ ...current, status: event }));
              if (!previous?.working && event.working) {
                void client.invalidateQueries({
                  queryKey: chatHistoryKey(accountId, chatId),
                  refetchType: "none",
                });
              } else if (previous?.working && !event.working) {
                void client.invalidateQueries({ queryKey: chatHistoryKey(accountId, chatId) });
                void client.invalidateQueries({ queryKey: ["chat", accountId, chatId, "status"] });
              }
            }
          }
        };
      })
      .catch((error: unknown) => {
        if (!disposed)
          setFailure(error instanceof Error ? error : new SessionError("CONNECTION_LOST"));
      });
    return () => {
      disposed = true;
      detach();
      socket?.close();
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [accountId, attempt, client]);

  const acquireControl = useCallback((expectedInstanceId: string | undefined) => {
    setActive(false);
    setFailure(null);
    setAttempt({ expectedInstanceId });
  }, []);
  const request = useCallback(
    (command: Command) =>
      requestRef.current?.(command) ?? Promise.reject(new ProfileError("CONTROL_REQUIRED")),
    [],
  );
  return {
    control,
    failure,
    active,
    connected,
    checkingExtension,
    request,
    acquire: { mutate: acquireControl, isPending: !active && !failure },
    detect: { mutate: () => detectRef.current?.(), isPending: checkingExtension },
    release: () => requestRef.current?.({ type: "control.release" }),
  };
}
