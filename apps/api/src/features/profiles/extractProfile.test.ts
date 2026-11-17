import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { documentPart } from "./extractProfile.js";
it("rejects empty and corrupt documents before invoking the model", async () => {
  await expect(
    documentPart({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) }),
  ).rejects.toMatchObject({ code: "EMPTY_DOCUMENT" });
  await expect(
    documentPart({
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-broken"),
    }),
  ).rejects.toMatchObject({ code: "UNREADABLE_DOCUMENT" });
  await expect(
    documentPart({
      name: "broken.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("not a Word file"),
    }),
  ).rejects.toMatchObject({ code: "UNREADABLE_DOCUMENT" });
  const pdf = await PDFDocument.create();
  pdf.addPage();
  expect(
    await documentPart({
      name: "valid.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    }),
  ).toHaveProperty("inlineData.mimeType", "application/pdf");
});
