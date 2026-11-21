import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { documentLimits, documentSelectionError } from "@mirai/contracts";
import { createProfileExtractor, documentPart, ExtractionError } from "./extractProfile.js";
import type { createDocumentStorage } from "./documentStorage.js";
import type { createDocumentCleanup } from "./documentCleanup.js";
import { documentUpload, uploadedDocument } from "./documentHttp.js";
import type { createProfileRepository } from "./profileRepository.js";

const operationSchema = z.uuid();

export function createImportRoutes(
  repository: ReturnType<typeof createProfileRepository>,
  extract: ReturnType<typeof createProfileExtractor>,
  storage: ReturnType<typeof createDocumentStorage>,
  cleanup: ReturnType<typeof createDocumentCleanup>,
) {
  const router = Router();
  router.post("/profile/imports", async (req, res) => {
    const fileCount = z
      .object({ fileCount: z.int().min(1).max(documentLimits.count) })
      .optional()
      .parse(req.body)?.fileCount;
    if (fileCount) await cleanup.checkOriginalCapacity(res.locals.accountId, fileCount);
    const operationId = randomUUID();
    if (!(await repository.beginExtraction(res.locals.accountId, operationId))) {
      res.status(409).json({ error: { code: "IMPORT_SUPERSEDED" } });
      return;
    }
    res.json({ operationId });
  });
  router.post(
    "/profile/extract",
    documentUpload.fields([
      { name: "primary", maxCount: 1 },
      { name: "evidence", maxCount: documentLimits.evidence },
    ]),
    async (req, res) => {
      const operationId = operationSchema.parse(req.body.operationId);
      const note = z.string().trim().max(2000).default("").parse(req.body.note);
      const language = z.enum(["ES", "EN"]).default("ES").parse(req.body.language);
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      if (!files?.primary?.[0]) {
        res.status(400).json({ error: { code: "PRIMARY_CV_REQUIRED" } });
        return;
      }
      const selected = [files.primary[0], ...(files.evidence ?? [])];
      const error = documentSelectionError(
        selected.map((file) => ({ name: file.originalname, size: file.size })),
      );
      if (error) throw new ExtractionError(error);
      const controller = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      const documents = selected.map(uploadedDocument);
      const context = await repository.importContext(res.locals.accountId, operationId);
      if (!context) {
        res.status(409).json({ error: { code: "IMPORT_SUPERSEDED" } });
        return;
      }
      const extraction = await extract(
        res.locals.accountId,
        documents,
        controller.signal,
        note,
        language,
      );
      if (
        !(await repository.completeExtraction(
          res.locals.accountId,
          operationId,
          extraction,
          context.profile,
        ))
      ) {
        res.status(409).json({ error: { code: "IMPORT_SUPERSEDED" } });
        return;
      }
      res.json(await repository.readProfile(res.locals.accountId));
    },
  );
  router.post("/profile/documents/upload", documentUpload.single("document"), async (req, res) => {
    const operationId = operationSchema.parse(req.body.operationId);
    const primary = z.enum(["primary", "evidence"]).parse(req.body.kind) === "primary";
    if (!req.file) {
      res.status(400).json({ error: { code: "EMPTY_DOCUMENT" } });
      return;
    }
    if (!(await repository.importContext(res.locals.accountId, operationId))) {
      res.status(409).json({ error: { code: "IMPORT_SUPERSEDED" } });
      return;
    }
    const source = uploadedDocument(req.file);
    await cleanup.checkOriginalCapacity(res.locals.accountId, 1);
    await documentPart(source);
    let key: string;
    try {
      key = await cleanup.stage(res.locals.accountId, source);
    } catch {
      res.status(502).json({ error: { code: "STORAGE_FAILED" } });
      return;
    }
    if (
      !(await repository.attachDocument(
        res.locals.accountId,
        key,
        primary,
        operationId,
        source.name,
      ))
    ) {
      res.status(409).json({ error: { code: "IMPORT_SUPERSEDED" } });
      return;
    }
    res.json(await repository.readProfile(res.locals.accountId));
  });
  router.get("/profile/documents", async (_req, res) => {
    const profile = await repository.readProfile(res.locals.accountId);
    res.json({ cv_url: profile.cv_url, evidence_urls: profile.evidence_urls });
  });
  router.get("/profile/documents/access", async (req, res) => {
    const key = z.string().parse(req.query.key);
    const profile = await repository.readProfile(res.locals.accountId);
    if (key !== profile.cv_url && !profile.evidence_urls.includes(key)) {
      res.status(404).json({ error: { code: "DOCUMENT_NOT_FOUND" } });
      return;
    }
    res.json({ url: await storage.access(res.locals.accountId, key) });
  });
  return router;
}
