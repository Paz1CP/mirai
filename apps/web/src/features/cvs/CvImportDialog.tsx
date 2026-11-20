"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { documentLimits, documentSelectionError, type OriginalDocument } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentDropZone } from "@/features/profiles/DocumentDropZone";
import { DocumentLimitDialog, isDocumentLimit } from "@/features/profiles/DocumentLimitDialog";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cvApi } from "./cvApi";
import { cvErrorText } from "./cvText";

export function CvImportDialog({
  onImported,
  onClose,
}: {
  onImported: (documents: OriginalDocument[]) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const c = t.cvs;
  const [validation, setValidation] = useState<string>();
  const upload = useMutation({
    mutationFn: ({ files, ids }: { files: File[]; ids: string[] }) =>
      cvApi.uploadOriginals(files, ids),
    onSuccess: onImported,
  });

  function select(files: File[]) {
    const error = documentSelectionError(files);
    upload.reset();
    setValidation(error);
    if (!error) upload.mutate({ files, ids: files.map(() => crypto.randomUUID()) });
  }

  if (isDocumentLimit(upload.error)) return <DocumentLimitDialog open onClose={onClose} />;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !upload.isPending) onClose();
      }}
    >
      <DialogContent
        className="overflow-x-hidden p-6 text-center sm:max-w-md"
        showCloseButton={!upload.isPending}
      >
        <DialogHeader className="px-4">
          <DialogTitle className="text-lg">{c.import}</DialogTitle>
          <DialogDescription>{t.professional.fileHelp}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          <DocumentDropZone
            label={c.chooseDocuments}
            disabled={upload.isPending}
            limit={documentLimits.count}
            onFiles={select}
          />
        </div>
        {upload.isPending && (
          <p role="status" className="text-muted-foreground">
            {c.uploadingOriginals}
          </p>
        )}
        {(validation || upload.error) && (
          <p role="alert" className="text-destructive">
            {cvErrorText(validation ?? upload.error, locale)}
          </p>
        )}
        <DialogFooter className="flex-row flex-wrap justify-center sm:justify-center">
          <Button variant="outline" disabled={upload.isPending} onClick={onClose}>
            {t.cancel}
          </Button>
          {upload.error && (
            <Button
              onClick={() => {
                if (upload.variables) upload.mutate(upload.variables);
              }}
            >
              {t.retry}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
