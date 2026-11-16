"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Control } from "@mirai/contracts";
import { SessionError, sessionApi, watchControl } from "./sessionApi";
import { requestExtension } from "./extensionBridge";
import { claimTabIdentity } from "./tabIdentity";

export function useController(accountId: string) {
  const [tabId, setTabId] = useState<string | null>(null);
  const [control, setControl] = useState<Control>();
  const [failure, setFailure] = useState<Error | null>(null);
  const [active, setActive] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    void claimTabIdentity(setTabId, abort.signal);
    return () => abort.abort();
  }, []);
  const storageKey = `mirai-control:${accountId}:${tabId}`;
  const acquire = useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: (expectedInstanceId: string | undefined) =>
      expectedInstanceId
        ? sessionApi.transfer(expectedInstanceId)
        : sessionApi.acquire(sessionStorage.getItem(storageKey) ?? undefined),
    onMutate: () => {
      setActive(false);
      setFailure(null);
    },
    onSuccess: (next) => {
      sessionStorage.setItem(storageKey, next.instanceId);
      setControl(next);
    },
    onError: (error) => {
      setFailure(error);
      setActive(false);
    },
  });
  useEffect(() => {
    if (!tabId || started.current) return;
    started.current = true;
    acquire.mutate(undefined);
  }, [tabId, acquire]);
  useEffect(() => {
    if (!control) return;
    const abort = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      setActive(false);
      try {
        await sessionApi.validate(control);
        if (abort.signal.aborted) return;
        await watchControl(control, abort.signal, (current) => {
          if (current === control.instanceId) {
            setFailure(null);
            setActive(true);
          } else {
            setActive(false);
            setFailure(new SessionError("CONTROL_CONFLICT", current ?? undefined));
            abort.abort();
          }
        });
      } catch (error) {
        if (abort.signal.aborted) return;
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
    window.addEventListener("online", restore);
    window.addEventListener("pageshow", show);
    window.addEventListener("offline", offline);
    const disconnect = () => {
      abort.abort();
      setActive(false);
    };
    window.addEventListener("pagehide", disconnect);
    return () => {
      abort.abort();
      clearTimeout(retry);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", restore);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", disconnect);
      void requestExtension({ type: "disconnect", control }).catch(() => {});
    };
  }, [control]);
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
  const detect = useMutation({ mutationFn: () => extension.refetch(), networkMode: "always" });
  return {
    active,
    control,
    failure,
    acquire,
    detect,
    connected: active && extension.data === "connected" && !extension.error,
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
