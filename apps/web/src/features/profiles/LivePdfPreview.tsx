"use client";
import { useEffect, useRef } from "react";

export function LivePdfPreview({
  blob,
  scale,
  label,
  onError,
}: {
  blob: Blob;
  scale: number;
  label: string;
  onError: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const failure = useRef(onError);
  useEffect(() => {
    failure.current = onError;
  }, [onError]);
  useEffect(() => {
    let cancelled = false;
    async function render() {
      const library = await import("pdfjs-dist");
      library.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const task = library.getDocument({ data: await blob.arrayBuffer() });
      try {
        const pdf = await task.promise;
        const fragment = document.createDocumentFragment();
        const resolution = window.devicePixelRatio || 1;
        for (let number = 1; number <= pdf.numPages && !cancelled; number++) {
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: (scale * 96) / 72 });
          const sheet = document.createElement("div");
          sheet.className = "relative shrink-0 bg-document-paper shadow-sm";
          sheet.style.width = `${viewport.width}px`;
          sheet.style.height = `${viewport.height}px`;
          sheet.style.setProperty("--total-scale-factor", String(viewport.scale));
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width * resolution);
          canvas.height = Math.ceil(viewport.height * resolution);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.className = "mix-blend-multiply";
          canvas.setAttribute("aria-hidden", "true");
          await page.render({ canvas, viewport, transform: [resolution, 0, 0, resolution, 0, 0] })
            .promise;
          sheet.append(canvas);
          const text = document.createElement("div");
          text.className = "cv-pdf-text";
          await new library.TextLayer({
            container: text,
            viewport,
            textContentSource: await page.getTextContent(),
          }).render();
          sheet.append(text);
          const annotations: { url?: string; rect?: number[] }[] = await page.getAnnotations();
          for (const annotation of annotations) {
            if (!annotation.url || !/^(https?:|mailto:)/i.test(annotation.url) || !annotation.rect)
              continue;
            const [left, bottom, right, top] = annotation.rect;
            if (left === undefined || bottom === undefined || right === undefined || top === undefined) continue;
            const [x1, y1] = viewport.convertToViewportPoint(left, bottom);
            const [x2, y2] = viewport.convertToViewportPoint(right, top);
            if (x1 === undefined || x2 === undefined || y1 === undefined || y2 === undefined)
              continue;
            const link = document.createElement("a");
            link.href = annotation.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.ariaLabel = annotation.url;
            Object.assign(link.style, {
              position: "absolute",
              left: `${Math.min(x1, x2)}px`,
              top: `${Math.min(y1, y2)}px`,
              width: `${Math.abs(x2 - x1)}px`,
              height: `${Math.abs(y2 - y1)}px`,
            });
            sheet.append(link);
          }
          fragment.append(sheet);
        }
        const target = container.current;
        if (!cancelled && target) {
          const scroller = target.parentElement;
          const top = scroller?.scrollTop ?? 0;
          const left = scroller?.scrollLeft ?? 0;
          // Commit fully rendered pages together, keeping the previous document visible until then.
          target.replaceChildren(fragment);
          if (scroller) {
            scroller.scrollTop = top;
            scroller.scrollLeft = left;
          }
        }
      } finally {
        await task.destroy();
      }
    }
    void render().catch(() => {
      if (!cancelled) failure.current();
    });
    return () => {
      cancelled = true;
    };
  }, [blob, scale]);
  return (
    <div
      ref={container}
      aria-label={label}
      className="flex min-w-max flex-col items-center gap-6 p-6"
    />
  );
}
