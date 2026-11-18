import { describe, expect, it } from "vitest";
import { cvDuplicateSchema, cvImportSchema, cvLibrarySchema, cvUpdateSchema } from "./cvs.js";

describe("CV library contracts", () => {
  it("validates ownership-free commands and a shared professional profile", () => {
    const id = "8b279986-ac5c-448c-aafa-3c00c8ccf90d";
    const sourceId = "d180341e-bb57-4987-b69c-0bf3a2a6b65b";
    const metadata = { name: " Backend CV ", specialization: "Node.js" };
    expect(cvDuplicateSchema.parse({ id, sourceId, ...metadata }).name).toBe("Backend CV");
    expect(
      cvDuplicateSchema.safeParse({ id, sourceId, ...metadata, accountId: "another" }).success,
    ).toBe(false);
    expect(cvImportSchema.parse({ id, ...metadata, profile: {} }).profile.skills).toEqual([]);
    expect(
      cvImportSchema.safeParse({ id, ...metadata, profile: { experience: false } }).success,
    ).toBe(false);
    expect(cvUpdateSchema.safeParse({ name: "New name" }).success).toBe(false);
    expect(
      cvLibrarySchema.parse({
        documents: [],
        defaultId: null,
        canCreatePrimary: true,
        cleanupPending: false,
      }).defaultId,
    ).toBeNull();
  });
});
