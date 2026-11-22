import { randomUUID } from "node:crypto";
import { chatEventSchema } from "@mirai/contracts";
import { expect, it } from "vitest";
import { fromProviderEvent } from "./chatEvents.js";

it.each(["", "Revisa estos archivos"])(
  "keeps queued media separate from message text (%s)",
  (text) => {
    const id = randomUUID();
    const timestamp = "2026-11-22T00:00:00Z";
    const attachments = [
      { name: "image.png", mimeType: "image/png", position: 0 },
      { name: "example.pdf", mimeType: "application/pdf", position: 1, originalId: randomUUID() },
    ];
    const { history } = fromProviderEvent({
      name: "sessions/test/events/queued",
      timestamp,
      author: "mirai_queue",
      eventMetadata: {
        customMetadata: {
          miraiCommandId: id,
          miraiQueued: { id, text, locale: "es", instanceId: randomUUID(), attachments },
        },
      },
    });
    expect(chatEventSchema.parse(history)).toMatchObject({
      id,
      role: "user",
      parts: text ? [{ type: "text", text }] : [],
      attachments,
    });
  },
);
