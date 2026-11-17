"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { DocumentText, TickCircle } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/shared/i18n/I18nProvider";

export function DocumentAttachment({
  file,
  primary,
  status,
  disabled,
  onRemove,
  onRetry,
}: {
  file: File;
  primary: boolean;
  status?: "idle" | "pending" | "done" | "failed";
  disabled: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const p = t.professional;
  const [preview, setPreview] = useState<{
    image?: string;
    text?: string;
    url: string;
    failed?: boolean;
  }>();
  const [open, setOpen] = useState(false);
  const pdf = /\.pdf$/i.test(file.name);
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    async function load() {
      try {
        const data = await file.arrayBuffer();
        if (pdf) {
          const library = await import("pdfjs-dist");
          library.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
          const task = library.getDocument({ data });
          try {
            const document = await task.promise;
            const page = await document.getPage(1);
            const viewport = page.getViewport({
              scale: 360 / page.getViewport({ scale: 1 }).width,
            });
            const canvas = window.document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvas, viewport }).promise;
            if (!cancelled) setPreview({ image: canvas.toDataURL(), url });
          } finally {
            await task.destroy();
          }
        } else {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ arrayBuffer: data });
          if (!cancelled) setPreview({ text: result.value, url });
        }
      } catch {
        if (!cancelled) setPreview({ url, failed: true });
      }
    }
    void load();
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file, pdf]);
  const loading = !preview || status === "pending";
  return (
    <div className="relative w-44 shrink-0">
      <Button
        variant="ghost"
        className="relative block h-36 w-full overflow-hidden rounded-2xl border border-input bg-background p-0 text-start whitespace-normal"
        onClick={() => setOpen(true)}
        aria-label={`${p.preview}: ${file.name}`}
      >
        <div
          className={`h-24 overflow-hidden bg-document-paper text-document-ink ${loading ? "blur-sm" : ""}`}
        >
          {preview?.image ? (
            <Image
              src={preview.image}
              alt=""
              width={360}
              height={500}
              unoptimized
              className="h-auto w-full"
            />
          ) : preview?.text ? (
            <p className="whitespace-pre-wrap px-3 py-2 text-[5px] leading-relaxed">
              {preview.text.slice(0, 4000)}
            </p>
          ) : (
            <DocumentText className="mx-auto mt-6 size-10 text-primary" aria-hidden="true" />
          )}
        </div>
        {loading && (
          <span
            className="absolute inset-x-0 top-7 mx-auto size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <div className="flex h-12 items-center gap-2 px-3">
          <DocumentText className="size-4 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs">{file.name}</p>
            <p
              className={`truncate text-[10px] ${status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {primary ? p.cvReady : p.attachmentReady}
              {(status === "failed" || status === "pending" || !preview || preview.failed || status === "done") && " · "}
              {status === "failed"
                ? p.uploadFailed
                : status === "pending"
                  ? p.uploading
                  : !preview
                    ? p.preparingPreview
                    : preview.failed
                      ? p.previewUnavailable
                      : status === "done"
                        ? p.uploaded
                        : ""}
            </p>
          </div>
          {status === "done" && <TickCircle className="size-4 text-primary" aria-hidden="true" />}
        </div>
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        className="absolute end-1 top-1 text-document-ink hover:bg-document-paper/80 hover:text-document-ink"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`${p.remove}: ${file.name}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </Button>
      {status === "failed" && (
        <Button size="sm" variant="link" disabled={disabled} onClick={onRetry}>
          {p.retry}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[85svh] sm:max-w-4xl flex-col" showCloseButton>
          <DialogTitle className="truncate pe-8">{file.name}</DialogTitle>
          {preview?.failed ? (
            <p className="text-muted-foreground">{p.previewUnavailable}</p>
          ) : !preview ? (
            <p role="status">{p.preparingPreview}</p>
          ) : pdf ? (
            <iframe
              src={`${preview.url}#toolbar=0`}
              title={file.name}
              className="min-h-0 flex-1 rounded-xl border border-border bg-document-paper"
            />
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-document-paper p-8 font-sans text-sm text-document-ink">
              {preview.text}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
