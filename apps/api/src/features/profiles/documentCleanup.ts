import { and, count, eq, gt, isNotNull, lte, notExists, or, sql } from "drizzle-orm";
import { documentLimits } from "@mirai/contracts";
import { queuedChatAttachments } from "../agents/schema.js";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { cvDocuments, documentCleanup, originalDocuments } from "../cvs/schema.js";
import { candidateProfiles } from "./schema.js";
import { ExtractionError, type ProfessionalDocument } from "./extractProfile.js";
import type { createDocumentStorage } from "./documentStorage.js";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function lockStoredFiles(tx: Transaction, accountId: string) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`mirai-files:${accountId}`}, 0))`);
}

export async function checkOriginalCapacity(
  db: Database | Transaction,
  accountId: string,
  requested: number,
) {
  if (!requested) return;
  // Older chat records may hold a second copy of a file already in the library.
  const originalCopy = db.select({ id: originalDocuments.id }).from(originalDocuments).where(and(
    eq(originalDocuments.accountId, accountId),
    sql`right(split_part(${originalDocuments.key}, '.', 1), 64) =
      encode(sha256(decode(${queuedChatAttachments.data}, 'base64')), 'hex')`,
  ));
  const [originals, attachments] = await Promise.all([
    db.select({ total: count() }).from(originalDocuments)
      .where(eq(originalDocuments.accountId, accountId)),
    db.select({ total: count() }).from(queuedChatAttachments)
      .where(and(eq(queuedChatAttachments.accountId, accountId),
        or(isNotNull(queuedChatAttachments.name), notExists(originalCopy)))),
  ]);
  if ((originals[0]?.total ?? 0) + (attachments[0]?.total ?? 0) + requested > documentLimits.originals) {
    throw new ExtractionError("ORIGINAL_UPLOAD_LIMIT");
  }
}

export async function queueDocumentCleanup(tx: Transaction, accountId: string, key: string | null) {
  if (key) {
    await tx
      .insert(documentCleanup)
      .values({ key, accountId, dueAt: new Date(0) })
      .onConflictDoNothing();
  }
}

export async function adoptDocument(
  tx: Transaction,
  accountId: string,
  key: string,
  name: string,
  id?: string,
) {
  await lockStoredFiles(tx, accountId);
  await checkOriginalCapacity(tx, accountId, 1);
  const [staged] = await tx
    .delete(documentCleanup)
    .where(
      and(
        eq(documentCleanup.key, key),
        eq(documentCleanup.accountId, accountId),
        gt(documentCleanup.dueAt, sql`clock_timestamp()`),
      ),
    )
    .returning({ key: documentCleanup.key });
  if (!staged) throw new Error("SOURCE_UPLOAD_EXPIRED");
  await tx.insert(originalDocuments).values({ id, accountId, key, name });
}

export function createDocumentCleanup(
  db: Database,
  storage: ReturnType<typeof createDocumentStorage>,
) {
  async function stage(accountId: string, document: ProfessionalDocument) {
    const key = storage.prepare(accountId, document);
    // An unconfirmed upload is collectible only after its bounded upload window.
    await db.insert(documentCleanup).values({
      key,
      accountId,
      dueAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await storage.upload(accountId, key, document);
    return key;
  }

  async function drainDue(accountId: string, onlyKey?: string) {
    const due = and(
      eq(documentCleanup.accountId, accountId),
      lte(documentCleanup.dueAt, sql`clock_timestamp()`),
      onlyKey ? eq(documentCleanup.key, onlyKey) : undefined,
    );
    const rows = await db
      .select({ key: documentCleanup.key })
      .from(documentCleanup)
      .where(due)
      .orderBy(documentCleanup.dueAt, documentCleanup.key)
      .limit(8);
    await Promise.all(
      rows.map(async ({ key }) => {
        try {
          const unreferenced = await db.transaction(async (tx) => {
            const [profile] = await tx
              .select({
                source: candidateProfiles.cvUrl,
                evidence: candidateProfiles.evidenceUrls,
              })
              .from(candidateProfiles)
              .where(eq(candidateProfiles.accountId, accountId))
              .for("update");
            const [variant] = await tx
              .select({ id: cvDocuments.id })
              .from(cvDocuments)
              .where(and(eq(cvDocuments.accountId, accountId), eq(cvDocuments.sourceKey, key)))
              .limit(1);
            const [original] = await tx
              .select({ id: originalDocuments.id })
              .from(originalDocuments)
              .where(
                and(eq(originalDocuments.accountId, accountId), eq(originalDocuments.key, key)),
              );
            if (
              profile?.source !== key &&
              !profile?.evidence.includes(key) &&
              !variant &&
              !original
            )
              return true;
            await tx.delete(documentCleanup).where(and(due, eq(documentCleanup.key, key)));
            return false;
          });
          if (unreferenced) {
            // Retired keys cannot be adopted again, even if storage deletion needs a retry.
            await storage.remove(accountId, key);
            await db.delete(documentCleanup).where(and(due, eq(documentCleanup.key, key)));
          }
        } catch (error) {
          console.warn({
            event: "document_cleanup_pending",
            errorType: error instanceof Error ? error.name : "Unknown",
          });
        }
      }),
    );
    const [remaining] = await db
      .select({ key: documentCleanup.key })
      .from(documentCleanup)
      .where(due)
      .limit(1);
    return Boolean(remaining);
  }

  async function drain(accountId: string, onlyKey?: string) {
    try {
      return await drainDue(accountId, onlyKey);
    } catch (error) {
      console.warn({
        event: "document_cleanup_check_failed",
        errorType: error instanceof Error ? error.name : "Unknown",
      });
      return true;
    }
  }

  async function pending(accountId: string) {
    const [row] = await db
      .select({ key: documentCleanup.key })
      .from(documentCleanup)
      .where(
        and(
          eq(documentCleanup.accountId, accountId),
          lte(documentCleanup.dueAt, sql`clock_timestamp()`),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  return {
    stage,
    drain,
    pending,
    checkOriginalCapacity: (accountId: string, requested: number) =>
      checkOriginalCapacity(db, accountId, requested),
  };
}
