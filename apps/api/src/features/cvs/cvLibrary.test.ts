import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cvAccessSchema,
  cvDetailSchema,
  cvErrorSchema,
  cvLibrarySchema,
  cvRemovalSchema,
  cvReplacementSchema,
  professionalProfileSchema,
} from "@mirai/contracts";
import { createApp } from "../../bootstrap/app.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createProfileRepository } from "../profiles/profileRepository.js";
import { createDocumentStorage } from "../profiles/documentStorage.js";
import { createDocumentCleanup, queueDocumentCleanup } from "../profiles/documentCleanup.js";
import { candidateProfiles, jobPreferences } from "../profiles/schema.js";
import { cvDocuments, documentCleanup, originalDocuments } from "./schema.js";

const neonDevelopment = process.env.MIRAI_CV_TEST_NEON === "1";
if (neonDevelopment) config({ path: "apps/api/.env", quiet: true });
const databaseUrl = process.env.DATABASE_URL;
const storageUrl = process.env.AWS_ENDPOINT_URL_S3;
const account = randomUUID();
const outsider = randomUUID();
const fixtureEmail = (id: string) => `cv-test-${id}@example.invalid`;
const canonical = professionalProfileSchema.parse({
  personal: { full_name: "Synthetic Candidate" },
  headline: "Software Engineer",
  skills: [{ category: "Backend", items: ["PostgreSQL"] }],
});
const metadata = { name: "Backend", specialization: "Backend Engineer" };

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe.skipIf(!neonDevelopment)("CV library against Neon development services", () => {
  let db: ReturnType<typeof createDatabase>["db"];
  let pool: ReturnType<typeof createDatabase>["pool"];
  let server: Server;
  let issuerServer: Server;
  let closeDatabase: () => Promise<void>;
  let origin: string;
  let token: string;
  let outsiderToken: string;
  let primary: string;
  let bytes: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    if (
      !databaseUrl ||
      new URL(databaseUrl).hostname !== "ep-crimson-recipe-bbl32a9s-pooler.c-15.us-east-1.aws.neon.tech" ||
      !storageUrl ||
      new URL(storageUrl).hostname !== "br-cool-forest-bb10zfbm.storage.c-15.us-east-1.aws.neon.tech"
    )
      throw new Error("CV integration tests require the configured Neon development services");
    const keys = await generateKeyPair("EdDSA", { extractable: true });
    const jwk = { ...(await exportJWK(keys.publicKey)), kid: "cv-test", alg: "EdDSA" };
    issuerServer = createServer((_req, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    const issuer = await listen(issuerServer);
    vi.stubEnv("NEON_AUTH_BASE_URL", issuer);
    const issue = (sub: string) =>
      new SignJWT({ role: "authenticated" })
        .setProtectedHeader({ alg: "EdDSA", kid: "cv-test" })
        .setSubject(sub)
        .setIssuer(issuer)
        .setAudience(issuer)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(keys.privateKey);
    ({ db, pool } = createDatabase(databaseUrl));
    const profiles = createProfileRepository(db);
    for (const id of [account, outsider]) {
      await pool.query(
        `with fixture as (
           insert into neon_auth."user" (id, name, email, "emailVerified")
           values ($1, 'Synthetic Candidate', $2, false) returning id
         )
         insert into neon_auth.session ("userId", token, "expiresAt", "updatedAt")
         select id, $3, now() + interval '15 minutes', now() from fixture`,
        [id, fixtureEmail(id), randomUUID()],
      );
      await profiles.saveProfile(id, canonical);
      await profiles.confirm(id);
      await profiles.savePermissions(id, { allow_communication: true });
      await profiles.completeOnboarding(id);
    }
    [token, outsiderToken] = await Promise.all([issue(account), issue(outsider)]);
    const app = createApp();
    closeDatabase = app.locals.closeDatabase;
    server = createServer(app);
    origin = await listen(server);
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("Synthetic Candidate - Software Engineer - PostgreSQL");
    bytes = new Uint8Array(await pdf.save());
    const library = cvLibrarySchema.parse(await json("/cvs"));
    expect(library.documents).toHaveLength(1);
    primary = library.documents[0]!.id;
    expect(library.defaultId).toBe(primary);
  });

  afterAll(async () => {
    try {
      if (db)
        for (const id of [account, outsider]) {
          const storage = createDocumentStorage();
          const cleanup = createDocumentCleanup(db, storage);
          await db.transaction(async (tx) => {
            const [profile] = await tx
              .select()
              .from(candidateProfiles)
              .where(eq(candidateProfiles.accountId, id));
            const rows = await tx
              .delete(cvDocuments)
              .where(eq(cvDocuments.accountId, id))
              .returning();
            const originals = await tx
              .delete(originalDocuments)
              .where(eq(originalDocuments.accountId, id))
              .returning({ key: originalDocuments.key });
            for (const key of [
              profile?.cvUrl,
              ...(profile?.evidenceUrls ?? []),
              ...rows.map((row) => row.sourceKey),
              ...originals.map((row) => row.key),
            ]) {
              if (key) await queueDocumentCleanup(tx, id, key);
            }
            await tx.delete(jobPreferences).where(eq(jobPreferences.accountId, id));
            await tx.delete(candidateProfiles).where(eq(candidateProfiles.accountId, id));
            await tx
              .update(documentCleanup)
              .set({ dueAt: new Date(0) })
              .where(eq(documentCleanup.accountId, id));
          });
          await cleanup.drain(id);
        }
    } finally {
      server?.close();
      server?.closeAllConnections();
      issuerServer?.close();
      issuerServer?.closeAllConnections();
      try {
        await closeDatabase?.();
        if (pool)
          for (const id of [account, outsider]) {
            await pool.query(
              'delete from neon_auth."user" where id = $1 and email = $2',
              [id, fixtureEmail(id)],
            );
          }
      } finally {
        await pool?.end();
        vi.unstubAllEnvs();
      }
    }
  });

  function request(path: string, method = "GET", body?: unknown, authorization = token) {
    const multipart = body instanceof FormData;
    return fetch(`${origin}/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${authorization}`,
        ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
      },
      body: multipart ? body : body ? JSON.stringify(body) : undefined,
    });
  }
  async function json(path: string, method = "GET", body?: unknown) {
    const response = await request(path, method, body);
    const result: unknown = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    return result;
  }
  function multipart(input: unknown, name = "test.pdf", file = new Blob([bytes])) {
    const form = new FormData();
    form.set("input", JSON.stringify(input));
    form.set("document", file, name);
    return form;
  }

  it("owns CVs by account and saves independent variants with optimistic concurrency", async () => {
    const a = { id: randomUUID(), sourceId: primary, ...metadata };
    const variant = cvDetailSchema.parse(await json("/cvs/duplicate", "POST", a));
    expect(variant.profile).toEqual(canonical);
    expect(await json("/cvs/duplicate", "POST", a)).toEqual(variant);
    const b = cvDetailSchema.parse(
      await json("/cvs/duplicate", "POST", {
        ...a,
        id: randomUUID(),
        sourceId: variant.id,
        name: "Second CV",
      }),
    );
    const updates = await Promise.all(
      ["Revised title", "Concurrent title"].map((headline) =>
        request(`/cvs/${b.id}`, "PATCH", {
          revision: b.revision,
          profile: { ...canonical, headline },
        }),
      ),
    );
    expect(updates.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(cvDetailSchema.parse(await json(`/cvs/${variant.id}`)).profile).toEqual(canonical);
    expect(cvDetailSchema.parse(await json(`/cvs/${primary}`)).profile).toEqual(canonical);
    for (const [method, path, body] of [
      ["GET", `/cvs/${variant.id}`, undefined],
      ["GET", `/cvs/${variant.id}/source/access`, undefined],
      ["PATCH", `/cvs/${variant.id}`, { revision: variant.revision, name: "Unauthorized" }],
      ["DELETE", `/cvs/${variant.id}`, undefined],
      ["PUT", `/cvs/${variant.id}/default`, undefined],
      ["POST", "/cvs/duplicate", { ...a, id: randomUUID(), sourceId: variant.id }],
    ] as const)
      expect((await request(path, method, body, outsiderToken)).status).toBe(404);
    await Promise.all(
      [variant.id, b.id].map(async (id) => {
        expect((await request(`/cvs/${id}/default`, "PUT")).status).toBe(204);
      }),
    );
    const library = cvLibrarySchema.parse(await json("/cvs"));
    expect([variant.id, b.id]).toContain(library.defaultId);
    const explicit = await db
      .select()
      .from(cvDocuments)
      .where(and(eq(cvDocuments.accountId, account), eq(cvDocuments.isDefault, true)));
    expect(explicit).toHaveLength(1);
    expect((await request("/cvs/default", "DELETE")).status).toBe(204);
    expect(cvLibrarySchema.parse(await json("/cvs")).defaultId).toBe(primary);
  });

  it("validates sources, replaces safely and deletes the primary without deleting the profile", async () => {
    const current = await json(`/cvs/${primary}`).then(cvDetailSchema.parse);
    const originalProfile = { ...canonical, headline: "Primary with source" };
    const importedId = randomUUID();
    const input = { ...metadata, id: importedId, profile: canonical };
    for (const [name, file, code] of [
      ["empty.pdf", new Blob(), "EMPTY_DOCUMENT"],
      ["bad.pdf", new Blob(["%PDF-invalid"]), "UNREADABLE_DOCUMENT"],
      ["bad.docx", new Blob(["bad"]), "UNREADABLE_DOCUMENT"],
      ["bad.txt", new Blob(["bad"]), "UNSUPPORTED_DOCUMENT"],
      ["large.pdf", new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), "DOCUMENT_TOO_LARGE"],
    ] as const) {
      const result = await request("/cvs/import/confirm", "POST", multipart(input, name, file));
      expect(cvErrorSchema.parse(await result.json()).error.code).toBe(code);
    }
    const imported = cvDetailSchema.parse(
      await json("/cvs/import/confirm", "POST", multipart(input)),
    );
    expect(imported.hasSource).toBe(true);
    expect(await json("/cvs/import/confirm", "POST", multipart(input))).toEqual(imported);
    expect(
      (await request(`/cvs/${imported.id}/source/access`, "GET", undefined, outsiderToken)).status,
    ).toBe(404);
    const importedUrl = cvAccessSchema.parse(await json(`/cvs/${imported.id}/source/access`)).url;
    expect((await fetch(importedUrl)).ok).toBe(true);
    const replacement = {
      id: primary,
      revision: current.revision,
      operationId: randomUUID(),
      profile: originalProfile,
    };
    const replaced = cvReplacementSchema.parse(
      await json("/cvs/primary/replace", "POST", multipart(replacement)),
    );
    const source = cvAccessSchema.parse(await json(`/cvs/${primary}/source/access`)).url;
    expect((await fetch(source)).ok).toBe(true);
    expect(
      cvReplacementSchema.parse(await json("/cvs/primary/replace", "POST", multipart(replacement)))
        .document,
    ).toEqual(replaced.document);
    const next = {
      ...replacement,
      revision: replaced.document.revision,
      operationId: randomUUID(),
    };
    expect(
      (
        await request(
          "/cvs/primary/replace",
          "POST",
          multipart(next, "bad.pdf", new Blob(["%PDF-broken"])),
        )
      ).status,
    ).toBe(422);
    expect((await fetch(source)).ok).toBe(true);
    await json("/cvs/primary/replace", "POST", multipart(next));
    expect((await fetch(source)).ok).toBe(true);
    const currentSource = cvAccessSchema.parse(await json(`/cvs/${primary}/source/access`)).url;
    expect(cvRemovalSchema.parse(await json(`/cvs/${primary}`, "DELETE")).cleanupPending).toBe(
      false,
    );
    expect((await fetch(currentSource)).ok).toBe(true);
    expect(cvLibrarySchema.parse(await json("/cvs"))).toMatchObject({
      defaultId: null,
      canCreatePrimary: true,
    });
    const profiles = createProfileRepository(db);
    expect(await profiles.readProfile(account)).toMatchObject({
      profile: originalProfile,
      cv_url: null,
      onboarding_completed: true,
      confirmed: true,
    });
    expect((await profiles.readPreferences(account)).permissions.allow_communication).toBe(true);
    expect(cvDetailSchema.parse(await json(`/cvs/${imported.id}`)).profile).toEqual(canonical);
    const recreated = cvDetailSchema.parse(await json("/cvs/primary/create", "POST"));
    expect(recreated.id).not.toBe(primary);
    expect(recreated.profile).toEqual(originalProfile);
    expect(await json("/cvs/primary/create", "POST")).toEqual(recreated);
    expect((await request(`/cvs/${imported.id}/default`, "PUT")).status).toBe(204);
    await json(`/cvs/${imported.id}`, "DELETE");
    expect((await fetch(importedUrl)).ok).toBe(true);
    expect(cvLibrarySchema.parse(await json("/cvs")).defaultId).toBe(recreated.id);
  });

  it("keeps shared legacy objects and records failed physical deletion for retry", async () => {
    const storage = createDocumentStorage();
    const doc = { name: "legacy.pdf", mimeType: "application/pdf", buffer: Buffer.from(bytes) };
    const key = `profiles/${createHash("sha256").update(account).digest("hex")}/${createHash("sha256").update(bytes).digest("hex")}.pdf`;
    await storage.upload(account, key, doc);
    await db
      .update(candidateProfiles)
      .set({ evidenceUrls: [key] })
      .where(eq(candidateProfiles.accountId, account));
    await db.transaction((tx) => queueDocumentCleanup(tx, account, key));
    const url = await storage.access(account, key);
    const cleanup = createDocumentCleanup(db, storage);
    expect(await cleanup.drain(account)).toBe(false);
    expect((await fetch(url)).ok).toBe(true);
    await db.transaction(async (tx) => {
      await tx
        .update(candidateProfiles)
        .set({ evidenceUrls: [] })
        .where(eq(candidateProfiles.accountId, account));
      await queueDocumentCleanup(tx, account, key);
    });
    const unavailable = createDocumentCleanup(db, {
      ...storage,
      remove: () => Promise.reject(new Error("S3 unavailable")),
    });
    expect(await unavailable.drain(account)).toBe(true);
    expect((await fetch(url)).ok).toBe(true);
    expect(await cleanup.drain(account)).toBe(false);
    expect((await fetch(url)).status).toBe(404);
  });
});
