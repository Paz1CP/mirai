"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SessionError, sessionApi } from "./sessionApi";
import { requestExtension } from "./extensionBridge";
import { claimTabIdentity } from "./tabIdentity";

export function useController(accountId: string) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void claimTabIdentity(setInstanceId, abort.signal).catch(() => {
      if (!abort.signal.aborted) setInstanceId(crypto.randomUUID());
    });
    const release = () => abort.abort();
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", restore);
    return () => {
      abort.abort();
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  const started = useRef(false);
  const queryClient = useQueryClient();
  const key = ["controller", accountId, instanceId];
  const acquire = useMutation({
    networkMode: "always",
    mutationFn: (epoch: string | undefined) => {
      if (!instanceId) throw new Error("INSTANCE_NOT_READY");
      return epoch ? sessionApi.transfer(instanceId, epoch) : sessionApi.acquire(instanceId);
    },
    retry: false,
    onSuccess: (control) => {
      queryClient.setQueryData(key, control);
    },
  });
  useEffect(() => {
    if (started.current || !instanceId) return;
    started.current = true;
    acquire.mutate(undefined);
  }, [acquire, instanceId]);
  const controller = useQuery({
    networkMode: "always",
    queryKey: key,
    queryFn: ({ signal }) => {
      const control =
        queryClient.getQueryData<Awaited<ReturnType<typeof sessionApi.acquire>>>(key) ??
        acquire.data;
      if (!control) throw new Error("CONTROLLER_MISSING");
      return sessionApi.heartbeat(control, signal);
    },
    enabled: Boolean(acquire.data),
    initialData: acquire.data,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) => (query.state.error ? false : 3000),
    refetchIntervalInBackground: true,
  });
  const control = controller.data ?? acquire.data;
  const failure = acquire.error ?? controller.error;
  const active = Boolean(control && !failure && new Date(control.expiresAt).getTime() > Date.now());
  const extension = useQuery({
    networkMode: "always",
    queryKey: ["extension", accountId, instanceId, control?.epoch],
    queryFn: () =>
      control
        ? requestExtension({ type: "status", control })
        : Promise.resolve("disconnected" as const),
    enabled: active,
    retry: false,
    refetchInterval: active ? 4000 : false,
    refetchOnWindowFocus: false,
  });
  const link = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!control || !active) throw new SessionError("CONTROL_CONFLICT");
      const pending = await sessionApi.challenge(control);
      const status = await requestExtension({
        type: "link",
        control,
        challenge: pending.challenge,
      });
      if (status !== "connected") throw new Error("EXTENSION_UNAVAILABLE");
      return status;
    },
    retry: false,
    onSuccess: () => {
      void extension.refetch();
    },
  });
  const latest = useRef(control);
  latest.current = control;
  useEffect(() => {
    const disconnect = () => {
      if (latest.current)
        void requestExtension({ type: "disconnect", control: latest.current }).catch(() => {});
    };
    window.addEventListener("pagehide", disconnect);
    return () => window.removeEventListener("pagehide", disconnect);
  }, []);
  return {
    active,
    control,
    failure,
    acquire,
    controller,
    link,
    connected: active && extension.data === "connected" && !extension.error,
    async release() {
      if (control) {
        await requestExtension({ type: "disconnect", control }).catch(() => {});
        await sessionApi.release(control);
      }
    },
  };
}
