"use client";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Control } from "@mirai/contracts";
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
    const connect = async () => {
      let ready = false;
      setActive(false);
      try {
        await watchControl(
          { instanceId: identity, expectedInstanceId: expected },
          abort.signal,
          (event) => {
            if (event.type === "results.changed" || event.type === "control.ready")
              void client.invalidateQueries({ queryKey: ["results"] });
            if (event.type === "results.changed") return;
            if (event.type === "control.refresh") {
              if (identity && event.instanceId === identity)
                void sessionApi.validate({ instanceId: identity }, abort.signal).catch(() => {});
              return;
            }
            if (event.type === "control.ready" && event.instanceId) {
              ready = true;
              restoreAttempts = 0;
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
        if (ready && !abort.signal.aborted) {
          void connect();
          return;
        }
      } catch (error) {
        if (abort.signal.aborted) return;
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
      setActive(false);
      if (!abort.signal.aborted) retry = setTimeout(() => void connect(), 2000);
    };
    void connect();
    const offline = () => setActive(false);
    const restore = () => window.location.reload();
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) restore();
    };
    const disconnect = () => {
      setActive(false);
      abort.abort();
    };
    window.addEventListener("online", restore);
    window.addEventListener("pageshow", show);
    window.addEventListener("offline", offline);
    window.addEventListener("pagehide", disconnect);
    return () => {
      abort.abort();
      clearTimeout(retry);
      window.removeEventListener("online", restore);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", disconnect);
    };
  }, [tabId, storageKey, request, client]);
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
    refetchInterval: active ? 4000 : false,
  });
  const browserConnection = useQuery({
    queryKey: ["browser-connection", accountId, control?.instanceId],
    async queryFn() {
      if (!control) return false;
      const link = await sessionApi.linkBrowser(control);
      return (
        link.ready ||
        (await requestExtension({ type: "connect", control, ticket: link.ticket })) === "connected"
      );
    },
    enabled: active && extension.data === "connected",
    refetchInterval: active ? 5000 : false,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const detect = useMutation({ mutationFn: () => extension.refetch(), networkMode: "always" });
  return {
    active,
    control,
    failure,
    acquire: { isPending: !active && !failure, mutate: acquireControl },
    detect,
    connected: active && extension.data === "connected" && !extension.error,
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
