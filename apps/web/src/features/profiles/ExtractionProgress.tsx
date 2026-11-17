"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { useProfile } from "./ProfileProvider";
import { profileErrorText } from "./profileText";
import { estimatedExtractionProgress } from "./estimatedProgress";

export function ExtractionProgress({ onComplete }: { onComplete: () => void }) {
  const state = useProfile();
  const { t, locale } = useI18n();
  const p = t.professional;
  const [elapsed, setElapsed] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const complete = state.importState?.extraction === "done";
  const failed = state.importState?.extraction === "failed";
  const finish = useRef(onComplete);
  useEffect(() => {
    finish.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    if (complete || failed) return;
    const timer = setInterval(() => setElapsed(Date.now() - state.processingStartedAt), 500);
    return () => clearInterval(timer);
  }, [complete, failed, state.processingStartedAt]);
  useEffect(() => {
    if (!complete) return;
    const fade = setTimeout(() => setLeaving(true), 900);
    const next = setTimeout(() => finish.current(), 1200);
    return () => {
      clearTimeout(fade);
      clearTimeout(next);
    };
  }, [complete]);
  const phase = failed ? "error" : complete ? "finish" : state.starting ? "prepare" : "read";
  const title = p.processing[phase].title;
  const description = failed
    ? profileErrorText(state.importState?.extractionError ?? state.startError, locale)
    : p.processing[phase].description;
  const value = complete ? 100 : Math.floor(estimatedExtractionProgress(elapsed));
  return (
    <section
      className={`cv-processing relative isolate flex min-h-[calc(100svh-5rem)] flex-col items-center justify-center overflow-hidden px-8 py-12 text-center ${leaving ? "cv-processing-leave" : ""}`}
      data-paused={failed || complete}
      aria-busy={!failed && !complete}
      aria-labelledby="cv-processing-title"
    >
      <div className="cv-import-glow cv-processing-glow" aria-hidden="true" />
      <Image
        src="/images/cv_folder.png"
        width={320}
        height={315}
        priority
        alt=""
        className="cv-processing-art mb-10 h-56 w-auto xl:h-72"
      />
      <div key={phase} className="cv-processing-copy min-h-24 max-w-xl" aria-live="polite">
        <h2 id="cv-processing-title" className="text-2xl font-semibold tracking-tight xl:text-3xl">
          {title}
        </h2>
        <p
          className="mt-4 text-sm leading-relaxed text-muted-foreground xl:text-base"
          role={failed ? "alert" : undefined}
        >
          {description}
        </p>
      </div>
      {failed ? (
        <Button className="mt-8" disabled={!state.available} onClick={state.retryExtraction}>
          {p.retry}
        </Button>
      ) : (
        <div className="mt-8 w-full max-w-md">
          <Progress value={value} className="cv-processing-progress" aria-label={p.processingLabel}>
            <ProgressLabel className="text-xs font-normal text-muted-foreground">
              {p.processingLabel}
            </ProgressLabel>
            <ProgressValue className="text-xs text-foreground" />
          </Progress>
          <p className="mt-5 text-xs text-muted-foreground">{p.processingWait}</p>
        </div>
      )}
    </section>
  );
}

