import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { professionalProfileSchema, cvExtractionSchema } from "@mirai/contracts";
import { createDatabase } from "../../infrastructure/database/client.js";
import { candidateProfiles, jobPreferences } from "./schema.js";
import { cvDocuments, documentCleanup } from "../cvs/schema.js";
import { createProfileRepository } from "./profileRepository.js";
config({ path: "apps/api/.env", quiet: true });
describe.skipIf(process.env.MIRAI_DB_TEST !== "1")("professional data integrity", () => {
  it("isolates accounts and preserves edits, documents and permissions across concurrent operations", async () => {
    const { db, pool } = createDatabase(process.env.DATABASE_URL!);
    const repo = createProfileRepository(db);
    const account = `test:${randomUUID()}`;
    const other = `test:${randomUUID()}`;
    try {
      const older = randomUUID();
      const latest = randomUUID();
      await repo.beginExtraction(account, older);
      await repo.beginExtraction(account, latest);
      const extraction = cvExtractionSchema.parse({
        profile: { personal: { full_name: "Synthetic Candidate" } },
        suggested_roles: [],
      });
      expect(await repo.completeExtraction(account, older, extraction, null)).toBe(false);
      expect(await repo.completeExtraction(account, latest, extraction, null)).toBe(true);
      expect((await repo.readProfile(account)).profile?.personal.full_name).toBe(
        "Synthetic Candidate",
      );
      expect((await repo.readProfile(other)).profile).toBeNull();
      const revised = professionalProfileSchema.parse({
        ...extraction.profile,
        headline: "Reviewed headline",
      });
      const evidenceKey = `private-evidence-${account}`;
      await db
        .insert(documentCleanup)
        .values({ accountId: account, key: evidenceKey, dueAt: new Date(Date.now() + 60_000) });
      await Promise.all([
        repo.saveProfile(account, revised),
        repo.attachDocument(account, evidenceKey, false, latest),
      ]);
      const saved = await repo.readProfile(account);
      expect(saved.profile?.headline).toBe("Reviewed headline");
      expect(saved.evidence_urls).toEqual([evidenceKey]);
      expect(saved.extraction?.profile.headline).toBeNull();
      await repo.completeExtraction(account, latest, extraction, extraction.profile);
      expect((await repo.readProfile(account)).profile?.headline).toBe("Reviewed headline");
      await repo.attachDocument(account, evidenceKey, false, latest);
      expect((await repo.readProfile(account)).evidence_urls).toHaveLength(1);
      const current = await repo.readPreferences(account);
      expect(current.permissions.allow_communication).toBe(false);
      const preferences = {
        ...current.preferences,
        roles: ["Backend Engineer"],
        roles_required: true,
        custom_rules: "Keep this text\nExactly as entered.",
      };
      await Promise.all([
        repo.savePreferences(account, preferences),
        repo.savePermissions(account, { allow_communication: true }),
      ]);
      const updated = await repo.readPreferences(account);
      expect(updated.permissions.allow_communication).toBe(true);
      expect(await repo.communicationAllowed(other)).toBe(false);
      expect(updated.preferences.custom_rules).toBe(preferences.custom_rules);
      expect(await repo.completeOnboarding(account)).toBe(false);
      expect(await repo.confirm(account)).toBe(true);
      await repo.savePermissions(account, { allow_communication: false });
      expect(await repo.communicationAllowed(account)).toBe(false);
      expect(await repo.completeOnboarding(account)).toBe(true);
      expect((await repo.readProfile(account)).onboarding_completed).toBe(true);
    } finally {
      await db.delete(documentCleanup).where(eq(documentCleanup.accountId, account));
      await db.delete(cvDocuments).where(eq(cvDocuments.accountId, account));
      await db.delete(jobPreferences).where(eq(jobPreferences.accountId, account));
      await db.delete(candidateProfiles).where(eq(candidateProfiles.accountId, account));
      await pool.end();
    }
  }, 30000);
});
