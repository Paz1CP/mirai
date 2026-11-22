"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import type { ChatAttachmentRef } from "@mirai/contracts";
import { DocumentText } from "iconsax-reactjs";
import { cvApi } from "@/features/cvs/cvApi";
import { DocumentAttachment } from "@/features/profiles/DocumentAttachment";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { chatApi, chatAttachmentKey } from "./chatApi";
import { ChatImageAttachment } from "./ChatImageAttachment";

export function ChatMessageAttachment({
  accountId,
  chatId,
  messageId,
  attachment,
  localFile,
}: {
  accountId: string;
  chatId?: string;
  messageId: string;
  attachment: ChatAttachmentRef;
  localFile?: File;
}) {
  const { t } = useI18n();
  const { name, mimeType, originalId, position } = attachment;
  const image = mimeType.startsWith("image/");
  const preview = useQuery({
    queryKey: chatAttachmentKey(accountId, chatId, messageId, position),
    queryFn:
      !chatId || localFile
        ? skipToken
        : async ({ signal }) => {
            const data = originalId
              ? await cvApi.originalContent(originalId, signal)
              : await chatApi.attachmentContent(chatId, messageId, position, signal);
            return new File([data], name, { type: mimeType });
          },
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
  });
  const file = localFile ?? (preview.isError ? undefined : preview.data);
  if (file) {
    return image ? (
      <ChatImageAttachment file={file} />
    ) : (
      <DocumentAttachment file={file} primary={false} label={t.conversation.attachmentOnly} />
    );
  }

  return (
    <div
      className={`${image ? "size-24" : "h-36 w-44"} flex shrink-0 flex-col justify-center gap-1 rounded-xl border border-input bg-card px-2 text-xs text-muted-foreground`}
    >
      <DocumentText className="size-4" aria-hidden="true" />
      <span className="truncate" title={name}>
        {name}
      </span>
      <span>
        {preview.isError ? t.conversation.attachmentUnavailable : t.professional.preparingPreview}
      </span>
    </div>
  );
}
