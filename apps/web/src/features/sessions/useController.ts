"use client";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserDisconnectedSchema, decodeBridgeMessage, type Control } from "@mirai/contracts";
import { SessionError, sessionApi, watchControl } from "./sessionApi";
import { requestExtension } from "./extensionBridge";
import { claimTabIdentity } from "./tabIdentity";

export function useController(accountId: string) {
  const client = useQueryClient();
  const [tabId, setTabId] = useState<string | null>(null);
  const [control, setControl] = useState<Control>();
  const [failure, setFailure] = useState<Error | null>(null);
  const [active, setActive] = useState(false);
  const [request, setRequest] = useState<{ attempt: number; expectedInstanceId?: string }>({
    attempt: 0,
  });
  useEffect(() => {
    const abort = new AbortController();
    void claimTabIdentity(setTabId, abort.signal);
    return () => abort.abort();
  }, []);
  const storageKey = `mirai-control:${accountId}:${tabId}`;
  useEffect(() => {
    if (!tabId) return;
    const abort = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let identity = sessionStorage.getItem(storageKey) ?? undefined;
    let expected = request.expectedInstanceId;
    let restoreAttempts = 0;
    let retries = 0;
    let waitingForNetwork = false;
    let previouslyConnected = false;
    let currentStream: AbortController | undefined;
    const connect = async (replacing?: AbortController) => {
      const stream = new AbortController();
      const signal = AbortSignal.any([abort.signal, stream.signal]);
      waitingForNetwork = false;
      if (!replacing) {
        currentStream = stream;
        setActive(false);
      }
      try {
        await watchControl(
          { instanceId: identity, expectedInstanceId: expected },
          signal,
          (event) => {
            if (signal.aborted) return;
            if (event.type === "results.changed") {
              void client.invalidateQueries({ queryKey: ["results"] });
              void client.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "chat" && query.queryKey[1] === accountId && query.queryKey[3] === "status",
              });
            }
            if (event.type === "results.changed") return;
            if (event.type === "browser.disconnected") {
              if (event.instanceId === identity) {
                void client.invalidateQueries({ queryKey: ["extension", accountId, identity] });
                void client.invalidateQueries({ queryKey: ["browser-connection", accountId, identity] });
              }
              return;
            }
            if (event.type === "control.refresh") {
              if (identity && event.instanceId === identity) {
                void connect(stream);
                const control = { instanceId: identity };
                if (client.getQueryData(["browser-connection", accountId, identity]) === true)
                  void sessionApi.linkBrowser(control, true).then((link) => {
                    if (!link.ready && !abort.signal.aborted)
                      return requestExtension({ type: "connect", control, ticket: link.ticket, renew: true });
                  }).catch(() => {});
              }
              return;
            }
            if (event.type === "control.ready" && event.instanceId) {
              currentStream = stream;
              replacing?.abort();
              if (previouslyConnected) {
                void client.invalidateQueries({ queryKey: ["results"] });
                if (!replacing)
                  void client.invalidateQueries({ queryKey: ["browser-connection", accountId, event.instanceId] });
              }
              previouslyConnected = true;
              restoreAttempts = 0;
              retries = 0;
              identity = event.instanceId;
              expected = undefined;
              sessionStorage.setItem(storageKey, event.instanceId);
              setControl({ instanceId: event.instanceId });
              setFailure(null);
              setActive(true);
            } else if (event.instanceId !== identity) {
              setActive(false);
              setFailure(new SessionError("CONTROL_CONFLICT", event.instanceId ?? undefined));
              abort.abort();
            }
          },
        );
      } catch (error) {
        if (signal.aborted) return;
        if (replacing && currentStream === replacing) return;
        // A reload can reach the API just before the previous stream closes.
        if (
          error instanceof SessionError &&
          error.code === "CONTROL_CONFLICT" &&
          error.instanceId === identity &&
          restoreAttempts++ < 3
        ) {
          retry = setTimeout(() => void connect(), 300);
          return;
        }
        setFailure(error instanceof Error ? error : new Error("CONNECTION_LOST"));
        if (
          error instanceof SessionError &&
          ["CONTROL_CONFLICT", "AUTH_REQUIRED"].includes(error.code)
        )
          return;
      }
      if (signal.aborted || currentStream !== stream) return;
      setActive(false);
      if (!signal.aborted) {
        if (navigator.onLine)
          retry = setTimeout(() => void connect(), Math.min(1000 * 2 ** retries++, 30000));
        else waitingForNetwork = true;
      }
    };
    void connect();
    const restore = () => {
      if (waitingForNetwork && !abort.signal.aborted) void connect();
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    const disconnect = () => {
      if (identity) sessionApi.depart({ instanceId: identity });
      setActive(false);
      abort.abort();
    };
    window.addEventListener("online", restore);
    window.addEventListener("pageshow", show);
    window.addEventListener("pagehide", disconnect);
    const browserLost = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || (event.source && event.source !== window)) return;
      const lost = browserDisconnectedSchema.safeParse(decodeBridgeMessage(event.data));
      if (lost.success && lost.data.instanceId === identity)
        void client.invalidateQueries({ queryKey: ["browser-connection", accountId, identity] });
    };
    window.addEventListener("message", browserLost);
    return () => {
      abort.abort();
      clearTimeout(retry);
      window.removeEventListener("online", restore);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", disconnect);
      window.removeEventListener("message", browserLost);
    };
  }, [tabId, storageKey, request, client, accountId]);
  const acquireControl = useCallback((expectedInstanceId: string | undefined) => {
    setActive(false);
    setFailure(null);
    setRequest((previous) => ({ attempt: previous.attempt + 1, expectedInstanceId }));
  }, []);
  const extension = useQuery({
    queryKey: ["extension", accountId, control?.instanceId],
    queryFn: () =>
      control
        ? requestExtension({ type: "status", control })
        : Promise.resolve("disconnected" as const),
    enabled: active,
    retry: false,
    networkMode: "always",
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const extensionAvailable = extension.data === "available" || extension.data === "connected";
  const browserConnection = useQuery({
    queryKey: ["browser-connection", accountId, control?.instanceId],
    async queryFn() {
      if (!control) return false;
      const detected = await requestExtension({ type: "status", control });
      if (detected !== "available" && detected !== "connected") return false;
      const link = await sessionApi.linkBrowser(control, detected === "available");
      return (
        link.ready ||
        (await requestExtension({ type: "connect", control, ticket: link.ticket })) === "connected"
      );
    },
    enabled: active && extensionAvailable,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const detect = useMutation({ mutationFn: () => extension.refetch(), networkMode: "always" });
  return {
    active,
    control,
    failure,
    acquire: { isPending: !active && !failure, mutate: acquireControl },
    detect,
    connected: active && extensionAvailable && !extension.error,
    browserReady: active && browserConnection.data === true && !browserConnection.error,
    checkingExtension: extension.isPending,
    async release() {
      setActive(false);
      if (control) {
        await requestExtension({ type: "disconnect", control }).catch(() => {});
        await sessionApi.release(control);
        sessionStorage.removeItem(storageKey);
      }
    },
  };
}
