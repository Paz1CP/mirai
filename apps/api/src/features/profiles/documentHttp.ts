import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ApiError } from "@google/genai";
import { documentLimits, documentSelectionError } from "@mirai/contracts";
import { ExtractionError, type ProfessionalDocument } from "./extractProfile.js";

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: documentLimits.fileBytes,
    files: documentLimits.count,
    fields: 3,
    fieldSize: 8192,
  },
});
export const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: documentLimits.fileBytes, files: 1, fields: 1, fieldSize: 10 * 1024 * 1024 },
}).single("document");

export function uploadedDocument(file?: Express.Multer.File): ProfessionalDocument {
  if (!file) throw new ExtractionError("EMPTY_DOCUMENT");
  const error = documentSelectionError([{ name: file.originalname, size: file.size }]);
  if (error) throw new ExtractionError(error);
  return {
    name: file.originalname,
    mimeType: /\.pdf$/i.test(file.originalname)
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: file.buffer,
  };
}

export const documentErrors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    const code =
      error.code === "LIMIT_FILE_SIZE"
        ? "DOCUMENT_TOO_LARGE"
        : error.code === "LIMIT_FIELD_VALUE"
          ? "INVALID_REQUEST"
          : "DOCUMENT_COUNT";
    res.status(400).json({ error: { code } });
  } else if (error instanceof ExtractionError) {
    res.status(422).json({ error: { code: error.code } });
  } else if (error instanceof ApiError) {
    console.warn({ event: "extraction_provider_failed", status: error.status });
    res.status(502).json({ error: { code: "AI_UNAVAILABLE" } });
  } else next(error);
};
