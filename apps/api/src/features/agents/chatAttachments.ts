import type { Part } from "@google/genai";
import type { SendChat } from "@mirai/contracts";
import { documentPart } from "../profiles/extractProfile.js";
import { ChatError } from "./managedChats.js";

export async function prepareChatAttachments(files: SendChat["attachments"] = []): Promise<Part[]> {
  const parts: Part[] = [];
  for (const { name, mimeType, data } of files) {
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > 10 * 1024 * 1024)
      throw new ChatError("INVALID_ATTACHMENT", 400);

    parts.push({ text: name });
    if (mimeType.startsWith("image/")) {
      const valid =
        mimeType === "image/png"
          ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : mimeType === "image/jpeg"
            ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            : buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
              buffer.subarray(8, 12).toString("ascii") === "WEBP";
      if (!valid) throw new ChatError("INVALID_ATTACHMENT", 400);
      parts.push({ inlineData: { mimeType, data } });
    } else {
      try {
        parts.push(await documentPart({ name, mimeType, buffer }));
      } catch {
        throw new ChatError("INVALID_ATTACHMENT", 400);
      }
    }
  }
  return parts;
}
