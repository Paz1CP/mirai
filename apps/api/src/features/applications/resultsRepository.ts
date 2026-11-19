import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  type Application,
  type ApplicationListQuery,
  type CampaignListQuery,
  type CampaignStatus,
  type CreateCampaign,
  type DocumentRef,
  type RecordApplication,
  type UpdateCampaign,
} from "@mirai/contracts";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { campaigns } from "../campaigns/schema.js";
import { cvDocuments, originalDocuments } from "../cvs/schema.js";
import { applications } from "./schema.js";

type Database = ReturnType<typeof createDatabase>["db"];
const interruptedReason = "The previous execution ended without a running controller.";
export const executionLockKey = (accountId: string) => `mirai-execution:${accountId}`;
export class ResultConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function campaignDto(row: typeof campaigns.$inferSelect) {
  const { accountId, createdAt, updatedAt, startedAt, endedAt, ...result } = row;
  void accountId;
  return {
    ...result,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    startedAt: startedAt?.toISOString() ?? null,
    endedAt: endedAt?.toISOString() ?? null,
  };
}

const applicationColumns = {
  id: applications.id,
  campaignId: applications.campaignId,
  companyName: applications.companyName,
  jobTitle: applications.jobTitle,
  jobUrl: applications.jobUrl,
  platform: applications.platform,
  location: applications.location,
  status: applications.status,
  statusReason: applications.statusReason,
  createdAt: applications.createdAt,
  updatedAt: applications.updatedAt,
  submittedAt: applications.submittedAt,
  campaignTitle: campaigns.title,
};
const campaignJoin = and(
  eq(applications.accountId, campaigns.accountId),
  eq(applications.campaignId, campaigns.id),
);
type ApplicationRow = Omit<Application, "createdAt" | "updatedAt" | "submittedAt"> & {
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
};
function applicationDto(row: ApplicationRow): Application {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}

