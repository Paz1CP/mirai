"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CvDetail, OriginalDocument } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExtractionAnimation } from "@/features/profiles/ExtractionProgress";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cvApi } from "./cvApi";
import { CvDocumentDialog } from "./CvDocumentDialog";
import { cvErrorText } from "./cvText";
import { originalPreviewOptions } from "./originalPreview";

export function CvOriginalDialog({
  accountId,
  original,
  onEdit,
  onClose,
}: {
  accountId: string;
  original: OriginalDocument;
  onEdit: (cv: CvDetail) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const c = t.cvs;
  const [confirm, setConfirm] = useState(false);
  const lookup = useMutation({
    mutationFn: () => cvApi.linkedCv(original.id),
    onSuccess: (cv) => {
      if (cv) onEdit(cv);
      else setConfirm(true);
    },
  });
  const scan = useMutation({ mutationFn: () => cvApi.scan(original.id, locale) });
  const preview = useQuery(originalPreviewOptions(accountId, original));
  const blob = preview.data?.blob;

  if (scan.isPending || scan.data) {
    return (
      <Dialog open disablePointerDismissal>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100svh-2rem)] overflow-x-hidden overflow-y-auto p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">{c.scanning}</DialogTitle>
          <ExtractionAnimation
            compact
            startedAt={scan.submittedAt}
            complete={Boolean(scan.data)}
            onComplete={() => {
              if (scan.data) onEdit(scan.data);
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <CvDocumentDialog
      title={original.name}
      onClose={() => {
        if (!lookup.isPending) onClose();
      }}
      action={
        <Button size="sm" disabled={lookup.isPending} onClick={() => lookup.mutate()}>
          {c.edit}
        </Button>
      }
    >
      {(lookup.error || scan.error) && (
        <p role="alert" className="border-b border-border px-5 py-3 text-sm text-destructive">
          {cvErrorText(lookup.error ?? scan.error, locale)}
        </p>
      )}
      {preview.error ? (
        <div className="grid justify-items-center gap-3 p-8">
          <p role="alert">{t.professional.previewUnavailable}</p>
          <Button variant="outline" onClick={() => void preview.refetch()}>
            {t.retry}
          </Button>
        </div>
      ) : blob ? (
        <OriginalPdf blob={blob} title={original.name} />
      ) : preview.data?.text !== undefined ? (
        <div className="min-h-0 flex-1 overflow-auto bg-secondary p-6">
          <pre className="mx-auto max-w-3xl whitespace-pre-wrap wrap-break-word bg-document-paper p-8 font-sans text-sm text-document-ink">
            {preview.data.text}
          </pre>
        </div>
      ) : (
        <p role="status" className="p-6 text-center text-muted-foreground">
          {t.professional.preparingPreview}
        </p>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="text-center">
          <DialogTitle className="px-6">{c.scanTitle}</DialogTitle>
          <DialogDescription>{c.scanDescription}</DialogDescription>
          <DialogFooter className="flex-row flex-wrap justify-center sm:justify-center">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {t.cancel}
            </Button>
            <Button
              onClick={() => {
                setConfirm(false);
                scan.mutate();
              }}
            >
              {c.scan}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CvDocumentDialog>
  );
}

function OriginalPdf({ blob, title }: { blob: Blob; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (frame.current) frame.current.src = `${url}#toolbar=0`;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <iframe ref={frame} title={title} className="min-h-0 flex-1 bg-secondary" />;
}
