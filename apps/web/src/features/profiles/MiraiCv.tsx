"use client";
import { useEffect, useRef, useState } from "react";
import type { ProfessionalProfile } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { LivePdfPreview } from "./LivePdfPreview";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { notifySuccess } from "@/shared/notifySuccess";
import { downloadCvPdf, renderCvPdf } from "./cvPdf";

type Rendered = {
  profile: ProfessionalProfile;
  locale: string;
  blob: Blob;
};
export function MiraiCv({
  profile,
  name,
  comparison,
}: {
  profile: ProfessionalProfile;
  name?: string;
  comparison?: { scale: number; onScroll: (element: HTMLElement) => void };
}) {
  const { t, locale } = useI18n();
  const p = t.professional;
  const queue = useRef(Promise.resolve());
  const [rendered, setRendered] = useState<Rendered>();
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1);
  const current = rendered?.profile === profile && rendered?.locale === locale;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (cancelled) return;
          try {
            const blob = await renderCvPdf(profile, locale);
            if (cancelled) return;
            setRendered({ profile, locale, blob });
            setError(false);
          } catch {
            if (!cancelled) setError(true);
          }
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile, locale]);
  function download() {
    if (!rendered || !current) return;
    downloadCvPdf(rendered.blob, name ?? `${profile.personal.full_name ?? "Mirai"}-CV`);
    notifySuccess(p.downloadStarted);
  }
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-secondary" aria-label={p.cv}>
      {!comparison && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={p.zoomOut}
              disabled={scale <= 0.5}
              onClick={() =>
                setScale((current) => Math.max(0.5, Math.round((current - 0.1) * 100) / 100))
              }
            >
              −
            </Button>
            <span className="min-w-12 text-center text-xs tabular-nums">
              {new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
                scale,
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={p.zoomIn}
              disabled={scale >= 1.5}
              onClick={() =>
                setScale((current) => Math.min(1.5, Math.round((current + 0.1) * 100) / 100))
              }
            >
              +
            </Button>
          </div>
          <Button size="sm" onClick={download} disabled={!current || error}>
            {p.download}
          </Button>
        </div>
      )}
      <div
        className="relative min-h-0 flex-1 overflow-auto"
        aria-busy={!current && !error}
        data-comparison-scroll={comparison ? "" : undefined}
        onScroll={comparison ? (event) => comparison.onScroll(event.currentTarget) : undefined}
        tabIndex={comparison ? 0 : undefined}
      >
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {p.pdfError}
          </p>
        )}
        {!current && !error && (
          <p role="status" className="sr-only">
            {p.renderingCv}
          </p>
        )}
        {rendered && (
          <LivePdfPreview
            blob={rendered.blob}
            scale={comparison?.scale ?? scale}
            label={p.cv}
            onError={() => setError(true)}
          />
        )}
      </div>
    </section>
  );
}
