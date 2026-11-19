import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  cvDetailSchema,
  cvLibrarySchema,
  cvSummarySchema,
  originalDocumentSchema,
  type CvDuplicate,
  type CvImport,
  type CvReplace,
  type CvUpdate,
  type ProfessionalProfile,
} from "@mirai/contracts";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { adoptDocument, queueDocumentCleanup } from "../profiles/documentCleanup.js";
import { candidateProfiles } from "../profiles/schema.js";
import { cvDocuments, originalDocuments } from "./schema.js";

export class CvError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 409,
  ) {
    super(code);
  }
}

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const { id, kind, name, specialization, createdAt, updatedAt, revision, isDefault, sourceKey } =
  cvDocuments;
const display = {
  id,
  kind,
  name,
  specialization,
  createdAt,
  updatedAt,
  revision,
  isDefault,
  hasSource: sql<boolean>`CASE WHEN ${kind} = 'primary' THEN ${candidateProfiles.cvUrl} IS NOT NULL ELSE ${sourceKey} IS NOT NULL END`,
  profileRevision: candidateProfiles.revision,
  profileUpdatedAt: candidateProfiles.profileUpdatedAt,
};
const ownership = (accountId: string, documentId: string) =>
  and(eq(cvDocuments.accountId, accountId), eq(id, documentId));
const originalOwnership = (accountId: string, documentId: string) =>
  and(eq(originalDocuments.accountId, accountId), eq(originalDocuments.id, documentId));

function originalSummary(row: typeof originalDocuments.$inferSelect) {
  return originalDocumentSchema.parse({
    id: row.id,
    name: row.name,
    format: row.key.endsWith(".pdf") ? "pdf" : "docx",
    createdAt: row.createdAt.toISOString(),
  });
}

function summary(row: {
  id: string;
  kind: "primary" | "variant";
  name: string;
  specialization: string;
  createdAt: Date;
  updatedAt: Date;
  revision: string;
  hasSource: boolean;
  profileRevision: string;
  profileUpdatedAt: Date;
}) {
  const primary = row.kind === "primary";
  return cvSummarySchema.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    specialization: row.specialization,
    createdAt: row.createdAt.toISOString(),
    updatedAt: new Date(
      Math.max(row.updatedAt.getTime(), primary ? row.profileUpdatedAt.getTime() : 0),
    ).toISOString(),
    revision: primary ? `${row.revision}.${row.profileRevision}` : row.revision,
    hasSource: row.hasSource,
  });
}

