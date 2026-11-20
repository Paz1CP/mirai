"use client";
import { createAuthClient } from "@neon/auth/next";
export const authClient = createAuthClient();

let cached: { token: string; expires: number } | undefined;
let pending: Promise<string | null> | undefined;
let generation = 0;

export function clearAccessToken() {
  generation++;
  cached = undefined;
  pending = undefined;
}

authClient.$store.listen("$sessionSignal", clearAccessToken);

export function accessToken() {
  if (cached && cached.expires > Date.now() + 30_000) return Promise.resolve(cached.token);
  if (pending) return pending;
  const version = generation;
  const request = authClient.token().then(({ data, error }) => {
    if (error || !data?.token || version !== generation) return null;
    try {
      const encoded = data.token.split(".")[1];
      if (!encoded) return data.token;
      const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
      if (typeof payload.exp === "number") cached = { token: data.token, expires: payload.exp * 1000 };
    } catch {
      // An unrecognized token is used once and never cached.
    }
    return data.token;
  }).finally(() => {
    if (pending === request) pending = undefined;
  });
  pending = request;
  return request;
}
