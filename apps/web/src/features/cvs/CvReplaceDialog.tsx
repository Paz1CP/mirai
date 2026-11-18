"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { documentSelectionError, type CvDetail, type CvSummary } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentAttachment } from "@/features/profiles/DocumentAttachment";
import { DocumentDropZone } from "@/features/profiles/DocumentDropZone";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cvApi } from "./cvApi";
import { CvDraftDialog } from "./CvDraftDialog";
import { cvErrorText } from "./cvText";

export function CvReplaceDialog({
  primary,
  onSaved,
  onClose,
}: {
  primary: CvSummary;
  onSaved: (document: CvDetail, cleanupPending?: boolean) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const c = t.cvs;
  const [file, setFile] = useState<File>();
  const [operationId] = useState(() => crypto.randomUUID());
  const [validation, setValidation] = useState<string>();
  const extract = useMutation({ mutationFn: (source: File) => cvApi.extract(source, locale) });
  if (extract.data && file) {
    const profile = extract.data.profile;
    return (
      <CvDraftDialog
        id={primary.id}
        title={c.reviewReplacement}
        submitLabel={c.confirmReplacement}
        mode="replace"
        initial={{
          profile,
          name: primary.name,
          specialization: primary.specialization,
          revision: primary.revision,
        }}
        onClose={onClose}
        onSave={async (draft) => {
          const result = await cvApi.replace(file, {
            id: primary.id,
            operationId,
            profile: draft.profile,
            revision: draft.revision,
          });
          onSaved(result.document, result.cleanupPending);
          return result.document;
        }}
      />
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !extract.isPending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-x-hidden overflow-y-auto p-6 text-center sm:max-w-md"
        showCloseButton={!extract.isPending}
      >
        <DialogHeader className="px-4">
          <DialogTitle className="text-lg">{c.replace}</DialogTitle>
          <DialogDescription>{c.fileLimit}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-center gap-4 py-2">
          {!file && (
            <DocumentDropZone
              label={c.chooseFile}
              disabled={extract.isPending}
              onFiles={(files) => {
                extract.reset();
                const [selected] = files;
                if (!selected) return;
                if (files.length > 1) {
                  setValidation(c.singleFile);
                  return;
                }
                const error = documentSelectionError(files);
                setValidation(error ? cvErrorText(error, locale) : undefined);
                setFile(error ? undefined : selected);
              }}
            />
          )}
          {file && (
            <DocumentAttachment
              file={file}
              primary
              label={file.name.split(".").pop()?.toUpperCase()}
              disabled={extract.isPending}
              onRemove={() => {
                setFile(undefined);
                setValidation(undefined);
                extract.reset();
              }}
              onRetry={() => extract.mutate(file)}
            />
          )}
        </div>
        {extract.isPending && (
          <p role="status" className="text-muted-foreground">
            {c.extracting}
          </p>
        )}
        {(validation || extract.error) && (
          <p role="alert" className="text-destructive">
            {validation ?? cvErrorText(extract.error, locale)}
          </p>
        )}
        <DialogFooter className="flex-row flex-wrap justify-center sm:justify-center">
          <Button variant="outline" disabled={extract.isPending} onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            disabled={!file || extract.isPending}
            onClick={() => {
              if (file) {
                setValidation(undefined);
                extract.mutate(file);
              }
            }}
          >
            {extract.error ? t.retry : c.extract}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