export function createCvRepository(db: Database) {
  async function originals(accountId: string) {
    const rows = await db
      .select()
      .from(originalDocuments)
      .where(eq(originalDocuments.accountId, accountId))
      .orderBy(desc(originalDocuments.createdAt), originalDocuments.id);
    return rows.map(originalSummary);
  }

  function reviewDocuments(accountId: string) {
    return db
      .select({ id, profile: cvDocuments.profile, originalId: originalDocuments.id })
      .from(cvDocuments)
      .innerJoin(candidateProfiles, eq(candidateProfiles.accountId, cvDocuments.accountId))
      .leftJoin(
        originalDocuments,
        and(
          eq(originalDocuments.accountId, cvDocuments.accountId),
          eq(originalDocuments.key, sql`case when ${kind} = 'primary' then ${candidateProfiles.cvUrl} else ${sourceKey} end`),
        ),
      )
      .where(eq(cvDocuments.accountId, accountId));
  }

  async function original(accountId: string, documentId: string, tx: Database | Transaction = db) {
    const [row] = await tx
      .select()
      .from(originalDocuments)
      .where(originalOwnership(accountId, documentId));
    if (!row) throw new CvError("DOCUMENT_NOT_FOUND", 404);
    return row;
  }

  async function matchingOriginals(
    accountId: string,
    ids: string[],
    tx: Database | Transaction = db,
  ) {
    return tx
      .select()
      .from(originalDocuments)
      .where(and(eq(originalDocuments.accountId, accountId), inArray(originalDocuments.id, ids)));
  }

  async function saveOriginals(
    accountId: string,
    ids: string[],
    uploads: { id: string; key: string; name: string }[],
  ) {
    return db.transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const existing = new Set((await matchingOriginals(accountId, ids, tx)).map((row) => row.id));
      for (const upload of uploads) {
        if (!existing.has(upload.id))
          await adoptDocument(tx, accountId, upload.key, upload.name, upload.id);
      }
      const rows = await matchingOriginals(accountId, ids, tx);
      return rows.map(originalSummary);
    });
  }

  async function linkedCv(accountId: string, key: string, tx: Database | Transaction = db) {
    const [row] = await tx
      .select({ id })
      .from(cvDocuments)
      .innerJoin(candidateProfiles, eq(candidateProfiles.accountId, cvDocuments.accountId))
      .where(
        and(
          eq(cvDocuments.accountId, accountId),
          or(and(eq(kind, "primary"), eq(candidateProfiles.cvUrl, key)), eq(sourceKey, key)),
        ),
      )
      .orderBy(kind, desc(updatedAt), id)
      .limit(1);
    return row ? read(accountId, row.id, tx) : null;
  }

  async function saveScan(accountId: string, documentId: string, profile: ProfessionalProfile) {
    return db.transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const originalFile = await original(accountId, documentId, tx);
      const existing = await linkedCv(accountId, originalFile.key, tx);
      if (existing) return existing;
      const [row] = await tx
        .insert(cvDocuments)
        .values({
          accountId,
          kind: "variant",
          name:
            originalFile.name
              .replace(/\.(pdf|docx)$/i, "")
              .trim()
              .slice(0, 120) || "CV",
          specialization: profile.headline?.trim().slice(0, 120) ?? "",
          profile,
          sourceKey: originalFile.key,
        })
        .returning({ id });
      return read(accountId, row!.id, tx);
    });
  }
  async function library(accountId: string, cleanupPending: boolean) {
    const [rows, [account]] = await Promise.all([
      db
        .select(display)
        .from(cvDocuments)
        .innerJoin(candidateProfiles, eq(candidateProfiles.accountId, cvDocuments.accountId))
        .where(eq(cvDocuments.accountId, accountId))
        .orderBy(kind, desc(updatedAt), id),
      db
        .select({ hasProfile: sql<boolean>`${candidateProfiles.profile} IS NOT NULL` })
        .from(candidateProfiles)
        .where(eq(candidateProfiles.accountId, accountId)),
    ]);
    const primary = rows.find((row) => row.kind === "primary");
    return cvLibrarySchema.parse({
      documents: rows.map(summary),
      defaultId: rows.find((row) => row.isDefault)?.id ?? primary?.id ?? null,
      canCreatePrimary: Boolean(account?.hasProfile && !primary),
      cleanupPending,
    });
  }

  async function read(accountId: string, documentId: string, tx: Database | Transaction = db) {
    const [row] = await tx
      .select({
        ...display,
        variant: cvDocuments.profile,
        primary: candidateProfiles.profile,
      })
      .from(cvDocuments)
      .innerJoin(candidateProfiles, eq(candidateProfiles.accountId, cvDocuments.accountId))
      .where(ownership(accountId, documentId));
    if (!row) throw new CvError("CV_NOT_FOUND", 404);
    return cvDetailSchema.parse({
      ...summary(row),
      profile: row.kind === "primary" ? row.primary : row.variant,
    });
  }

  async function lockAccount(tx: Transaction, accountId: string, requireProfile = true) {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    const [account] = await tx
      .select({
        hasProfile: sql<boolean>`${candidateProfiles.profile} IS NOT NULL`,
        cvUrl: candidateProfiles.cvUrl,
      })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.accountId, accountId))
      .for("update");
    if (!account || (requireProfile && !account.hasProfile)) throw new CvError("PROFILE_REQUIRED");
    return account;
  }

  async function find(accountId: string, documentId: string, tx: Database | Transaction = db) {
    const [row] = await tx
      .select({ id, kind, lastReplacementId: cvDocuments.lastReplacementId })
      .from(cvDocuments)
      .where(ownership(accountId, documentId));
    return row;
  }

  async function createPrimary(accountId: string) {
    return db.transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const [existing] = await tx
        .select({ id })
        .from(cvDocuments)
        .where(and(eq(cvDocuments.accountId, accountId), eq(kind, "primary")));
      if (existing) return read(accountId, existing.id, tx);
      const [row] = await tx
        .insert(cvDocuments)
        .values({ accountId, kind: "primary", name: "CV" })
        .returning({ id });
      return read(accountId, row!.id, tx);
    });
  }

  async function duplicate(accountId: string, { sourceId, ...input }: CvDuplicate) {
    return db.transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const source = await read(accountId, sourceId, tx);
      const existing = await find(accountId, input.id, tx);
      if (existing?.kind === "variant" && input.id !== sourceId)
        return read(accountId, existing.id, tx);
      const [row] = await tx
        .insert(cvDocuments)
        .values({
          ...input,
          accountId,
          kind: "variant",
          profile: source.profile,
        })
        .onConflictDoNothing({ target: id })
        .returning({ id });
      if (!row) throw new CvError("CV_ID_CONFLICT");
      return read(accountId, row.id, tx);
    });
  }

  async function update(accountId: string, documentId: string, input: CvUpdate) {
    return db.transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const current = await read(accountId, documentId, tx);
      if (current.revision !== input.revision) throw new CvError("CV_CONFLICT");
      const primary = current.kind === "primary";
      if (primary && input.profile) {
        await tx
          .update(candidateProfiles)
          .set({
            profile: input.profile,
            revision: sql`gen_random_uuid()`,
            profileUpdatedAt: sql`now()`,
          })
          .where(eq(candidateProfiles.accountId, accountId));
      }
      await tx
        .update(cvDocuments)
        .set({
          name: input.name,
          specialization: input.specialization,
          profile: primary ? undefined : input.profile,
          revision: sql`gen_random_uuid()`,
          updatedAt: sql`now()`,
        })
        .where(ownership(accountId, documentId));
      return read(accountId, documentId, tx);
    });
  }

  async function defaultVariant(accountId: string, documentId?: string) {
    await db.transaction(async (tx) => {
      await lockAccount(tx, accountId);
      if (documentId && (await find(accountId, documentId, tx))?.kind !== "variant") {
        throw new CvError("CV_NOT_FOUND", 404);
      }
      await tx
        .update(cvDocuments)
        .set({ isDefault: false })
        .where(and(eq(cvDocuments.accountId, accountId), eq(isDefault, true)));
      if (documentId)
        await tx
          .update(cvDocuments)
          .set({ isDefault: true })
          .where(ownership(accountId, documentId));
    });
  }

  async function remove(accountId: string, documentId: string) {
    return db.transaction(async (tx) => {
      const account = await lockAccount(tx, accountId);
      const [removed] = await tx
        .delete(cvDocuments)
        .where(ownership(accountId, documentId))
        .returning({ kind, sourceKey });
      if (!removed) throw new CvError("CV_NOT_FOUND", 404);
      const key = removed.kind === "primary" ? account.cvUrl : removed.sourceKey;
      if (removed.kind === "primary") {
        await tx
          .update(candidateProfiles)
          .set({ cvUrl: null, extractionOperationId: null })
          .where(eq(candidateProfiles.accountId, accountId));
      }
      await queueDocumentCleanup(tx, accountId, key);
      return key;
    });
  }

  async function removeOriginal(accountId: string, documentId: string) {
    return db.transaction(async (tx) => {
      await lockAccount(tx, accountId, false);
      const [removed] = await tx
        .delete(originalDocuments)
        .where(originalOwnership(accountId, documentId))
        .returning({ key: originalDocuments.key });
      if (!removed) return null;
      const { key } = removed;
      await tx
        .update(candidateProfiles)
        .set({
          cvUrl: sql`case when ${candidateProfiles.cvUrl} = ${key} then null else ${candidateProfiles.cvUrl} end`,
          evidenceUrls: sql`array_remove(${candidateProfiles.evidenceUrls}, ${key})`,
          revision: sql`gen_random_uuid()`,
        })
        .where(
          and(
            eq(candidateProfiles.accountId, accountId),
            or(
              eq(candidateProfiles.cvUrl, key),
              sql`${key} = any(${candidateProfiles.evidenceUrls})`,
            ),
          ),
        );
      await tx
        .update(cvDocuments)
        .set({ sourceKey: null, revision: sql`gen_random_uuid()` })
        .where(and(eq(cvDocuments.accountId, accountId), eq(sourceKey, key)));
      await queueDocumentCleanup(tx, accountId, key);
      return key;
    });
  }

  async function source(accountId: string, documentId: string) {
    const [row] = await db
      .select({
        key: sql<
          string | null
        >`CASE WHEN ${kind} = 'primary' THEN ${candidateProfiles.cvUrl} ELSE ${sourceKey} END`,
      })
      .from(cvDocuments)
      .innerJoin(candidateProfiles, eq(candidateProfiles.accountId, cvDocuments.accountId))
      .where(ownership(accountId, documentId));
    if (!row?.key) throw new CvError("DOCUMENT_NOT_FOUND", 404);
    return row.key;
  }

  async function imported(accountId: string, documentId: string, tx: Database | Transaction = db) {
    const existing = await find(accountId, documentId, tx);
    if (!existing) return null;
    if (existing.kind !== "variant") throw new CvError("CV_ID_CONFLICT");
    return read(accountId, documentId, tx);
  }

  async function confirmImport(accountId: string, input: CvImport, key: string, name: string) {
    return db.transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const existing = await imported(accountId, input.id, tx);
      if (existing) return existing;
      await adoptDocument(tx, accountId, key, name);
      const [row] = await tx
        .insert(cvDocuments)
        .values({
          ...input,
          accountId,
          kind: "variant",
          sourceKey: key,
        })
        .onConflictDoNothing({ target: id })
        .returning({ id });
      if (!row) throw new CvError("CV_ID_CONFLICT");
      return read(accountId, row.id, tx);
    });
  }

  async function replacement(accountId: string, input: CvReplace, tx: Database | Transaction = db) {
    const row = await find(accountId, input.id, tx);
    if (row?.kind !== "primary") throw new CvError("CV_NOT_FOUND", 404);
    const document = await read(accountId, input.id, tx);
    if (row.lastReplacementId === input.operationId) return document;
    if (document.revision !== input.revision) throw new CvError("CV_CONFLICT");
    return null;
  }

  async function replacePrimary(accountId: string, input: CvReplace, key: string, name: string) {
    return db.transaction(async (tx) => {
      const account = await lockAccount(tx, accountId);
      const existing = await replacement(accountId, input, tx);
      if (existing) return { document: existing, retiredKey: null };
      await adoptDocument(tx, accountId, key, name);
      await tx
        .update(candidateProfiles)
        .set({
          profile: input.profile,
          cvUrl: key,
          extractionOperationId: null,
          revision: sql`gen_random_uuid()`,
          profileUpdatedAt: sql`now()`,
        })
        .where(eq(candidateProfiles.accountId, accountId));
      await tx
        .update(cvDocuments)
        .set({ lastReplacementId: input.operationId, updatedAt: sql`now()` })
        .where(ownership(accountId, input.id));
      await queueDocumentCleanup(tx, accountId, account.cvUrl);
      return { document: await read(accountId, input.id, tx), retiredKey: account.cvUrl };
    });
  }

  return {
    library,
    originals,
    reviewDocuments,
    removeOriginal,
    original,
    matchingOriginals,
    saveOriginals,
    linkedCv,
    saveScan,
    read,
    createPrimary,
    duplicate,
    update,
    defaultVariant,
    remove,
    source,
    imported,
    confirmImport,
    replacement,
    replacePrimary,
  };
}
