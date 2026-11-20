import { z } from "zod";

export const campaignStatusSchema = z.enum(["running", "stopped", "completed", "failed"]);
export const applicationStatusSchema = z.enum([
  "confirmed",
  "unconfirmed",
  "pending_review",
  "failed",
  "skipped",
]);
const text = z.string().trim().min(1);
const instant = z.iso.datetime();
const reason = text.max(20000).nullable();
const campaignFields = {
  title: text.max(200),
  mandate: text.max(30000),
  criteria: z.record(z.string(), z.json()),
  maxApplications: z.number().int().positive().max(2147483647).nullable(),
};
export const createCampaignSchema = z.object({ id: z.uuid(), ...campaignFields });
export const updateCampaignSchema = z.object(campaignFields).partial();
const tallyShape = {
  confirmed: z.number().int().nonnegative(),
  unconfirmed: z.number().int().nonnegative(),
  pending_review: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
};
export const resultTallySchema = z.object(tallyShape);
export const campaignSchema = createCampaignSchema.extend({
  chatSessionId: text,
  status: campaignStatusSchema,
  statusReason: reason,
  createdAt: instant,
  startedAt: instant.nullable(),
  updatedAt: instant,
  endedAt: instant.nullable(),
});
export const campaignSummarySchema = campaignSchema.extend({ counts: resultTallySchema });
export const documentRefSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["cv", "original"]),
});
const applicationFields = {
  id: z.uuid(),
  campaignId: z.uuid(),
  companyName: text.max(250),
  jobTitle: text.max(250),
  jobUrl: z.url({ protocol: /^https?$/ }).max(4000),
  platform: text.max(150).nullable(),
  location: text.max(250).nullable(),
  status: applicationStatusSchema,
  statusReason: reason,
  submittedAt: instant.nullable(),
};
export const recordApplicationSchema = z
  .object({ ...applicationFields, documentRefs: documentRefSchema.array().max(20) })
  .refine(
    ({ status, statusReason }) =>
      status === "confirmed" || status === "skipped" || Boolean(statusReason),
    { path: ["statusReason"], message: "Describe the observed outcome." },
  );
export const applicationSchema = z.object({
  ...applicationFields,
  campaignTitle: text,
  createdAt: instant,
  updatedAt: instant,
});
export const applicationDetailSchema = applicationSchema.extend({
  documents: documentRefSchema.extend({ name: text }).array(),
});
const paging = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const campaignListQuerySchema = z.object({
  ...paging,
  status: campaignStatusSchema.optional(),
  chatSessionId: text.max(256).optional(),
});
export const applicationListQuerySchema = z.object({
  ...paging,
  campaignId: z.uuid().optional(),
  status: applicationStatusSchema.optional(),
  q: z.string().trim().max(240).optional(),
  sort: z.enum(["updatedAt", "companyName", "jobTitle", "status"]).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export const campaignPageSchema = z.object({
  items: campaignSummarySchema.array(),
  total: z.number().int().nonnegative(),
});
export const applicationPageSchema = z.object({
  items: applicationSchema.array(),
  total: z.number().int().nonnegative(),
});
export const dashboardSchema = z.object({
  counts: resultTallySchema,
  campaignCounts: z.record(campaignStatusSchema, z.number().int().nonnegative()),
  recent: applicationSchema.array(),
});

export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;
export type CreateCampaign = z.infer<typeof createCampaignSchema>;
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;
export type RecordApplication = z.infer<typeof recordApplicationSchema>;
export type DocumentRef = z.infer<typeof documentRefSchema>;
export type Application = z.infer<typeof applicationSchema>;
export type CampaignSummary = z.infer<typeof campaignSummarySchema>;