function tally(rows: { status: typeof applications.$inferSelect.status; total: number }[]) {
  const counts = { confirmed: 0, unconfirmed: 0, pending_review: 0, failed: 0, skipped: 0 };
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

export function createResultsRepository(db: Database) {
  async function resolveDocuments(accountId: string, refs: DocumentRef[]) {
    const cvIds = refs.filter((ref) => ref.kind === "cv").map((ref) => ref.id);
    const originalIds = refs.filter((ref) => ref.kind === "original").map((ref) => ref.id);
    const [cvs, originals] = await Promise.all([
      cvIds.length
        ? db
            .select({ id: cvDocuments.id, name: cvDocuments.name })
            .from(cvDocuments)
            .where(and(eq(cvDocuments.accountId, accountId), inArray(cvDocuments.id, cvIds)))
        : [],
      originalIds.length
        ? db
            .select({ id: originalDocuments.id, name: originalDocuments.name })
            .from(originalDocuments)
            .where(
              and(
                eq(originalDocuments.accountId, accountId),
                inArray(originalDocuments.id, originalIds),
              ),
            )
        : [],
    ]);
    return refs.flatMap((ref) => {
      const document = (ref.kind === "cv" ? cvs : originals).find((item) => item.id === ref.id);
      return document ? [{ ...ref, name: document.name }] : [];
    });
  }

  async function listApplications(accountId: string, query: ApplicationListQuery) {
    const search = query.q ? `%${query.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
    const where = and(
      eq(applications.accountId, accountId),
      query.campaignId ? eq(applications.campaignId, query.campaignId) : undefined,
      query.status ? eq(applications.status, query.status) : undefined,
      search
        ? or(
            sql`${applications.companyName} ILIKE ${search}`,
            sql`${applications.jobTitle} ILIKE ${search}`,
            sql`${applications.platform} ILIKE ${search}`,
            sql`${applications.location} ILIKE ${search}`,
          )
        : undefined,
    );
    const sort = query.direction === "asc" ? asc : desc;
    const [rows, [total]] = await Promise.all([
      db
        .select(applicationColumns)
        .from(applications)
        .innerJoin(campaigns, campaignJoin)
        .where(where)
        .orderBy(sort(applications[query.sort]), asc(applications.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(applications).where(where),
    ]);
    return { items: rows.map(applicationDto), total: total?.total ?? 0 };
  }

  async function getApplication(accountId: string, id: string) {
    const [row] = await db
      .select({ ...applicationColumns, documentRefs: applications.documentRefs })
      .from(applications)
      .innerJoin(campaigns, campaignJoin)
      .where(and(eq(applications.accountId, accountId), eq(applications.id, id)));
    if (!row) return null;
    const { documentRefs, ...application } = row;
    return {
      ...applicationDto(application),
      documents: await resolveDocuments(accountId, documentRefs),
    };
  }

  async function listCampaigns(accountId: string, query: CampaignListQuery) {
    const where = and(
      eq(campaigns.accountId, accountId),
      query.status ? eq(campaigns.status, query.status) : undefined,
      query.chatSessionId ? eq(campaigns.chatSessionId, query.chatSessionId) : undefined,
    );
    const [rows, [total]] = await Promise.all([
      db
        .select()
        .from(campaigns)
        .where(where)
        .orderBy(desc(campaigns.updatedAt), asc(campaigns.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(campaigns).where(where),
    ]);
    const counts = rows.length
      ? await db
          .select({
            campaignId: applications.campaignId,
            status: applications.status,
            total: count(),
          })
          .from(applications)
          .where(
            and(
              eq(applications.accountId, accountId),
              inArray(
                applications.campaignId,
                rows.map((row) => row.id),
              ),
            ),
          )
          .groupBy(applications.campaignId, applications.status)
      : [];
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        ...campaignDto(row),
        counts: tally(counts.filter((entry) => entry.campaignId === row.id)),
      })),
    };
  }

  async function latestChatCampaign(accountId: string, chatId: string) {
    const [campaign] = await db
      .select({ id: campaigns.id, status: campaigns.status })
      .from(campaigns)
      .where(and(eq(campaigns.accountId, accountId), eq(campaigns.chatSessionId, chatId)))
      .orderBy(desc(campaigns.updatedAt), asc(campaigns.id))
      .limit(1);
    return campaign ?? null;
  }

  async function getCampaign(accountId: string, id: string) {
    const [row] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.accountId, accountId), eq(campaigns.id, id)));
    if (!row) return null;
    const counts = await db
      .select({ status: applications.status, total: count() })
      .from(applications)
      .where(and(eq(applications.accountId, accountId), eq(applications.campaignId, id)))
      .groupBy(applications.status);
    return { ...campaignDto(row), counts: tally(counts) };
  }

  async function getDashboardSummary(accountId: string) {
    const [applicationsByStatus, campaignsByStatus, recent] = await Promise.all([
      db
        .select({ status: applications.status, total: count() })
        .from(applications)
        .where(eq(applications.accountId, accountId))
        .groupBy(applications.status),
      db
        .select({ status: campaigns.status, total: count() })
        .from(campaigns)
        .where(eq(campaigns.accountId, accountId))
        .groupBy(campaigns.status),
      listApplications(accountId, { page: 1, pageSize: 5, sort: "updatedAt", direction: "desc" }),
    ]);
    const campaignCounts = { running: 0, stopped: 0, completed: 0, failed: 0 };
    for (const row of campaignsByStatus) campaignCounts[row.status] = row.total;
    return { counts: tally(applicationsByStatus), campaignCounts, recent: recent.items };
  }

  function notify(accountId: string) {
    return sql`select pg_notify('mirai_results', ${JSON.stringify({ accountId })})`;
  }

  function stopInterruptedCampaigns(accountId: string, leaseAlreadyHeld = false) {
    return db.transaction(async (tx) => {
      if (!leaseAlreadyHeld) {
        const lock = await tx.execute<{ available: boolean }>(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${executionLockKey(accountId)},0)) as available`,
        );
        if (!lock.rows[0]?.available) return;
      }
      const affected = await tx
        .update(campaigns)
        .set({
          status: "stopped",
          statusReason: interruptedReason,
          updatedAt: new Date(),
          endedAt: null,
        })
        .where(and(eq(campaigns.accountId, accountId), eq(campaigns.status, "running")))
        .returning({ id: campaigns.id });
      if (affected.length) await tx.execute(notify(accountId));
    });
  }

  async function signalStop(accountId: string, chatId: string) {
    await db.execute(
      sql`select pg_notify('mirai_execution_stop', ${JSON.stringify([accountId, chatId])})`,
    );
  }

  async function createCampaign(accountId: string, chatSessionId: string, input: CreateCampaign) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(campaigns)
        .values({ ...input, accountId, chatSessionId, status: "running", startedAt: new Date() })
        .onConflictDoNothing({ target: campaigns.id })
        .returning();
      if (row) {
        await tx.execute(notify(accountId));
        return campaignDto(row);
      }
      const [existing] = await tx
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, input.id),
            eq(campaigns.accountId, accountId),
            eq(campaigns.chatSessionId, chatSessionId),
          ),
        );
      if (!existing) throw new ResultConflict("CAMPAIGN_CONFLICT");
      return campaignDto(existing);
    });
  }

  async function updateCampaign(
    accountId: string,
    chatSessionId: string,
    id: string,
    input: UpdateCampaign,
  ) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(campaigns)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(campaigns.accountId, accountId),
            eq(campaigns.chatSessionId, chatSessionId),
            eq(campaigns.id, id),
            eq(campaigns.status, "running"),
          ),
        )
        .returning();
      if (!row) throw new ResultConflict("CAMPAIGN_NOT_RUNNING");
      await tx.execute(notify(accountId));
      return campaignDto(row);
    });
  }

  async function transitionCampaign(
    accountId: string,
    id: string,
    from: CampaignStatus,
    to: CampaignStatus,
    reason: string | null,
  ) {
    return db.transaction(async (tx) => {
      const terminal = to === "failed" || to === "completed";
      const [row] = await tx
        .update(campaigns)
        .set({
          status: to,
          statusReason: reason,
          updatedAt: new Date(),
          endedAt: terminal ? new Date() : null,
        })
        .where(
          and(eq(campaigns.accountId, accountId), eq(campaigns.id, id), eq(campaigns.status, from)),
        )
        .returning();
      if (row) await tx.execute(notify(accountId));
      return row ? campaignDto(row) : null;
    });
  }

  async function recordApplication(
    accountId: string,
    chatSessionId: string,
    input: RecordApplication,
  ) {
    const documentRefs = (await resolveDocuments(accountId, input.documentRefs)).map(
      ({ id, kind }) => ({ id, kind }),
    );
    return db.transaction(async (tx) => {
      const [campaign] = await tx
        .select({ title: campaigns.title })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.accountId, accountId),
            eq(campaigns.chatSessionId, chatSessionId),
            eq(campaigns.id, input.campaignId),
          ),
        )
        .for("update");
      if (!campaign) throw new ResultConflict("CAMPAIGN_NOT_FOUND");
      const values = {
        ...input,
        accountId,
        documentRefs,
        submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
      };
      const submittedAt = sql`coalesce(${applications.submittedAt}, excluded.submitted_at)`;
      const [row] = await tx
        .insert(applications)
        .values(values)
        .onConflictDoUpdate({
          target: applications.id,
          set: {
            companyName: values.companyName,
            jobTitle: values.jobTitle,
            jobUrl: values.jobUrl,
            platform: values.platform,
            location: values.location,
            status: values.status,
            statusReason: values.statusReason,
            documentRefs: values.documentRefs,
            submittedAt,
            updatedAt: new Date(),
          },
          setWhere: and(
            eq(applications.accountId, accountId),
            eq(applications.campaignId, input.campaignId),
            sql`(${applications.status} <> 'confirmed' OR ${input.status} = 'confirmed')`,
            sql`(
              ${applications.companyName}, ${applications.jobTitle}, ${applications.jobUrl},
              ${applications.platform}, ${applications.location}, ${applications.status},
              ${applications.statusReason}, ${applications.documentRefs}, ${applications.submittedAt}
            ) IS DISTINCT FROM (
              excluded.company_name, excluded.job_title, excluded.job_url,
              excluded.platform, excluded.location, excluded.status,
              excluded.status_reason, excluded.document_refs, ${submittedAt}
            )`,
          ),
        })
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(applications)
          .where(
            and(
              eq(applications.id, input.id),
              eq(applications.accountId, accountId),
              eq(applications.campaignId, input.campaignId),
            ),
          );
        if (!existing) throw new ResultConflict("APPLICATION_CONFLICT");
        const { accountId: _owner, documentRefs: _refs, ...application } = existing;
        void _owner;
        void _refs;
        return applicationDto({ ...application, campaignTitle: campaign.title });
      }
      await tx.execute(notify(accountId));
      const { accountId: _owner, documentRefs: _refs, ...application } = row;
      void _owner;
      void _refs;
      return applicationDto({ ...application, campaignTitle: campaign.title });
    });
  }

  return {
    getDashboardSummary,
    listCampaigns,
    latestChatCampaign,
    getCampaign,
    createCampaign,
    updateCampaign,
    transitionCampaign,
    listApplications,
    getApplication,
    recordApplication,
    stopInterruptedCampaigns,
    signalStop,
  };
}
