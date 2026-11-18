"use client";

import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { CvSummary } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CvPreview } from "@/features/profiles/DocumentWorkspace";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cvApi, cvKey } from "./cvApi";
import { cvErrorText } from "./cvText";

export function CvComparison({
  documents,
  accountId,
  onClose,
}: {
  documents: CvSummary[];
  accountId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const c = t.cvs;
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {compare ? (
        <DialogContent className="flex h-[92svh] flex-col overflow-hidden sm:max-w-[min(96vw,100rem)]">
          <DialogTitle className="pe-8">{c.compareTitle}</DialogTitle>
          <ComparisonColumns ids={selected} accountId={accountId} />
        </DialogContent>
      ) : (
        <DialogContent>
          <DialogTitle>{c.compareTitle}</DialogTitle>
          <DialogDescription>{c.chooseForComparison}</DialogDescription>
          <div className="max-h-[55svh] space-y-1 overflow-auto">
            {documents.map((document) => {
              const checked = selected.includes(document.id);
              return (
                <label
                  key={document.id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    disabled={!checked && selected.length === 3}
                    onCheckedChange={(value) =>
                      setSelected((current) =>
                        value
                          ? [...current, document.id]
                          : current.filter((id) => id !== document.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{document.name}</span>
                    {document.specialization && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {document.specialization}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button disabled={selected.length < 2} onClick={() => setCompare(true)}>
              {c.showComparison}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function ComparisonColumns({ ids, accountId }: { ids: string[]; accountId: string }) {
  const { t, locale } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const expectedScroll = useRef(new WeakMap<HTMLElement, number>());
  const [fitScale, setFitScale] = useState(0);
  const [zoom, setZoom] = useState(0);
  const scale = Math.max(fitScale, zoom);
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: cvKey(accountId, id),
      queryFn: ({ signal }: { signal: AbortSignal }) => cvApi.detail(id, signal),
      retry: false,
    })),
  });
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const paperWidth = (210 * 96) / 25.4;
        setFitScale(
          Math.min(1, Math.max(0.2, (entry.contentRect.width / ids.length - 72) / paperWidth)),
        );
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ids.length]);
  function syncScroll(from: HTMLElement) {
    const expected = expectedScroll.current.get(from);
    expectedScroll.current.delete(from);
    if (expected !== undefined && Math.abs(from.scrollTop - expected) <= 1) return;
    const range = from.scrollHeight - from.clientHeight;
    if (range <= 0) return;
    const fraction = from.scrollTop / range;
    for (const to of root.current?.querySelectorAll<HTMLElement>("[data-comparison-scroll]") ??
      []) {
      if (from === to) continue;
      const target = fraction * (to.scrollHeight - to.clientHeight);
      if (Math.abs(to.scrollTop - target) <= 1) continue;
      expectedScroll.current.set(to, target);
      to.scrollTop = target;
    }
  }
  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t.professional.zoomOut}
          disabled={scale <= fitScale}
          onClick={() => setZoom(Math.max(fitScale, Math.round((scale - 0.1) * 100) / 100))}
        >
          −
        </Button>
        <span className="min-w-12 text-center text-xs tabular-nums">
          {new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
            scale,
          )}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t.professional.zoomIn}
          disabled={!fitScale || scale >= 1.5}
          onClick={() => setZoom(Math.min(1.5, Math.round((scale + 0.1) * 100) / 100))}
        >
          +
        </Button>
      </div>
      <div ref={root} className="grid min-h-0 flex-1 auto-cols-fr grid-flow-col gap-2">
        {queries.map((query, index) => (
          <section
            key={ids[index]}
            className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border"
          >
            {query.data ? (
              <>
                <div className="border-b border-border px-4 py-3">
                  <h3 className="truncate font-medium">{query.data.name}</h3>
                  {query.data.specialization && (
                    <p className="truncate text-xs text-muted-foreground">
                      {query.data.specialization}
                    </p>
                  )}
                </div>
                {scale > 0 && (
                  <CvPreview
                    profile={query.data.profile}
                    comparison={{ scale, onScroll: syncScroll }}
                  />
                )}
              </>
            ) : query.error ? (
              <div className="space-y-3 p-4">
                <p role="alert" className="text-destructive">
                  {cvErrorText(query.error, locale)}
                </p>
                <Button size="sm" onClick={() => void query.refetch()}>
                  {t.retry}
                </Button>
              </div>
            ) : (
              <Skeleton className="m-4 flex-1" aria-label={t.cvs.loading} />
            )}
          </section>
        ))}
      </div>
    </>
  );
}
