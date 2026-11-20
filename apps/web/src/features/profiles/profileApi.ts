import { z } from "zod";
import {
  countrySchema,
  profileResponseSchema,
  preferenceResponseSchema,
  type ProfessionalProfile,
  type JobPreferences,
  type CommunicationPermission,
} from "@mirai/contracts";
import { accessToken, clearAccessToken } from "@/shared/auth/client";
import type { Locale } from "@/shared/i18n/catalog";

export class ProfileError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export async function request(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
  revision?: string,
) {
  const response = await requestResponse(path, method, body, signal, revision);
  return response.status === 204 ? undefined : response.json();
}

export async function requestResponse(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
  revision?: string,
) {
  const token = await accessToken();
  if (!token) throw new ProfileError("AUTH_REQUIRED");
  const multipart = body instanceof FormData;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000"}/v1/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(revision ? { "If-Match": revision } : {}),
        ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
      signal,
      cache: "no-store",
    },
  );
  if (!response.ok) {
    if (response.status === 401) clearAccessToken();
    const result: unknown = await response.json().catch(() => undefined);
    const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(result);
    throw new ProfileError(parsed.success ? parsed.data.error.code : "REQUEST_FAILED");
  }
  return response;
}
export const profileApi = {
  read: async (signal?: AbortSignal) =>
    profileResponseSchema.parse(await request("profile", "GET", undefined, signal)),
  save: async (profile: ProfessionalProfile, revision: string) =>
    profileResponseSchema.parse(await request("profile", "PUT", profile, undefined, revision)),
  confirm: async () => profileResponseSchema.parse(await request("profile/confirm", "POST")),
  complete: async () => profileResponseSchema.parse(await request("profile/complete", "POST")),
  begin: async (fileCount: number) =>
    z.object({ operationId: z.uuid() }).parse(await request("profile/imports", "POST", { fileCount })),
  extract: async (operationId: string, files: File[], note: string, locale: Locale) => {
    const form = new FormData();
    form.set("operationId", operationId);
    form.set("note", note);
    form.set("language", locale.toUpperCase());
    files.forEach((file, index) => form.append(index === 0 ? "primary" : "evidence", file));
    return profileResponseSchema.parse(await request("profile/extract", "POST", form));
  },
  upload: async (operationId: string, file: File, primary: boolean) => {
    const form = new FormData();
    form.set("operationId", operationId);
    form.set("kind", primary ? "primary" : "evidence");
    form.set("document", file);
    return profileResponseSchema.parse(await request("profile/documents/upload", "POST", form));
  },
  access: async (key: string) =>
    z
      .object({ url: z.url() })
      .parse(await request(`profile/documents/access?key=${encodeURIComponent(key)}`)),
  preferences: async (signal?: AbortSignal) =>
    preferenceResponseSchema.parse(await request("preferences", "GET", undefined, signal)),
  savePreferences: async (preferences: JobPreferences) =>
    preferenceResponseSchema.parse(await request("preferences", "PUT", preferences)),
  permission: async (patch: CommunicationPermission) =>
    preferenceResponseSchema.parse(await request("preferences/permissions", "PATCH", patch)),
  countries: async (signal?: AbortSignal) =>
    countrySchema.array().parse(await request("catalog/countries", "GET", undefined, signal)),
};
