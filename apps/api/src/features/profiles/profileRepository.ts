import { and, eq, sql } from "drizzle-orm";
import { cvDocuments } from "../cvs/schema.js";
import { adoptDocument, queueDocumentCleanup } from "./documentCleanup.js";
import {
  countrySchema,
  preferenceResponseSchema,
  preferencesSchema,
  profileResponseSchema,
  type ProfessionalProfile,
  type JobPreferences,
  type CvExtraction,
  type permissionsSchema,
} from "@mirai/contracts";
import type { z } from "zod";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { candidateProfiles, jobPreferences, geoCountries } from "./schema.js";

export function createProfileRepository(db: ReturnType<typeof createDatabase>["db"]) {
  async function beginExtraction(accountId: string, operationId: string) {
    const rows = await db
      .insert(candidateProfiles)
      .values({ accountId, extractionOperationId: operationId })
      .onConflictDoUpdate({
        target: candidateProfiles.accountId,
        set: { extractionOperationId: operationId },
        setWhere: eq(candidateProfiles.onboardingCompleted, false),
      })
      .returning({ id: candidateProfiles.accountId });
    return rows.length > 0;
  }
  async function completeExtraction(
    accountId: string,
    operationId: string,
    extraction: CvExtraction,
    previousProfile: ProfessionalProfile | null,
  ) {
    const previous = previousProfile === null ? null : JSON.stringify(previousProfile);
    const updated = await db
      .update(candidateProfiles)
      .set({
        extraction,
        profile: sql`CASE WHEN ${candidateProfiles.profile} IS NOT DISTINCT FROM ${previous}::jsonb THEN ${JSON.stringify(extraction.profile)}::jsonb ELSE ${candidateProfiles.profile} END`,
        confirmed: sql`CASE WHEN ${candidateProfiles.profile} IS NOT DISTINCT FROM ${previous}::jsonb THEN false ELSE ${candidateProfiles.confirmed} END`,
        revision: sql`CASE WHEN ${candidateProfiles.profile} IS NOT DISTINCT FROM ${previous}::jsonb THEN gen_random_uuid() ELSE ${candidateProfiles.revision} END`,
        profileUpdatedAt: sql`CASE WHEN ${candidateProfiles.profile} IS NOT DISTINCT FROM ${previous}::jsonb THEN now() ELSE ${candidateProfiles.profileUpdatedAt} END`,
      })
      .where(
        and(
          eq(candidateProfiles.accountId, accountId),
          eq(candidateProfiles.extractionOperationId, operationId),
          eq(candidateProfiles.onboardingCompleted, false),
        ),
      )
      .returning({ accountId: candidateProfiles.accountId });
    return updated.length > 0;
  }
  async function importContext(accountId: string, operationId: string) {
    const [row] = await db
      .select({ profile: candidateProfiles.profile })
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.accountId, accountId),
          eq(candidateProfiles.extractionOperationId, operationId),
        ),
      );
    return row;
  }
  async function attachDocument(
    accountId: string,
    key: string,
    primary: boolean,
    operationId: string,
    name: string = key.endsWith(".pdf") ? "CV.pdf" : "CV.docx",
  ) {
    return db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(candidateProfiles)
        .where(
          and(
            eq(candidateProfiles.accountId, accountId),
            eq(candidateProfiles.extractionOperationId, operationId),
          ),
        )
        .for("update");
      if (!profile) return false;
      const fingerprint = key.match(/[0-9a-f]{64}\.(pdf|docx)$/)?.[0];
      const matches = (current: string | null) =>
        current === key || Boolean(fingerprint && current?.endsWith(fingerprint));
      if (primary ? matches(profile.cvUrl) : profile.evidenceUrls.some(matches)) return true;
      await adoptDocument(tx, accountId, key, name);
      await tx
        .update(candidateProfiles)
        .set(
          primary
            ? { cvUrl: key, revision: sql`gen_random_uuid()` }
            : { evidenceUrls: [...profile.evidenceUrls, key] },
        )
        .where(eq(candidateProfiles.accountId, accountId));
      if (primary) await queueDocumentCleanup(tx, accountId, profile.cvUrl);
      return true;
    });
  }
  async function readProfile(accountId: string) {
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.accountId, accountId));
    return profileResponseSchema.parse({
      revision: row?.revision ?? null,
      profile: row?.profile ?? null,
      extraction: row?.extraction ?? null,
      confirmed: row?.confirmed ?? false,
      onboarding_completed: row?.onboardingCompleted ?? false,
      cv_url: row?.cvUrl ?? null,
      evidence_urls: row?.evidenceUrls ?? [],
    });
  }
  async function saveProfile(accountId: string, profile: ProfessionalProfile, revision?: string) {
    const updated = await db
      .insert(candidateProfiles)
      .values({ accountId, profile })
      .onConflictDoUpdate({
        target: candidateProfiles.accountId,
        set: { profile, revision: sql`gen_random_uuid()`, profileUpdatedAt: sql`now()` },
        ...(revision ? { setWhere: eq(candidateProfiles.revision, revision) } : {}),
      })
      .returning({ id: candidateProfiles.accountId });
    if (!updated.length) return null;
    return readProfile(accountId);
  }
  async function confirm(accountId: string) {
    const [updated] = await db
      .update(candidateProfiles)
      .set({ confirmed: true })
      .where(
        sql`${candidateProfiles.accountId} = ${accountId} AND ${candidateProfiles.profile} IS NOT NULL`,
      )
      .returning({ accountId: candidateProfiles.accountId });
    return Boolean(updated);
  }
  async function completeOnboarding(accountId: string) {
    return db.transaction(async (tx) => {
      const [saved] = await tx
        .update(candidateProfiles)
        .set({ onboardingCompleted: true })
        .where(
          sql`${candidateProfiles.accountId} = ${accountId} AND ${candidateProfiles.confirmed}
          AND NOT ${candidateProfiles.onboardingCompleted}
          AND EXISTS(SELECT 1 FROM ${jobPreferences} WHERE ${jobPreferences.accountId} = ${accountId})`,
        )
        .returning({ profile: candidateProfiles.profile });
      if (!saved) {
        const [profile] = await tx
          .select({ completed: candidateProfiles.onboardingCompleted })
          .from(candidateProfiles)
          .where(eq(candidateProfiles.accountId, accountId));
        return Boolean(profile?.completed);
      }
      await tx
        .insert(cvDocuments)
        .values({ accountId, kind: "primary", name: "CV" })
        .onConflictDoNothing();
      return true;
    });
  }
  async function readPreferences(accountId: string) {
    await db.insert(jobPreferences).values({ accountId }).onConflictDoNothing();
    const [row] = await db
      .select()
      .from(jobPreferences)
      .where(eq(jobPreferences.accountId, accountId));
    if (!row) throw new Error("PREFERENCES_MISSING");
    const {
      accountId: _accountId,
      allow_email,
      allow_job_portals,
      allow_portal_messages,
      ...preferences
    } = row;
    void _accountId;
    return preferenceResponseSchema.parse({
      preferences,
      permissions: { allow_email, allow_job_portals, allow_portal_messages },
    });
  }
  async function countries() {
    return countrySchema
      .array()
      .parse(await db.select().from(geoCountries).orderBy(geoCountries.name));
  }
  async function savePreferences(accountId: string, input: JobPreferences) {
    const preferences = preferencesSchema.parse(input);
    const catalog = await countries();
    if (
      preferences.locations.some(
        (location) =>
          !catalog.some(
            (country) =>
              country.code === location.country &&
              (!location.region || country.regions.includes(location.region)),
          ),
      ) ||
      (preferences.salary_currency &&
        !catalog.some((country) => country.currency === preferences.salary_currency))
    )
      return null;
    await db
      .insert(jobPreferences)
      .values({ accountId, ...preferences })
      .onConflictDoUpdate({ target: jobPreferences.accountId, set: preferences });
    return readPreferences(accountId);
  }
  async function savePermissions(
    accountId: string,
    permissions: Partial<z.infer<typeof permissionsSchema>>,
  ) {
    await db
      .insert(jobPreferences)
      .values({ accountId, ...permissions })
      .onConflictDoUpdate({ target: jobPreferences.accountId, set: permissions });
    return readPreferences(accountId);
  }
  return {
    beginExtraction,
    completeExtraction,
    importContext,
    attachDocument,
    readProfile,
    saveProfile,
    confirm,
    completeOnboarding,
    readPreferences,
    savePreferences,
    savePermissions,
    countries,
  };
}
