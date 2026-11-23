"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
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
import { notifyChatCompletion } from "@/features/chat/chatNotifications";
import { ProfileError } from "@/features/profiles/profileApi";
import { accessToken, clearAccessToken } from "@/shared/auth/client";
import { openExtensionBridge, openWorkspaceExtension } from "./extensionBridge";

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
  const [extensionStatus, setExtensionStatus] = useState<
    "checking" | "connected" | "unavailable" | "incompatible"
  >("checking");
  const [attempt, setAttempt] = useState<{ expectedInstanceId?: string }>({});
  const requestRef = useRef<(command: Command) => Promise<void>>(undefined);
  const detectRef = useRef<() => void>(undefined);
  const notifiedTurns = useRef(new Set<string>());

  useEffect(() => {
    let disposed = false;
    let idle = false;
    let socket: WebSocket | Awaited<ReturnType<typeof openWorkspaceExtension>>;
    const tabId = crypto.randomUUID();
    let socketInstanceId: string | undefined;
    let replacement: typeof socket;
    let renewal: { ready: Promise<void>; done: () => void } | undefined;
    let bridge: ReturnType<typeof openExtensionBridge> | undefined;
    let detection: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let extensionUnavailable = false;
    let restoringChrome = false;
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
    const pending = new Map<
      string,
      {
        command: Command;
        resolve: () => void;
        reject: (error: Error) => void;
      }
    >();
    const send = (frame: WorkspaceClientFrame) => {
      if (socket?.readyState !== WebSocket.OPEN) throw new ProfileError("CONNECTION_LOST");
      socket.send(JSON.stringify(frame));
    };
    function sendCommand(requestId: string, command: Command) {
      if (!socketInstanceId) throw new ProfileError("CONNECTION_LOST");
      send(
        command.type === "chat.send"
          ? { ...command, requestId, message: { ...command.message, instanceId: socketInstanceId } }
          : { ...command, requestId },
      );
    }
    function closeBridge() {
      clearTimeout(detection);
      clearTimeout(reconnect);
      restoringChrome = false;
      bridge?.close();
      bridge = undefined;
    }
    function reportUnavailable(status: "unavailable" | "incompatible" = "unavailable") {
      extensionUnavailable = status === "unavailable";
      restoringChrome = false;
      setExtensionStatus(status);
      if (socket?.readyState === WebSocket.OPEN) send({ type: "browser.closed" });
    }
    function watchExtension() {
      clearTimeout(detection);
      detection = setTimeout(reportUnavailable, restoringChrome ? 10_000 : 3_000);
    }
    function detect(waitForSnapshot = false, retryOnDisconnect = true) {
      if (disposed || socket?.readyState !== WebSocket.OPEN) return;
      closeBridge();
      extensionUnavailable = false;
      setExtensionStatus("checking");
      restoringChrome = waitForSnapshot;
      let canRetry = retryOnDisconnect;
      bridge = openExtensionBridge(
        (frame) => {
          if (socket?.readyState === WebSocket.OPEN) send({ type: "browser.frame", frame });
        },
        () => {
          clearTimeout(detection);
          extensionUnavailable = false;
          restoringChrome = false;
          canRetry = true;
          setExtensionStatus("connected");
        },
        (reason) => {
          const restoring = restoringChrome;
          closeBridge();
          if (reason === "incompatible") reportUnavailable("incompatible");
          else if (canRetry) {
            if (!restoring && socket?.readyState === WebSocket.OPEN)
              send({ type: "browser.closed" });
            setExtensionStatus("checking");
            reconnect = setTimeout(() => detect(restoring, false), 1000);
          } else reportUnavailable();
        },
      );
      watchExtension();
    }
    function detach() {
      requestRef.current = undefined;
      detectRef.current = undefined;
      extensionUnavailable = false;
      flush();
      closeBridge();
      for (const command of pending.values()) command.reject(new ProfileError("CONNECTION_LOST"));
      pending.clear();
    }
    const onPageHide = () => {
      disposed = true;
      detach();
      socket?.close();
      replacement?.close();
      renewal?.done();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    const wake = () => {
      if (!idle || disposed) return;
      idle = false;
      setAttempt({});
    };
    const retryExtension = () => {
      if (extensionUnavailable) detect();
    };
    window.addEventListener("focus", wake);
    window.addEventListener("focus", retryExtension);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    const open = async (handoff?: { chatId?: string; chatIds?: string[] }, retry = false) => {
      const [token, local] = await Promise.all([
        accessToken(),
        handoff ? undefined : openWorkspaceExtension(),
      ]);
      if (disposed || !token) local?.close();
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
      const connection = local ?? new WebSocket(url);
      let renewalDenied = false;
      if (handoff) replacement = connection;
      else socket = connection;
      const authenticate = () => {
        if (!disposed) {
          const frame: WorkspaceClientFrame = {
            type: "open",
            token,
            accountId: local ? accountId : undefined,
            tabId,
            renewal: handoff,
            expectedInstanceId: handoff ? socketInstanceId : attempt.expectedInstanceId,
          };
          connection.send(JSON.stringify(frame));
        }
      };
      const disconnected = () => {
        renewal?.done();
        detach();
        setActive(false);
        setExtensionStatus("checking");
        if (!released && !idle)
          setFailure((previous) => previous ?? new SessionError("CONNECTION_LOST"));
      };
      connection.onclose = () => {
        if (disposed) return;
        if (connection === replacement) {
          replacement = undefined;
          if (handoff && !retry && !renewalDenied && socket?.readyState === WebSocket.OPEN) {
            void open(handoff, true).catch(disconnected);
            return;
          }
          disconnected();
          return;
        }
        if (connection === socket && !renewal) disconnected();
      };
      connection.onmessage = ({ data }: { data: unknown }) => {
        if (
          disposed ||
          typeof data !== "string" ||
          (connection !== socket && connection !== replacement)
        )
          return;
        let candidate: unknown;
        try {
          candidate = JSON.parse(data) as unknown;
        } catch {
          return;
        }
        const parsed = workspaceServerSchema.safeParse(candidate);
        if (!parsed.success) return;
        const frame = parsed.data;
        if (frame.type === "control.renew" && connection === socket && !renewal) {
          let done!: () => void;
          const ready = new Promise<void>((resolve) => {
            done = resolve;
          });
          renewal = { ready, done };
          void open({ chatId: frame.chatId, chatIds: frame.chatIds }).catch((error: unknown) => {
            if (disposed) return;
            setFailure(error instanceof Error ? error : new SessionError("CONNECTION_LOST"));
            disconnected();
          });
        } else if (frame.type === "control.ready") {
          socketInstanceId = frame.instanceId;
          if (local && instanceId) return;
          if (connection === replacement) {
            const previous = socket;
            socket = connection;
            replacement = undefined;
            renewal?.done();
            renewal = undefined;
            previous?.close();
            for (const [id, pendingRequest] of pending) {
              // Chat acceptance is deduplicated by the original message ID in Google Sessions.
              if (pendingRequest.command.type === "chat.send")
                sendCommand(id, pendingRequest.command);
              else {
                pending.delete(id);
                pendingRequest.reject(new ProfileError("CONNECTION_LOST"));
              }
            }
            // postMessage lets a queued Stop reach the new socket before Chrome is restored.
            if (bridge) {
              restoringChrome = true;
              bridge.restore();
              watchExtension();
            } else
              queueMicrotask(() => {
                if (!disposed && socket === connection && connection.readyState === WebSocket.OPEN)
                  detect(true);
              });
            return;
          }
          instanceId = frame.instanceId;
          if (local && frame.activeChats) {
            const workingChats = new Set(frame.activeChats.map(({ chatId }) => chatId));
            client.setQueriesData<LiveChat>(
              {
                predicate: ({ queryKey }) =>
                  queryKey[0] === "chat-live" &&
                  queryKey[1] === accountId &&
                  queryKey[2] === instanceId &&
                  typeof queryKey[3] === "string" &&
                  !workingChats.has(queryKey[3]),
              },
              (current) =>
                current?.status?.working
                  ? {
                      ...current,
                      events: [],
                      status: { type: "status", working: false, error: null },
                    }
                  : current,
            );
          }
          for (const { chatId, turn, partials } of frame.activeChats ?? []) {
            client.setQueryData<LiveChat>(
              liveChatKey(accountId, instanceId, chatId),
              (current) => ({
                ...current,
                events: partials ?? current?.events,
                status: { type: "status", working: true, error: null, turn },
              }),
            );
          }
          requestRef.current = async (command) => {
            await renewal?.ready;
            if (!requestRef.current || !socketInstanceId) throw new ProfileError("CONNECTION_LOST");
            return new Promise<void>((resolve, reject) => {
              const requestId = crypto.randomUUID();
              sendCommand(requestId, command);
              pending.set(requestId, {
                command,
                resolve: () => {
                  if (command.type === "control.release") released = true;
                  resolve();
                },
                reject,
              });
            });
          };
          if (local) setExtensionStatus("connected");
          else {
            detectRef.current = () => detect();
            detect();
          }
          setControl({ instanceId: frame.instanceId });
          setFailure(null);
          const persisted = {
            predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
              queryKey[0] === "results" ||
              (queryKey[0] === "billing" && queryKey[1] === accountId) ||
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
          if (
            frame.type === "error" &&
            frame.code === "WORKSPACE_RENEWING" &&
            renewal &&
            command?.command.type === "chat.send"
          )
            return;
          pending.delete(requestId);
          if (frame.type === "accepted") command?.resolve();
          else command?.reject(new ProfileError(frame.code));
        } else if (frame.type === "control.idle") {
          idle = true;
          disconnected();
        } else if (frame.type === "control.lost" || frame.type === "error") {
          if (frame.type === "error" && frame.code === "AUTH_REQUIRED") clearAccessToken();
          if (
            connection === replacement &&
            frame.type === "error" &&
            frame.code === "CONTROL_CONFLICT"
          ) {
            renewalDenied = true;
            return;
          }
          if (connection === socket && replacement) {
            const successor = replacement;
            replacement = undefined;
            successor.close();
          }
          renewal?.done();
          const code = frame.type === "error" ? frame.code : "CONTROL_CONFLICT";
          setFailure(new SessionError(code, frame.instanceId ?? undefined));
          setActive(false);
          setExtensionStatus("checking");
          detach();
        } else if (frame.type === "browser.frame") {
          bridge?.send(frame.frame);
        } else if (frame.type === "browser.reset") {
          detect();
        } else if (frame.type === "billing.changed") {
          void client.invalidateQueries({ queryKey: ["billing", accountId] });
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
          } else if (event.type === "completed") {
            flush();
            void notifyChatCompletion(
              client,
              { accountId, instanceId, chatId, turnId: event.turnId },
              notifiedTurns.current,
              () => !disposed,
            );
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
      if (connection.readyState === WebSocket.OPEN) authenticate();
      else if (connection.readyState === WebSocket.CONNECTING) connection.onopen = authenticate;
      else disconnected();
    };
    void open().catch((error: unknown) => {
      if (!disposed)
        setFailure(error instanceof Error ? error : new SessionError("CONNECTION_LOST"));
    });
    return () => {
      disposed = true;
      detach();
      socket?.close();
      replacement?.close();
      renewal?.done();
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", wake);
      window.removeEventListener("focus", retryExtension);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
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
    extensionStatus,
    request,
    acquire: { mutate: acquireControl, isPending: !active && !failure },
    reconnectExtension: () => detectRef.current?.(),
    release: () => requestRef.current?.({ type: "control.release" }),
  };
}
