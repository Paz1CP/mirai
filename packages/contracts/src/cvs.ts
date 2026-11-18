import { z } from "zod";
import { cvExtractionSchema, professionalProfileSchema } from "./profile.js";
import { documentLimits } from "./documents.js";

const specialization = z.string().trim().max(120);
const revision = z.string().min(1).max(80);
export const cvMetadataSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  specialization,
});
export const cvSummarySchema = cvMetadataSchema.extend({
  id: z.uuid(),
  kind: z.enum(["primary", "variant"]),
  hasSource: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revision,
});
export const cvDetailSchema = cvSummarySchema.extend({ profile: professionalProfileSchema });
export const cvLibrarySchema = z.strictObject({
  documents: cvSummarySchema.array(),
  defaultId: z.uuid().nullable(),
  canCreatePrimary: z.boolean(),
  cleanupPending: z.boolean(),
});
export const cvDuplicateSchema = cvMetadataSchema.extend({ id: z.uuid(), sourceId: z.uuid() });
export const cvUpdateSchema = cvMetadataSchema.partial().extend({
  revision,
  profile: professionalProfileSchema.optional(),
});
export const cvExtractSchema = z.strictObject({ language: z.enum(["ES", "EN"]) });
export const cvImportSchema = cvMetadataSchema.extend({
  id: z.uuid(),
  profile: professionalProfileSchema,
});
export const cvReplaceSchema = z.strictObject({
  operationId: z.uuid(),
  id: z.uuid(),
  revision,
  profile: professionalProfileSchema,
});
export const cvExtractionResponseSchema = cvExtractionSchema.pick({ profile: true });
export const cvRemovalSchema = z.strictObject({ cleanupPending: z.boolean() });
export const cvReplacementSchema = cvRemovalSchema.extend({ document: cvDetailSchema });
export const cvAccessSchema = z.strictObject({ url: z.url() });
export const originalDocumentSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  format: z.enum(["pdf", "docx"]),
  createdAt: z.iso.datetime(),
});
export const originalDocumentsSchema = originalDocumentSchema.array();
export const originalUploadIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(documentLimits.count)
  .refine((ids) => new Set(ids).size === ids.length);
export const cvErrorSchema = z.object({ error: z.object({ code: z.string() }) });

export type CvSummary = z.infer<typeof cvSummarySchema>;
export type CvDetail = z.infer<typeof cvDetailSchema>;
export type OriginalDocument = z.infer<typeof originalDocumentSchema>;
export type CvUpdate = z.infer<typeof cvUpdateSchema>;
export type CvDuplicate = z.infer<typeof cvDuplicateSchema>;
export type CvImport = z.infer<typeof cvImportSchema>;
export type CvReplace = z.infer<typeof cvReplaceSchema>;
