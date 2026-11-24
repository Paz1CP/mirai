import { Router } from "express";
import { requestSignal } from "../auth/accountActivity.js";
import { z } from "zod";
import {
  cvDuplicateSchema,
  cvExtractSchema,
  cvExtractionResponseSchema,
  cvImportSchema,
  cvReplaceSchema,
  cvUpdateSchema,
  documentSelectionError,
  originalUploadIdsSchema,
} from "@mirai/contracts";
import { cvUpload, documentUpload, uploadedDocument } from "../profiles/documentHttp.js";
import {
  documentPart,
  ExtractionError,
  type createProfileExtractor,
} from "../profiles/extractProfile.js";
import type { createDocumentStorage } from "../profiles/documentStorage.js";
import type { createDocumentCleanup } from "../profiles/documentCleanup.js";
import { CvError, type createCvRepository } from "./cvRepository.js";

function multipartJson(input: unknown): unknown {
  try {
    return JSON.parse(z.string().parse(input));
  } catch {
    throw new CvError("INVALID_REQUEST", 400);
  }
}

export function createCvRoutes(
  repository: ReturnType<typeof createCvRepository>,
  extract: ReturnType<typeof createProfileExtractor>,
  storage: ReturnType<typeof createDocumentStorage>,
  cleanup: ReturnType<typeof createDocumentCleanup>,
) {
  const router = Router();
  const documentId = z.uuid();
  async function stage(accountId: string, source: ReturnType<typeof uploadedDocument>) {
    try {
      return await cleanup.stage(accountId, source);
    } catch (error) {
      console.warn({
        event: "cv_source_upload_failed",
        errorType: error instanceof Error ? error.name : "Unknown",
      });
      throw new CvError("STORAGE_FAILED", 502);
    }
  }
  const uploadSource = async (accountId: string, file?: Express.Multer.File) => {
    const source = uploadedDocument(file);
    await cleanup.checkOriginalCapacity(accountId, 1);
    await documentPart(source);
    return { name: source.name, key: await stage(accountId, source) };
  };
  async function readSource(accountId: string, key: string) {
    try {
      return await storage.read(accountId, key);
    } catch {
      throw new CvError("STORAGE_FAILED", 502);
    }
  }
  router.get("/originals", async (_req, res) => {
    res.json(await repository.originals(res.locals.accountId));
  });
  router.post("/originals", documentUpload.array("document"), async (req, res) => {
    const accountId = res.locals.accountId;
    const ids = originalUploadIdsSchema.parse(multipartJson(req.body?.ids));
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length !== ids.length) throw new CvError("INVALID_REQUEST", 400);
    const error = documentSelectionError(
      files.map(({ originalname, size }) => ({ name: originalname, size })),
    );
    if (error) throw new ExtractionError(error);
    const existing = new Set(
      (await repository.matchingOriginals(accountId, ids)).map((row) => row.id),
    );
    const pending = ids.flatMap((id, index) =>
      existing.has(id) ? [] : [{ id, source: uploadedDocument(files[index]) }],
    );
    await cleanup.checkOriginalCapacity(accountId, pending.length);
    for (const { source } of pending) {
      const signature = source.buffer.subarray(0, 5);
      const valid =
        source.mimeType === "application/pdf"
          ? signature.toString("ascii") === "%PDF-"
          : signature.length >= 4 && signature.readUInt32BE(0) === 0x504b0304;
      if (!valid) throw new ExtractionError("UNREADABLE_DOCUMENT");
    }
    const uploads = await Promise.all(
      pending.map(async ({ id, source }) => ({
        id,
        name: source.name,
        key: await stage(accountId, source),
      })),
    );
    res.json(await repository.saveOriginals(accountId, ids, uploads));
  });
  router.get("/originals/:id/content", async (req, res) => {
    const accountId = res.locals.accountId;
    const { key } = await repository.original(accountId, documentId.parse(req.params.id));
    res.set("X-Content-Type-Options", "nosniff");
    res.type(key.endsWith(".pdf") ? "pdf" : "docx").send(await readSource(accountId, key));
  });
  router.delete("/originals/:id", async (req, res) => {
    const accountId = res.locals.accountId;
    const key = await repository.removeOriginal(accountId, documentId.parse(req.params.id));
    res.json({
      cleanupPending: key ? await cleanup.drain(accountId, key) : await cleanup.pending(accountId),
    });
  });
  router.get("/originals/:id/cv", async (req, res) => {
    const accountId = res.locals.accountId;
    const { key } = await repository.original(accountId, documentId.parse(req.params.id));
    res.json(await repository.linkedCv(accountId, key));
  });
  router.post("/originals/:id/scan", async (req, res) => {
    const accountId = res.locals.accountId;
    const id = documentId.parse(req.params.id);
    const { language } = cvExtractSchema.parse(req.body);
    const { key, name } = await repository.original(accountId, id);
    const existing = await repository.linkedCv(accountId, key);
    if (existing) {
      res.json(existing);
      return;
    }
    const signal = requestSignal(res);
    const buffer = await readSource(accountId, key);
    const mimeType = key.endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const { profile } = await extract(accountId, [{ name, mimeType, buffer }], signal, "", language);
    signal.throwIfAborted();
    res.json(await repository.saveScan(accountId, id, profile));
  });
  router.get("/", async (_req, res) => {
    const accountId = res.locals.accountId;
    res.json(await repository.library(accountId, await cleanup.pending(accountId)));
  });
  router.post("/cleanup", async (_req, res) => {
    res.json({ cleanupPending: await cleanup.drain(res.locals.accountId) });
  });
  router.post("/duplicate", async (req, res) => {
    res.json(await repository.duplicate(res.locals.accountId, cvDuplicateSchema.parse(req.body)));
  });
  router.delete("/default", async (_req, res) => {
    await repository.defaultVariant(res.locals.accountId);
    res.status(204).end();
  });
  router.post("/primary/create", async (_req, res) => {
    res.json(await repository.createPrimary(res.locals.accountId));
  });
  router.post("/import/extract", cvUpload, async (req, res) => {
    const { language } = cvExtractSchema.parse(req.body);
    const signal = requestSignal(res);
    const { profile } = await extract(res.locals.accountId, [uploadedDocument(req.file)], signal, "", language);
    signal.throwIfAborted();
    res.json(cvExtractionResponseSchema.parse({ profile }));
  });
  router.post("/import/confirm", cvUpload, async (req, res) => {
    const accountId = res.locals.accountId;
    const input = cvImportSchema.parse(multipartJson(req.body?.input));
    const existing = await repository.imported(accountId, input.id);
    if (existing) {
      res.json(existing);
      return;
    }
    const { key, name } = await uploadSource(accountId, req.file);
    res.json(await repository.confirmImport(accountId, input, key, name));
  });
  router.post("/primary/replace", cvUpload, async (req, res) => {
    const accountId = res.locals.accountId;
    const input = cvReplaceSchema.parse(multipartJson(req.body?.input));
    const existing = await repository.replacement(accountId, input);
    if (existing) {
      res.json({ document: existing, cleanupPending: await cleanup.drain(accountId) });
      return;
    }
    const { key, name } = await uploadSource(accountId, req.file);
    const { document, retiredKey } = await repository.replacePrimary(accountId, input, key, name);
    res.json({
      document,
      cleanupPending: retiredKey ? await cleanup.drain(accountId, retiredKey) : false,
    });
  });
  router.get("/:id", async (req, res) => {
    res.json(await repository.read(res.locals.accountId, documentId.parse(req.params.id)));
  });
  router.patch("/:id", async (req, res) => {
    res.json(
      await repository.update(
        res.locals.accountId,
        documentId.parse(req.params.id),
        cvUpdateSchema.parse(req.body),
      ),
    );
  });
  router.delete("/:id", async (req, res) => {
    const accountId = res.locals.accountId;
    const key = await repository.remove(accountId, documentId.parse(req.params.id));
    res.json({ cleanupPending: key ? await cleanup.drain(accountId, key) : false });
  });
  router.put("/:id/default", async (req, res) => {
    await repository.defaultVariant(res.locals.accountId, documentId.parse(req.params.id));
    res.status(204).end();
  });
  router.get("/:id/source/access", async (req, res) => {
    const accountId = res.locals.accountId;
    const key = await repository.source(accountId, documentId.parse(req.params.id));
    res.json({ url: await storage.access(accountId, key) });
  });
  router.use(((error: unknown, _req, res, next) => {
    if (error instanceof CvError) res.status(error.status).json({ error: { code: error.code } });
    else if (
      error instanceof Error &&
      error.cause instanceof Error &&
      "code" in error.cause &&
      error.cause.code === "55P03"
    )
      res.status(503).json({ error: { code: "CV_BUSY" } });
    else next(error);
  }) satisfies import("express").ErrorRequestHandler);
  return router;
}
