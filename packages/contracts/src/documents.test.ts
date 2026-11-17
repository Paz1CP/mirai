import { describe, expect, it } from "vitest";
import { documentLimits, documentSelectionError } from "./documents.js";

describe("document selection limits", () => {
  const pdf = { name: "CV.PDF", size: documentLimits.fileBytes };
  it("accepts the boundary and rejects excessive size, count and unsupported files", () => {
    expect(documentSelectionError([pdf, pdf, pdf])).toBeUndefined();
    expect(documentSelectionError([pdf, pdf, pdf, pdf])).toBe("DOCUMENTS_TOO_LARGE");
    expect(documentSelectionError([{ ...pdf, size: pdf.size + 1 }])).toBe("DOCUMENT_TOO_LARGE");
    expect(documentSelectionError(Array.from({ length: 11 }, () => ({ ...pdf, size: 1 })))).toBe(
      "DOCUMENT_COUNT",
    );
    expect(documentSelectionError([{ name: "cv.pdf.exe", size: 1 }])).toBe("UNSUPPORTED_DOCUMENT");
    expect(documentSelectionError([{ ...pdf, size: 0 }])).toBe("EMPTY_DOCUMENT");
  });
});
