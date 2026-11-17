import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ApiError } from "@google/genai";
import { documentLimits, documentSelectionError } from "@mirai/contracts";
import {
  createProfileExtractor,
  documentPart,
  ExtractionError,
  type ProfessionalDocument,
} from "./extractProfile.js";
import { createDocumentStorage } from "./documentStorage.js";
import type { createProfileRepository } from "./profileRepository.js";

const multipart = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: documentLimits.fileBytes,
    files: documentLimits.count,
    fields: 3,
    fieldSize: 8192,
  },
});
const operationSchema = z.uuid();
const mimeTypes: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
function document(file: Express.Multer.File): ProfessionalDocument {
  const extension = file.originalname.split(".").pop()?.toLowerCase();
  const mimeType = extension ? mimeTypes[extension] : undefined;
  if (!mimeType) throw new ExtractionError("UNSUPPORTED_DOCUMENT");
  return { name: file.originalname, mimeType, buffer: file.buffer };
}

export function createImportRoutes(repository: ReturnType<typeof createProfileRepository>) {
  const router = Router();
  const extract = createProfileExtractor();
  const storage = createDocumentStorage();
  router.post("/profile/imports", async (_req, res) => {
    const operationId = randomUUID();
    await repository.beginExtraction(res.locals.accountId, operationId);
    res.json({ operationId });
  });
  router.post(
    "/profile/extract",
    multipart.fields([
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
      const documents = selected.map(document);
      const context = await repository.importContext(res.locals.accountId, operationId);
      if (!context) {
        res.status(409).json({ error: { code: "IMPORT_SUPERSEDED" } });
        return;
      }
      const extraction = await extract(documents, undefined, note, language);
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
  router.post("/profile/documents/upload", multipart.single("document"), async (req, res) => {
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
    const source = document(req.file);
    await documentPart(source);
    let key: string;
    try {
      key = await storage.upload(res.locals.accountId, source);
    } catch {
      res.status(502).json({ error: { code: "STORAGE_FAILED" } });
      return;
    }
    await repository.attachDocument(res.locals.accountId, key, primary, operationId);
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
  router.use(
    (
      error: unknown,
      _req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (error instanceof multer.MulterError) {
        res.status(400).json({
          error: {
            code: error.code === "LIMIT_FILE_SIZE" ? "DOCUMENT_TOO_LARGE" : "DOCUMENT_COUNT",
          },
        });
        return;
      }
      if (error instanceof ExtractionError) {
        res.status(422).json({ error: { code: error.code } });
        return;
      }
      if (error instanceof ApiError) {
        console.warn({ event: "extraction_provider_failed", status: error.status });
        res.status(502).json({ error: { code: "AI_UNAVAILABLE" } });
        return;
      }
      next(error);
    },
  );
  return router;
}
