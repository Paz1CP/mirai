import { describe, expect, it } from "vitest";
import { chatImageMaxBytes, sendChatSchema } from "./chat.js";

it("accepts only the available models and the reasoning levels they support", () => {
  const choose = (model: string, effort: string) =>
    sendChatSchema.safeParse({ ...message, text: "Hello", generation: { model, effort } }).success;
  expect(choose("gemini-4-hydrogen", "xhigh")).toBe(true);
  expect(choose("gemini-3.8-flash", "high")).toBe(true);
  expect(choose("gemini-3.8-flash", "xhigh")).toBe(false);
  expect(choose("unlisted-model", "low")).toBe(false);
});

const message = {
  id: "d780f4b5-30fa-4b27-956a-73e45530bc3a",
  instanceId: "4870a65a-a39e-437d-8d01-6d23624b8de7",
  locale: "es",
  text: "",
};
const image = { name: "image.png", mimeType: "image/png", data: "aGVsbG8=" };
const document = { name: "document.pdf", mimeType: "application/pdf", data: "aGVsbG8=" };

describe("chat attachments", () => {
  it("accepts two 15 MB images but rejects a byte over the image limit and oversized documents", () => {
    const data = "AAAA".repeat(chatImageMaxBytes / 3);
    const maxImage = { ...image, data };
    expect(
      sendChatSchema.safeParse({ ...message, attachments: [maxImage, maxImage] }).success,
    ).toBe(true);
    expect(
      sendChatSchema.safeParse({
        ...message,
        attachments: [{ ...image, data: `${data}AA==` }],
      }).success,
    ).toBe(false);
    expect(
      sendChatSchema.safeParse({ ...message, attachments: [{ ...document, data }] }).success,
    ).toBe(false);
  });

  it("accepts ten images and ten documents in one message, and starts fresh per message", () => {
    const attachments = [...Array(10).fill(image), ...Array(10).fill(document)];
    expect(sendChatSchema.safeParse({ ...message, attachments }).success).toBe(true);
    expect(
      sendChatSchema.safeParse({ ...message, attachments: Array(10).fill(image) }).success,
    ).toBe(true);
  });

  it("rejects excess attachments, unsupported media, and empty messages", () => {
    expect(
      sendChatSchema.safeParse({ ...message, attachments: Array(11).fill(image) }).success,
    ).toBe(false);
    expect(
      sendChatSchema.safeParse({ ...message, attachments: Array(11).fill(document) }).success,
    ).toBe(false);
    expect(
      sendChatSchema.safeParse({
        ...message,
        attachments: [{ ...image, mimeType: "image/svg+xml" }],
      }).success,
    ).toBe(false);
    expect(sendChatSchema.safeParse(message).success).toBe(false);
  });
});
