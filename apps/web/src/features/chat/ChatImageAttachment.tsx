"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/shared/i18n/I18nProvider";

export function ChatImageAttachment({
  file,
  disabled = false,
  removeLabel,
  onRemove,
}: {
  file: File;
  disabled?: boolean;
  removeLabel?: string;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>();
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setUrl(String(reader.result));
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return (
    <div
      className={
        onRemove
          ? "relative size-36 shrink-0 overflow-hidden rounded-2xl border border-input"
          : "relative size-24 shrink-0 overflow-hidden rounded-xl border border-input"
      }
    >
      {url && (
        <Dialog>
          <DialogTrigger
            aria-label={`${t.professional.preview}: ${file.name}`}
            render={
              <Button
                type="button"
                variant="ghost"
                className="absolute inset-0 size-full cursor-zoom-in rounded-none p-0 focus-visible:ring-inset"
              />
            }
          >
            <Image
              src={url}
              alt=""
              fill
              unoptimized
              className="object-cover"
              onLoad={({ currentTarget }) =>
                setImageSize({
                  width: currentTarget.naturalWidth,
                  height: currentTarget.naturalHeight,
                })
              }
            />
          </DialogTrigger>
          <DialogContent
            showCloseButton={false}
            className="w-fit max-w-none gap-0 rounded-none bg-transparent p-0 ring-0 sm:max-w-none"
          >
            <DialogTitle className="sr-only">{file.name}</DialogTitle>
            <Image
              src={url}
              alt={file.name}
              width={imageSize?.width ?? 0}
              height={imageSize?.height ?? 0}
              unoptimized
              className="block h-auto max-h-[88dvh] w-auto max-w-[88vw] object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
      {onRemove && (
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          disabled={disabled}
          className="absolute end-1 top-1"
          aria-label={`${removeLabel}: ${file.name}`}
          onClick={onRemove}
        >
          ×
        </Button>
      )}
    </div>
  );
}
