"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { useProfile } from "./ProfileProvider";
import { profileErrorText } from "./profileText";
import { ImportDocuments } from "./ImportDocuments";
import { ExtractionProgress } from "./ExtractionProgress";
import { ProfessionalWorkspace } from "./ProfessionalWorkspace";
import { AccountSettings } from "./AccountSettings";
import { ProfileError } from "./profileApi";
export function ProfessionalPage() {
  const state = useProfile();
  const { t, locale } = useI18n();
  const p = t.professional;
  const profile = state.profile.data;
  const search = useSearchParams();
  const [showSettings, setShowSettings] = useState<boolean>();
  const deletionPending = [state.profile.error, state.preferences.error].some(
    (error) => error instanceof ProfileError && error.code === "ACCOUNT_DELETION_PENDING",
  );
  if (deletionPending)
    return <AccountSettings accountId={state.accountId} />;
  if (!profile?.profile && (showSettings ?? search.get("tab") === "settings"))
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border p-3">
          <Button size="sm" variant="ghost" onClick={() => setShowSettings(false)}>{p.review}</Button>
        </div>
        <AccountSettings accountId={state.accountId} />
      </div>
    );
  if (state.processing)
    return (
      <ExtractionProgress
        key={state.processingStartedAt}
        onComplete={() => {
          state.finishProcessing();
        }}
      />
    );
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <Button size="sm" variant="ghost" onClick={() => setShowSettings(true)}>{t.accountSettings.title}</Button>
      </div>
      <ImportDocuments />
    </div>
  );
}
