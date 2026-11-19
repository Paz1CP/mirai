import { createHash } from "node:crypto";
import { FunctionTool } from "@google/adk";
import { z } from "zod";
import {
  applicationListQuerySchema,
  createCampaignSchema,
  documentRefSchema,
  recordApplicationSchema,
  updateCampaignSchema,
  type DocumentRef,
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
  campaignId?: string;
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
  prepare: (reference: DocumentRef) => Promise<{ path: string; name: string }>,
) {
  const { accountId, chatId } = scope;
  return [
    new FunctionTool({
      name: "getCandidateContext",
      description:
        "Read current professional facts, job preferences, restrictions and permissions.",
      async execute() {
        const [candidate, settings] = await Promise.all([
          profiles.readProfile(accountId),
          profiles.readPreferences(accountId),
        ]);
        return { profile: candidate.profile, ...settings };
      },
    }),
    new FunctionTool({
      name: "listDocuments",
      description: "List existing editable CVs and original documents available to this candidate.",
      async execute() {
        const [library, originals] = await Promise.all([
          cvs.library(accountId, false),
          cvs.originals(accountId),
        ]);
        return {
          cvs: library.documents.map(({ id, name, specialization, kind }) => ({
            id,
            name,
            specialization,
            kind,
          })),
          defaultId: library.defaultId,
          originals: originals.map(({ id, name, format }) => ({ id, name, format })),
        };
      },
    }),
    new FunctionTool({
      name: "getDocument",
      description:
        "Read one selected document. Editable CVs include professional data. Use prepareAttachment for file content.",
      parameters: documentRefSchema,
      async execute({ id, kind }) {
        if (kind === "cv") {
          const { name, specialization, profile } = await cvs.read(accountId, id);
          return { id, kind, name, specialization, profile };
        }
        const { name } = await cvs.original(accountId, id);
        return { id, kind, name };
      },
    }),
    new FunctionTool({
      name: "prepareAttachment",
      description:
        "Prepare the selected original or Mirai Standard PDF for browser_file_upload. Use the returned path exactly.",
      parameters: documentRefSchema,
      execute: (reference) => prepare(reference),
    }),
    new FunctionTool({
      name: "createCampaign",
      description:
        "Create a campaign before working on the delegated mandate. Provide null for maxApplications when the user set no limit.",
      parameters: createCampaignSchema.omit({ id: true }).extend({ criteria: criteriaSchema }),
      async execute({ criteria, ...input }) {
        if (scope.campaignId) {
          const existing = await results.getCampaign(accountId, scope.campaignId);
          if (existing?.status === "running") return existing;
          throw new Error("EXPLICIT_RESUME_REQUIRED");
        }
        const campaign = await results.createCampaign(accountId, chatId, {
          ...input,
          id: scope.commandId,
          criteria: Object.fromEntries(
            criteria.map(({ criterion, condition }) => [criterion, condition]),
          ),
        });
        scope.campaignId = campaign.id;
        return campaign;
      },
    }),
    new FunctionTool({
      name: "updateCampaign",
      description: "Save a change to the active campaign mandate, criteria, limit, or final state.",
      parameters: z.object({
        ...updateCampaignSchema.shape,
        criteria: criteriaSchema.optional(),
        status: z.enum(["completed", "failed"]).optional(),
        statusReason: z.string().trim().min(1).max(20000).optional(),
      }),
      async execute({ status, statusReason, criteria, ...input }) {
        if (!scope.campaignId) throw new Error("CAMPAIGN_REQUIRED");
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
        if (status)
          return await results.transitionCampaign(
            accountId,
            scope.campaignId,
            "running",
            status,
            statusReason ?? null,
          );
        return updated;
      },
    }),
    new FunctionTool({
      name: "recordApplication",
      description:
        "Record an observed outcome. Use the returned ID to update it. Keep URL and platform stable for retries. For a deliberate separate attempt to the same listing, set a distinct attemptKey.",
      parameters: z.object({
        ...recordApplicationSchema.shape,
        id: z.uuid().optional(),
        campaignId: z.uuid().optional(),
        attemptKey: z.string().trim().min(1).max(120).optional(),
      }),
      execute({ id, campaignId = scope.campaignId, attemptKey, ...input }) {
        if (!campaignId || campaignId !== scope.campaignId) throw new Error("CAMPAIGN_REQUIRED");
        return results.recordApplication(
          accountId,
          chatId,
          recordApplicationSchema.parse({
            ...input,
            campaignId,
            id: id ?? applicationId(campaignId, input.jobUrl, input.platform, attemptKey),
          }),
        );
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
