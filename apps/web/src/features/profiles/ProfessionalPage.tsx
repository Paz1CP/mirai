"use client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { useProfile } from "./ProfileProvider";
import { profileErrorText } from "./profileText";
import { ImportDocuments } from "./ImportDocuments";
import { ExtractionProgress } from "./ExtractionProgress";
import { ProfessionalWorkspace } from "./ProfessionalWorkspace";
export function ProfessionalPage() {
  const state = useProfile();
  const { t, locale } = useI18n();
  const p = t.professional;
  const profile = state.profile.data;
  if (state.processing)
    return (
      <ExtractionProgress
        key={state.processingStartedAt}
        onComplete={() => {
          state.finishProcessing();
        }}
      />
    );
  if (!state.available && !profile?.profile) return <ImportDocuments />;
  if (state.profile.isPending || state.preferences.isPending)
    return (
      <div
        className="mx-auto w-full max-w-3xl space-y-6 p-8"
        aria-busy="true"
        aria-label={p.loading}
      >
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  if ((!profile && state.profile.error) || (!state.preferences.data && state.preferences.error))
    return (
      <div className="space-y-4 p-8">
        <p role="alert">
          {profileErrorText(state.profile.error ?? state.preferences.error, locale)}
        </p>
        <Button
          onClick={() => {
            void state.profile.refetch();
            void state.preferences.refetch();
          }}
        >
          {p.retry}
        </Button>
      </div>
    );
  return profile?.profile && state.preferences.data ? (
    <ProfessionalWorkspace
      key={state.accountId}
      initial={profile.profile}
      initialRevision={profile.revision ?? ""}
      initialPreferences={state.preferences.data.preferences}
    />
  ) : (
    <ImportDocuments />
  );
}
