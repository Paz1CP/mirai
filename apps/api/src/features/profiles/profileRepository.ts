import { and, eq, sql } from "drizzle-orm";
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
    await db
      .insert(candidateProfiles)
      .values({ accountId, extractionOperationId: operationId })
      .onConflictDoUpdate({
        target: candidateProfiles.accountId,
        set: { extractionOperationId: operationId },
      });
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
      })
      .where(
        and(
          eq(candidateProfiles.accountId, accountId),
          eq(candidateProfiles.extractionOperationId, operationId),
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
  ) {
    await db.insert(candidateProfiles).values({ accountId }).onConflictDoNothing();
    const attached = await db
      .update(candidateProfiles)
      .set(
        primary
          ? { cvUrl: key }
          : {
              evidenceUrls: sql`ARRAY(SELECT DISTINCT value FROM unnest(${candidateProfiles.evidenceUrls} || ARRAY[${key}]::text[]) AS value)`,
            },
      )
      .where(
        primary
          ? and(
              eq(candidateProfiles.accountId, accountId),
              eq(candidateProfiles.extractionOperationId, operationId),
            )
          : eq(candidateProfiles.accountId, accountId),
      )
      .returning({ id: candidateProfiles.accountId });
    if (primary && !attached.length) {
      await db
        .update(candidateProfiles)
        .set({
          evidenceUrls: sql`ARRAY(SELECT DISTINCT value FROM unnest(${candidateProfiles.evidenceUrls} || ARRAY[${key}]::text[]) AS value)`,
        })
        .where(eq(candidateProfiles.accountId, accountId));
    }
  }
  async function readProfile(accountId: string) {
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.accountId, accountId));
    return profileResponseSchema.parse({
      profile: row?.profile ?? null,
      extraction: row?.extraction ?? null,
      confirmed: row?.confirmed ?? false,
      onboarding_completed: row?.onboardingCompleted ?? false,
      cv_url: row?.cvUrl ?? null,
      evidence_urls: row?.evidenceUrls ?? [],
    });
  }
  async function saveProfile(accountId: string, profile: ProfessionalProfile) {
    await db.insert(candidateProfiles).values({ accountId, profile }).onConflictDoUpdate({
      target: candidateProfiles.accountId,
      set: { profile },
    });
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
    const rows = await db
      .update(candidateProfiles)
      .set({ onboardingCompleted: true })
      .where(
        sql`${candidateProfiles.accountId}=${accountId} AND ${candidateProfiles.confirmed}=true AND EXISTS(SELECT 1 FROM ${jobPreferences} WHERE ${jobPreferences.accountId}=${accountId})`,
      )
      .returning({ id: candidateProfiles.accountId });
    return rows.length > 0;
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
