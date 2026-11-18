"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { Add, ArrowUp } from "iconsax-reactjs";
import { documentLimits, documentSelectionError } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { useProfile } from "./ProfileProvider";
import { profileErrorText } from "./profileText";
import { DocumentAttachment } from "./DocumentAttachment";
import { DocumentDropZone } from "./DocumentDropZone";

export function ImportDocuments({ onReview }: { onReview?: () => void }) {
  const { t, locale } = useI18n();
  const p = t.professional;
  const state = useProfile();
  const run = state.importState;
  const [primary, setPrimary] = useState<File | null>(() => run?.files[0] ?? null);
  const [evidence, setEvidence] = useState<File[]>(() => run?.files.slice(1) ?? []);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState("");
  const evidenceInput = useRef<HTMLInputElement>(null);
  const files = [...(primary ? [primary] : []), ...evidence];
  const busy =
    state.starting ||
    run?.extraction === "pending" ||
    run?.uploads.some((item) => item.status === "pending");
  const locked = !!busy || !state.available;
  const unchanged =
    !!run &&
    files.length === run.files.length &&
    files.every((file, index) => file === run.files[index]);
  const sent = unchanged && run.extraction !== "idle";
  const enabled = !!primary && !locked && !sent;

  function attach(incoming: File[], kind: "primary" | "evidence") {
    if (locked || !incoming.length) return;
    if (kind === "primary" && incoming.length !== 1) {
      setError("PRIMARY_CV_COUNT");
      return;
    }
    const nextPrimary = kind === "primary" ? incoming[0]! : primary;
    const additions = incoming.filter(
      (file) =>
        !evidence.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified,
        ),
    );
    const nextEvidence = kind === "evidence" ? [...evidence, ...additions] : evidence;
    if (nextEvidence.length > documentLimits.evidence) {
      setError("DOCUMENT_COUNT");
      return;
    }
    const validation = documentSelectionError([
      ...(nextPrimary ? [nextPrimary] : []),
      ...nextEvidence,
    ]);
    if (validation) {
      setError(validation);
      return;
    }
    setError(undefined);
    setPrimary(nextPrimary);
    setEvidence(nextEvidence);
  }
  async function submit(filesOnly = false) {
    if (locked || (sent && !filesOnly)) return;
    const validation = !primary ? "PRIMARY_CV_REQUIRED" : documentSelectionError(files);
    setError(validation);
    if (!validation) await state.start(files, filesOnly, note);
  }
  return (
    <section
      className="cv-import relative isolate overflow-x-clip flex h-[calc(100svh-5rem)] min-h-[32rem] min-w-0 flex-none flex-col px-6 pb-6"
      data-has-attachments={files.length > 0}
      aria-labelledby="cv-import-title"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <div className="cv-import-glow" aria-hidden="true" />
      <div className="cv-import-stage relative isolate mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-center overflow-y-auto py-8 text-center">
        <Image
          src="/images/cv_folder.png"
          alt=""
          width={264}
          height={260}
          priority
          className="cv-import-art mb-6 h-72 w-auto xl:h-88"
        />
        <h2 id="cv-import-title" className="text-2xl font-semibold tracking-tight xl:text-3xl">
          {p.importTitle}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground xl:text-base">
          {p.importDescription}
        </p>
        <div className="cv-import-zones relative mt-10 flex items-center gap-8 xl:gap-10">
          <span className="cv-drop-note cv-drop-note-primary" aria-hidden="true">
            <span className="relative -top-3 -left-12 inline-block">{p.cvNote}</span>
            <svg viewBox="0 0 100 65" fill="none">
              <path d="M4 4C12 54 43 65 92 43m-15-2 16 1-8 14" />
            </svg>
          </span>
          <DocumentDropZone
            label={p.dropCv}
            disabled={locked}
            count={primary ? 1 : 0}
            onFiles={(files) => attach(files, "primary")}
          />
          <DocumentDropZone
            label={p.dropEvidence}
            disabled={locked}
            count={evidence.length}
            limit={documentLimits.evidence}
            inputRef={evidenceInput}
            onFiles={(files) => attach(files, "evidence")}
          />
          <span className="cv-drop-note cv-drop-note-evidence" aria-hidden="true">
            <svg viewBox="0 0 100 65" fill="none">
              <path d="M94 60C82 10 51-1 7 22m15 3L6 23l8-14" />
            </svg>
            <span className="relative top-3   left-12 inline-block">{p.additionalNote}</span>
          </span>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">{p.fileHelp}</p>
      </div>
      <form
        className="mx-auto w-full max-w-3xl shrink-0"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {(error || state.startError) && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {profileErrorText(error ?? state.startError, locale)}
          </p>
        )}
        <div
          className={`rounded-4xl border border-border bg-secondary p-2 transition-opacity ${!primary ? "opacity-60" : ""}`}
        >
          {files.length > 0 && (
            <div className="m-2 mb-3 flex gap-3 overflow-x-auto pb-2" aria-label={p.attachments}>
              {files.map((file, index) => {
                const runIndex = run?.files.indexOf(file) ?? -1;
                return (
                  <DocumentAttachment
                    key={`${index}-${file.name}-${file.lastModified}`}
                    file={file}
                    primary={file === primary}
                    disabled={locked}
                    status={runIndex >= 0 ? run?.uploads[runIndex]?.status : undefined}
                    onRetry={() => state.retryUpload(runIndex)}
                    onRemove={() => {
                      setError(undefined);
                      if (file === primary) setPrimary(null);
                      else setEvidence((previous) => previous.filter((item) => item !== file));
                    }}
                  />
                );
              })}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={locked || !primary}
              aria-label={p.dropEvidence}
              onClick={() => evidenceInput.current?.click()}
            >
              <Add className="size-5" aria-hidden="true" />
            </Button>
            <Textarea
              aria-label={t.composerPlaceholder}
              placeholder={t.composerPlaceholder}
              disabled={!enabled}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={1}
              maxLength={2000}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              className="max-h-[min(50svh,24rem)] min-h-9 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 leading-5 shadow-none disabled:bg-transparent disabled:opacity-100 dark:bg-transparent dark:disabled:bg-transparent"
            />
            <Button
              type="submit"
              size="icon-lg"
              className="rounded-xl"
              disabled={!enabled}
              aria-label={p.extract}
            >
              <ArrowUp className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
        {run && (
          <div className="mt-3 space-y-2 text-sm" aria-live="polite">
            {run.extraction === "failed" && (
              <div className="flex items-center gap-3">
                <p role="alert" className="text-destructive">
                  {profileErrorText(run.extractionError, locale)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={state.retryExtraction}
                >
                  {p.retry}
                </Button>
              </div>
            )}
            {run.uploads.map(
              (upload, index) =>
                upload.status === "failed" && (
                  <p key={index} role="alert" className="text-xs text-destructive">
                    {run.files[index]?.name}: {profileErrorText(upload.error, locale)}
                  </p>
                ),
            )}
            {run.extraction === "done" && onReview && (
              <Button onClick={onReview}>{p.review}</Button>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
