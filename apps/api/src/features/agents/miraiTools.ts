import { createHash, randomUUID } from "node:crypto";
import { FunctionTool } from "@google/adk";
import { z } from "zod";
import {
  applicationListQuerySchema,
  campaignListQuerySchema,
  createCampaignSchema,
  documentRefSchema,
  professionalProfileSchema,
  recordApplicationSchema,
  updateCampaignSchema,
} from "@mirai/contracts";
import type { createResultsRepository } from "../applications/resultsRepository.js";
import type { createCvRepository } from "../cvs/cvRepository.js";
import type { createProfileRepository } from "../profiles/profileRepository.js";

type Results = ReturnType<typeof createResultsRepository>;
type Profiles = ReturnType<typeof createProfileRepository>;
type Cvs = ReturnType<typeof createCvRepository>;
export interface AgentScope {
  accountId: string;
  chatId: string;
  commandId: string;
  referencedQueued?: string;
  campaignId?: string;
  applicationLimitReached?: boolean;
  runningCampaignId?: string;
}
const criteriaSchema = z
  .object({
    criterion: z.string().trim().min(1).max(120),
    condition: z.string().trim().min(1).max(2000),
  })
  .array()
  .max(40);

function applicationId(
  campaignId: string,
  url: string,
  platform: string | null,
  attemptKey?: string,
) {
  const link = new URL(url);
  link.hash = "";
  const hash = createHash("sha256")
    .update(JSON.stringify([campaignId, link.href, platform?.trim().toLowerCase(), attemptKey]))
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function miraiTools(
  scope: AgentScope,
  results: Results,
  profiles: Profiles,
  cvs: Cvs,
  communicationAllowed: boolean,
) {
  const { accountId, chatId } = scope;
  return [
    new FunctionTool({
      name: "getCandidateContext",
      description:
        "Read current professional facts, job preferences, restrictions and this turn's permission.",
      async execute() {
        const [candidate, settings] = await Promise.all([
          profiles.readProfile(accountId),
          profiles.readPreferences(accountId),
        ]);
        return {
          profile: candidate.profile,
          preferences: settings.preferences,
          permissions: { allow_communication: communicationAllowed },
        };
      },
    }),
    new FunctionTool({
      name: "listDocuments",
      description:
        "List editable CVs and original files. Set includeProfiles to true only when the entire request is a local inventory, summary or comparison. That mode gathers the facts for your final answer.",
      parameters: z.object({ includeProfiles: z.boolean().optional() }),
      async execute({ includeProfiles }) {
        const [library, originals, candidate, review] = await Promise.all([
          cvs.library(accountId, false),
          cvs.originals(accountId),
          includeProfiles ? profiles.readProfile(accountId) : undefined,
          includeProfiles ? cvs.reviewDocuments(accountId) : undefined,
        ]);
        const cvProfiles = review?.flatMap(({ id, profile }) => {
          const { data } = professionalProfileSchema.safeParse(profile);
          return data ? [{
            id,
            headline: data.headline,
            summary: data.summary,
            experience: data.experience.map(({ title, company }) => ({ title, company })),
          }] : [];
        });
        const originalLinks = review?.flatMap(({ id, originalId }) =>
          originalId ? [{ originalId, linkedCvId: id }] : [],
        );
        return {
          cvs: library.documents.map(({ id, name, specialization, kind }) => ({
            id,
            name,
            specialization,
            kind,
          })),
          defaultId: library.defaultId,
          primaryId: library.documents.find(({ kind }) => kind === "primary")?.id ?? null,
          originals: originals.map(({ id, name, format }) => ({ id, name, format })),
          ...(includeProfiles && {
            candidateProfile: candidate?.profile ?? null,
            cvProfiles,
            originalLinks,
          }),
        };
      },
    }),
    new FunctionTool({
      name: "getDocument",
      description:
        "Read one document's saved professional data. Originals include a linked editable CV if already extracted. An unlinked original has no extracted contents available here.",
      parameters: documentRefSchema,
      async execute({ id, kind }) {
        if (kind === "cv") {
          const { name, specialization, profile } = await cvs.read(accountId, id);
          return { id, kind, name, specialization, profile };
        }
        const { name, key } = await cvs.original(accountId, id);
        const linked = await cvs.linkedCv(accountId, key);
        return { id, kind, name, linkedCvId: linked?.id ?? null, profile: linked?.profile ?? null };
      },
    }),
    new FunctionTool({
      name: "createCampaign",
      description:
        "Create a genuinely new campaign for a new mandate. This never resumes a stopped campaign. Omit criteria or maxApplications if not specified.",
      parameters: createCampaignSchema.omit({ id: true }).extend({
        criteria: criteriaSchema.nullish(),
        maxApplications: createCampaignSchema.shape.maxApplications.optional(),
      }),
      async execute({ criteria, maxApplications, ...input }) {
        const campaign = await results.createCampaign(accountId, chatId, {
          ...input,
          id: randomUUID(),
          maxApplications: maxApplications ?? null,
          criteria: Object.fromEntries(
            (criteria ?? []).map(({ criterion, condition }) => [criterion, condition]),
          ),
        });
        scope.campaignId = campaign.id;
        scope.runningCampaignId = campaign.id;
        scope.applicationLimitReached = false;
        return campaign;
      },
    }),
    new FunctionTool({
      name: "listCampaigns",
      description: "List campaigns in this chat without selecting or resuming any of them.",
      parameters: z.object({ page: z.number().int().positive().optional() }),
      execute: ({ page }) => results.listCampaigns(accountId, campaignListQuerySchema.parse({ chatSessionId: chatId, page })),
    }),
    new FunctionTool({
      name: "selectCampaign",
      description: "Select an existing campaign by ID for review. Set resume to true only when the user explicitly requests continuing that campaign.",
      parameters: z.object({ id: z.uuid(), resume: z.boolean().optional() }),
      async execute({ id, resume }) {
        const campaign = await results.campaignForChat(accountId, chatId, id);
        if (!campaign) return { error: "CAMPAIGN_NOT_FOUND" };
        const budget = await results.campaignBudget(accountId, id);
        const selected = resume && campaign.status === "stopped"
          ? await results.transitionCampaign(accountId, id, "stopped", "running", null)
          : campaign;
        if (!selected) return { error: "CAMPAIGN_NOT_RUNNING" };
        scope.campaignId = id;
        if (resume && selected.status === "running") scope.runningCampaignId = id;
        scope.applicationLimitReached = budget.reached;
        return { ...selected, budget };
      },
    }),
    new FunctionTool({
      name: "updateCampaign",
      description: "Save a change to the active campaign mandate, criteria, limit, or final state.",
      parameters: z.object({
        ...updateCampaignSchema.shape,
        criteria: criteriaSchema.nullish(),
        status: z.enum(["completed", "failed"]).optional(),
        statusReason: z.string().trim().min(1).max(20000).nullish(),
      }),
      async execute({ status, statusReason, criteria, ...input }) {
        if (!scope.campaignId) throw new Error("CAMPAIGN_REQUIRED");
        if (scope.applicationLimitReached && (input.maxApplications !== undefined || status === "failed"))
          return { error: "APPLICATION_LIMIT_REACHED", completeCampaign: true };
        const updated = await results.updateCampaign(accountId, chatId, scope.campaignId, {
          ...input,
          ...(criteria
            ? {
                criteria: Object.fromEntries(
                  criteria.map(({ criterion, condition }) => [criterion, condition]),
                ),
              }
            : {}),
        });
        scope.applicationLimitReached ||= (await results.campaignBudget(accountId, scope.campaignId)).reached;
        if (status) {
          const result = await results.transitionCampaign(
            accountId,
            scope.campaignId,
            "running",
            status,
            statusReason ?? null,
          );
          if (result && scope.runningCampaignId === result.id) scope.runningCampaignId = undefined;
          return result;
        }
        return updated;
      },
    }),
    new FunctionTool({
      name: "recordApplication",
      description:
        "Record each observed result immediately after the action, before any further browsing. budget.reached means finish the campaign and report. Keep the returned ID for reconciliation and use a distinct attemptKey only for a genuinely separate attempt.",
      parameters: z.object({
        ...recordApplicationSchema.shape,
        id: z.uuid().optional(),
        campaignId: z.uuid().optional(),
        attemptKey: z.string().trim().min(1).max(120).optional(),
      }),
      async execute({ id, campaignId = scope.campaignId, attemptKey, ...input }) {
        if (!campaignId || campaignId !== scope.campaignId) throw new Error("CAMPAIGN_REQUIRED");
        const result = await results.recordApplication(
          accountId,
          chatId,
          recordApplicationSchema.parse({
            ...input,
            campaignId,
            id: id ?? applicationId(campaignId, input.jobUrl, input.platform, attemptKey),
          }),
        );
        scope.applicationLimitReached ||= result.budget.reached;
        return result;
      },
    }),
    new FunctionTool({
      name: "listApplications",
      description: "Read previously recorded application outcomes to avoid accidental repetition.",
      parameters: z.object({
        campaignId: z.uuid().optional(),
        q: z.string().max(240).optional(),
        page: z.number().int().positive().optional(),
      }),
      execute(input) {
        return results.listApplications(
          accountId,
          applicationListQuerySchema.parse({
            campaignId: input.campaignId ?? scope.campaignId,
            page: input.page,
            q: input.q,
          }),
        );
      },
    }),
    new FunctionTool({
      name: "getApplication",
      description: "Read one saved outcome by its stable ID before retrying or updating.",
      parameters: z.object({ id: z.uuid() }),
      execute: ({ id }) => results.getApplication(accountId, id),
    }),
  ];
}
