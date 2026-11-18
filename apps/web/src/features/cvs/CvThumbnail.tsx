import Image from "next/image";
import { skipToken, useQuery } from "@tanstack/react-query";
import { DocumentText } from "iconsax-reactjs";
import type { CvSummary, OriginalDocument } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { renderCvPdf } from "@/features/profiles/cvPdf";
import { renderPdfThumbnail } from "@/features/profiles/pdfThumbnail";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cvApi, cvKey } from "./cvApi";
import { originalPreviewOptions } from "./originalPreview";

export function CvThumbnail({
  accountId,
  cv,
  onOpen,
}: {
  accountId: string;
  cv: CvSummary;
  onOpen: () => void;
}) {
  const { locale } = useI18n();
  const detail = useQuery({
    queryKey: cvKey(accountId, cv.id),
    queryFn: ({ signal }) => cvApi.detail(cv.id, signal),
    retry: false,
  });
  const profile = detail.data?.profile;
  const thumbnail = useQuery({
    queryKey: ["cv-thumbnail", accountId, cv.id, detail.data?.revision, locale],
    queryFn: profile
      ? async () => {
          const pdf = await renderCvPdf(profile, locale);
          return renderPdfThumbnail(await pdf.arrayBuffer(), 640);
        }
      : skipToken,
    staleTime: Infinity,
    retry: false,
  });

  return (
    <ThumbnailButton
      name={cv.name}
      image={thumbnail.data}
      failed={detail.isError || thumbnail.isError}
      onOpen={onOpen}
    />
  );
}

export function OriginalThumbnail({
  accountId,
  original,
  onOpen,
}: {
  accountId: string;
  original: OriginalDocument;
  onOpen: () => void;
}) {
  const preview = useQuery(originalPreviewOptions(accountId, original));
  const blob = preview.data?.blob;
  const thumbnail = useQuery({
    queryKey: ["original-thumbnail", accountId, original.id],
    queryFn: blob ? async () => renderPdfThumbnail(await blob.arrayBuffer(), 640) : skipToken,
    staleTime: Infinity,
    retry: false,
  });

  return (
    <ThumbnailButton
      name={original.name}
      image={thumbnail.data}
      text={preview.data?.text}
      failed={preview.isError || thumbnail.isError}
      onOpen={onOpen}
    />
  );
}

function ThumbnailButton({
  name,
  image,
  text,
  failed,
  onOpen,
}: {
  name: string;
  image?: string;
  text?: string;
  failed: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <Button
      variant="ghost"
      className="relative block aspect-[4/3] h-auto w-full overflow-hidden rounded-lg bg-secondary p-0"
      aria-label={`${t.cvs.view} · ${name}`}
      onClick={onOpen}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          width={640}
          height={906}
          unoptimized
          className="absolute inset-x-0 top-4 mx-auto h-auto w-[86%] shadow-sm"
        />
      ) : text?.trim() ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-[7%] top-4 min-h-full bg-document-paper p-[7%] text-start text-[0.5rem] leading-relaxed whitespace-pre-wrap wrap-break-word text-document-ink shadow-sm"
        >
          {text.trim().slice(0, 4000)}
        </div>
      ) : failed || text !== undefined ? (
        <DocumentText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Skeleton className="absolute inset-x-[7%] top-4 h-full rounded-none" />
      )}
    </Button>
  );
}
