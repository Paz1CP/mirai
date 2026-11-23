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
import { executionHandoffKey } from "../sessions/controllerRepository.js";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const interruptedReason = "The previous execution ended without a running controller.";
export const executionLockKey = (accountId: string, chatId: string) =>
  JSON.stringify(["mirai-execution", accountId, chatId]);
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
  async function campaignForChat(accountId: string, chatId: string, id: string) {
    const campaign = await getCampaign(accountId, id);
    return campaign?.chatSessionId === chatId ? campaign : null;
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

  function stopInterruptedCampaigns(accountId: string) {
    return db.transaction(async (tx) => {
      const handoff = await tx.execute<{ available: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${executionHandoffKey(accountId)},0)) as available`,
      );
      if (!handoff.rows[0]?.available) return;
      const running = and(eq(campaigns.accountId, accountId), eq(campaigns.status, "running"));
      const chats = await tx
        .selectDistinct({ chatId: campaigns.chatSessionId })
        .from(campaigns)
        .where(running);
      const interrupted = [];
      for (const { chatId } of chats) {
        const lock = await tx.execute<{ available: boolean }>(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${executionLockKey(accountId, chatId)},0)) as available`,
        );
        if (lock.rows[0]?.available) interrupted.push(chatId);
      }
      if (!interrupted.length) return;
      const reached = sql`${campaigns.maxApplications} is not null and (
        select count(*) from ${applications}
        where ${applications.campaignId} = ${campaigns.id}
          and ${applications.accountId} = ${campaigns.accountId}
          and (${applications.status} in ('confirmed','unconfirmed') or ${applications.submittedAt} is not null)
      ) >= ${campaigns.maxApplications}`;
      const affected = await tx
        .update(campaigns)
        .set({
          status: sql`case when ${reached} then 'completed' else 'stopped' end`,
          statusReason: sql`case when ${reached} then 'Application limit reached.' else ${interruptedReason} end`,
          updatedAt: new Date(),
          endedAt: sql`case when ${reached} then now() else null end`,
        })
        .where(and(running, inArray(campaigns.chatSessionId, interrupted)))
        .returning({ id: campaigns.id });
      if (affected.length) await tx.execute(notify(accountId));
    });
  }

  async function executionActive(accountId: string, chatId: string) {
    const { rows } = await db.execute<{ active: boolean }>(sql`
      select exists(select 1 from pg_catalog.pg_locks where locktype = 'advisory'
        and database = (select oid from pg_catalog.pg_database where datname = current_database())
        and objsubid = 1 and granted and (
          (mode = 'ExclusiveLock' and (classid::bigint << 32 | objid::bigint) =
            hashtextextended(${executionLockKey(accountId, chatId)},0))
          or (mode = 'ShareLock' and (classid::bigint << 32 | objid::bigint) =
            hashtextextended(${executionHandoffKey(accountId)},0))
        )
      ) as active
    `);
    return rows[0]?.active === true;
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

  async function submissionBudget(
    dbOrTx: Database | Transaction,
    accountId: string,
    id: string,
    max: number | null,
  ) {
    const [row] = await dbOrTx
      .select({ submitted: count() })
      .from(applications)
      .where(
        and(
          eq(applications.accountId, accountId),
          eq(applications.campaignId, id),
          or(
            inArray(applications.status, ["confirmed", "unconfirmed"]),
            sql`${applications.submittedAt} IS NOT NULL`,
          ),
        ),
      );
    const submitted = row?.submitted ?? 0;
    return { submitted, max, reached: max !== null && submitted >= max };
  }

  async function campaignBudget(accountId: string, id: string) {
    const [campaign] = await db
      .select({ max: campaigns.maxApplications })
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.accountId, accountId)));
    if (!campaign) throw new ResultConflict("CAMPAIGN_NOT_FOUND");
    return submissionBudget(db, accountId, id, campaign.max);
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
        .select({
          title: campaigns.title,
          status: campaigns.status,
          limit: campaigns.maxApplications,
        })
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
      const outcome = async (row: typeof applications.$inferSelect) => {
        const { accountId: _owner, documentRefs: _refs, ...application } = row;
        void _owner;
        void _refs;
        return {
          ...applicationDto({ ...application, campaignTitle: campaign.title }),
          budget: await submissionBudget(tx, accountId, input.campaignId, campaign.limit),
        };
      };
      const ownedApplication = and(
        eq(applications.id, input.id),
        eq(applications.accountId, accountId),
        eq(applications.campaignId, input.campaignId),
      );
      const [previous] = await tx.select().from(applications).where(ownedApplication);
      if (
        campaign.status !== "running" &&
        !["unconfirmed", "pending_review"].includes(previous?.status ?? "")
      ) {
        if (previous?.status === input.status) return outcome(previous);
        throw new ResultConflict("CAMPAIGN_NOT_RUNNING");
      }
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
        return outcome(existing);
      }
      await tx.execute(notify(accountId));
      return outcome(row);
    });
  }

  return {
    getDashboardSummary,
    listCampaigns,
    getCampaign,
    campaignForChat,
    createCampaign,
    updateCampaign,
    transitionCampaign,
    listApplications,
    getApplication,
    recordApplication,
    campaignBudget,
    stopInterruptedCampaigns,
    executionActive,
  };
}
