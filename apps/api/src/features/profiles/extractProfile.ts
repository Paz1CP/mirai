import { ApiError, GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { cvExtractionSchema, type CvExtraction } from "@mirai/contracts";
import { CV_EXTRACTOR_PROMPT } from "./cv_extractor_prompt.js";
import type { createInferenceBilling } from "../billing/inferenceBilling.js";

export interface ProfessionalDocument {
  name: string;
  mimeType: string;
  buffer: Buffer;
}
export class ExtractionError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function documentPart(document: ProfessionalDocument): Promise<Part> {
  if (!document.buffer.length) throw new ExtractionError("EMPTY_DOCUMENT");
  if (
    document.mimeType === "application/pdf" &&
    document.buffer.subarray(0, 5).toString() === "%PDF-"
  ) {
    try {
      const pdf = await PDFDocument.load(document.buffer, { updateMetadata: false });
      if (!pdf.getPageCount()) throw new Error("NO_PAGES");
    } catch {
      throw new ExtractionError("UNREADABLE_DOCUMENT");
    }
    return {
      inlineData: { mimeType: "application/pdf", data: document.buffer.toString("base64") },
    };
  }
  if (
    document.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const { value } = await mammoth.extractRawText({ buffer: document.buffer });
      if (!value.trim() || value.length > 2_000_000) throw new Error("EMPTY_OR_TOO_LARGE");
      return { text: value };
    } catch {
      throw new ExtractionError("UNREADABLE_DOCUMENT");
    }
  }
  throw new ExtractionError("UNSUPPORTED_DOCUMENT");
}

export function createProfileExtractor(billing: ReturnType<typeof createInferenceBilling>) {
  const region = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
  const ai = new GoogleGenAI({
    enterprise: true,
    project: process.env.GOOGLE_CLOUD_PROJECT ?? "mirai-514723",
    location: region,
  });
  return async (
    accountId: string,
    documents: ProfessionalDocument[],
    signal?: AbortSignal,
    note = "",
    language: "ES" | "EN" = "ES",
  ): Promise<CvExtraction> => {
    if (!documents.length || documents.length > 10) throw new ExtractionError("DOCUMENT_COUNT");
    const parts = await Promise.all(documents.map(documentPart));
    const generate = (model: string) =>
      billing.generate(accountId, "cv_extraction", model, region, () => {
        signal?.throwIfAborted();
        return ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              ...(note
                ? [
                    {
                      text: `Candidate note (context only; extract professional facts from the documents): ${note}`,
                    },
                  ]
                : []),
              ...parts.flatMap((part, index) => [
                { text: index === 0 ? "Primary CV" : `Supporting evidence ${index}` },
                part,
              ]),
            ],
          },
        ],
        config: {
          systemInstruction: `${CV_EXTRACTOR_PROMPT}\nOutput language: ${language}. Write extracted descriptive text and suggested roles in ${language === "ES" ? "Spanish" : "English"}, preserving proper names, URLs, dates, and factual meaning.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(cvExtractionSchema, { io: "output" }),
          httpOptions: { timeout: 120000 },
          abortSignal: signal,
        },
        });
      }, (response) => response.usageMetadata);
    let response;
    try {
      response = await generate(process.env.GOOGLE_GENAI_MODEL ?? "gemini-4-hydrogen");
    } catch (error) {
      if (!(error instanceof ApiError) || ![404, 429, 500, 502, 503, 504].includes(error.status))
        throw error;
      response = await generate(process.env.GOOGLE_GENAI_FALLBACK_MODEL ?? "gemini-3.8-flash");
    }
    try {
      const extraction = cvExtractionSchema.parse(JSON.parse(response.text ?? ""));
      const { profile } = extraction;
      if (
        !profile.personal.full_name &&
        !profile.headline &&
        !profile.summary &&
        !profile.experience.length &&
        !profile.education.length &&
        !profile.skills.length &&
        !profile.projects.length
      )
        throw new ExtractionError("NOT_A_CV");
      return extraction;
    } catch (error) {
      if (error instanceof ExtractionError) throw error;
      throw new ExtractionError("INVALID_EXTRACTION");
    }
  };
}
