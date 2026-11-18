import {
  cvAccessSchema,
  cvDetailSchema,
  cvExtractionResponseSchema,
  cvLibrarySchema,
  cvRemovalSchema,
  cvReplacementSchema,
  originalDocumentsSchema,
  type CvDuplicate,
  type CvReplace,
  type CvUpdate,
} from "@mirai/contracts";
import { request, requestResponse } from "@/features/profiles/profileApi";
import type { Locale } from "@/shared/i18n/catalog";

function upload(file: File, fields: Record<string, string>) {
  const form = new FormData();
  form.set("document", file);
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

export const cvApi = {
  list: async (signal?: AbortSignal) =>
    cvLibrarySchema.parse(await request("cvs", "GET", undefined, signal)),
  detail: async (id: string, signal?: AbortSignal) =>
    cvDetailSchema.parse(await request(`cvs/${id}`, "GET", undefined, signal)),
  duplicate: async (input: CvDuplicate) =>
    cvDetailSchema.parse(await request("cvs/duplicate", "POST", input)),
  save: async (id: string, input: CvUpdate) =>
    cvDetailSchema.parse(await request(`cvs/${id}`, "PATCH", input)),
  remove: async (id: string) => cvRemovalSchema.parse(await request(`cvs/${id}`, "DELETE")),
  defaultVariant: async (id?: string) =>
    request(id ? `cvs/${id}/default` : "cvs/default", id ? "PUT" : "DELETE"),
  extract: async (file: File, locale: Locale) =>
    cvExtractionResponseSchema.parse(
      await request("cvs/import/extract", "POST", upload(file, { language: locale.toUpperCase() })),
    ),
  originals: async (signal?: AbortSignal) =>
    originalDocumentsSchema.parse(await request("cvs/originals", "GET", undefined, signal)),
  removeOriginal: async (id: string) =>
    cvRemovalSchema.parse(await request(`cvs/originals/${id}`, "DELETE")),
  uploadOriginals: async (files: File[], ids: string[]) => {
    const form = new FormData();
    form.set("ids", JSON.stringify(ids));
    for (const file of files) form.append("document", file);
    return originalDocumentsSchema.parse(await request("cvs/originals", "POST", form));
  },
  originalContent: async (id: string, signal?: AbortSignal) =>
    (await requestResponse(`cvs/originals/${id}/content`, "GET", undefined, signal)).blob(),
  linkedCv: async (id: string) =>
    cvDetailSchema.nullable().parse(await request(`cvs/originals/${id}/cv`)),
  scan: async (id: string, locale: Locale) =>
    cvDetailSchema.parse(
      await request(`cvs/originals/${id}/scan`, "POST", { language: locale.toUpperCase() }),
    ),
  replace: async (file: File, input: CvReplace) =>
    cvReplacementSchema.parse(
      await request("cvs/primary/replace", "POST", upload(file, { input: JSON.stringify(input) })),
    ),
  createPrimary: async () => cvDetailSchema.parse(await request("cvs/primary/create", "POST")),
  access: async (id: string) => cvAccessSchema.parse(await request(`cvs/${id}/source/access`)),
  cleanup: async () => cvRemovalSchema.parse(await request("cvs/cleanup", "POST")),
};

export function cvKey(accountId: string, id?: string) {
  return id ? ["cvs", accountId, id] : ["cvs", accountId];
}
