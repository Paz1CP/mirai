"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  professionalProfileSchema,
  preferencesSchema,
  type ProfessionalProfile,
  type JobPreferences,
} from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { useProfile } from "./ProfileProvider";
import { ProfileEditor } from "./ProfileEditor";
import { PreferencesEditor } from "./PreferencesEditor";
import { profileApi, ProfileError } from "./profileApi";
import { profileErrorText } from "./profileText";
import { validProfileDates } from "./profileDates";
import { notifySuccess } from "@/shared/notifySuccess";
import { DocumentWorkspace } from "./DocumentWorkspace";

export function ProfessionalWorkspace({
  initial,
  initialRevision,
  initialPreferences,
}: {
  initial: ProfessionalProfile;
  initialRevision: string;
  initialPreferences: JobPreferences;
}) {
  const state = useProfile();
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const p = t.professional;
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [baseline, setBaseline] = useState(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [preferences, setPreferences] = useState(() => structuredClone(initialPreferences));
  const [preferencesBaseline, setPreferencesBaseline] = useState(initialPreferences);
  const profileDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const preferencesDirty = JSON.stringify(preferences) !== JSON.stringify(preferencesBaseline);
  const [tab, setTab] = useState<"review" | "preferences">("review");
  const save = useMutation({
    mutationFn: async ({
      profile,
      preferences: snapshot,
      saveProfile,
      savePreferences,
    }: {
      profile: ProfessionalProfile;
      preferences: JobPreferences;
      saveProfile: boolean;
      savePreferences: boolean;
    }) => {
      const parsedProfile = professionalProfileSchema.safeParse(profile);
      const parsedPreferences = preferencesSchema.safeParse(snapshot);
      if (!parsedProfile.success || !parsedPreferences.success)
        throw new ProfileError("INVALID_REQUEST");
      if (!validProfileDates(parsedProfile.data)) throw new ProfileError("INVALID_PROFILE_DATES");
      if (saveProfile) {
        const result = await profileApi.save(parsedProfile.data, revision);
        if (!result.profile) throw new ProfileError("PROFILE_REQUIRED");
        const saved = result.profile;
        setBaseline(saved);
        setRevision(result.revision ?? "");
        setDraft((current) =>
          JSON.stringify(current) === JSON.stringify(profile) ? saved : current,
        );
        client.setQueryData(state.profileKey, result);
      }
      if (savePreferences) {
        const result = await profileApi.savePreferences(parsedPreferences.data);
        setPreferencesBaseline(result.preferences);
        setPreferences((current) =>
          JSON.stringify(current) === JSON.stringify(snapshot) ? result.preferences : current,
        );
        client.setQueryData<Awaited<ReturnType<typeof profileApi.preferences>>>(
          state.preferencesKey,
          (current) => (current ? { ...current, preferences: result.preferences } : result),
        );
      }
      client.setQueryData(state.profileKey, await profileApi.confirm());
      client.setQueryData(state.profileKey, await profileApi.complete());
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["cvs", state.accountId] });
      notifySuccess(p.saved);
    },
  });
  const saveProfile = () => {
    if (save.isPending || !state.available) return;
    save.mutate({
      profile: structuredClone(draft),
      preferences: structuredClone(preferences),
      saveProfile: profileDirty,
      savePreferences: preferencesDirty || !state.profile.data?.onboarding_completed,
    });
  };
  const unchanged =
    !profileDirty &&
    !preferencesDirty &&
    state.profile.data?.confirmed &&
    state.profile.data?.onboarding_completed;
  return (
    <div className="cv-review-enter flex min-h-0 min-w-0 flex-1">
      <DocumentWorkspace profile={draft}>
        <section
          className="flex min-h-0 min-w-0 flex-col border-s border-border"
          aria-label={p.review}
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border p-3">
            <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label={p.review}>
              {(["review", "preferences"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={tab === value ? "secondary" : "ghost"}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {p[value]}
                </Button>
              ))}
            </nav>
            <Button
              className="ms-auto shrink-0"
              size="sm"
              disabled={!state.available || save.isPending || !!unchanged}
              onClick={saveProfile}
            >
              {save.isPending ? p.savingProfile : p.saveProfile}
            </Button>
          </div>
          {save.error && (
            <p role="alert" className="px-5 py-3 text-sm text-destructive">
              {save.error instanceof ProfileError && save.error.code === "INVALID_REQUEST"
                ? p.validation
                : save.error instanceof ProfileError && save.error.code === "INVALID_PROFILE_DATES"
                  ? p.dateValidation
                  : profileErrorText(save.error, locale)}
            </p>
          )}
          <fieldset
            disabled={!state.available}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5"
          >
            <div hidden={tab !== "review"}>
              <ProfileEditor draft={draft} setDraft={setDraft} onSave={saveProfile} />
            </div>
            <div hidden={tab !== "preferences"}>
              {state.preferences.data && (
                <PreferencesEditor
                  draft={preferences}
                  setDraft={setPreferences}
                  suggestions={state.profile.data?.extraction?.suggested_roles ?? []}
                  onSave={saveProfile}
                />
              )}
            </div>
          </fieldset>
        </section>
      </DocumentWorkspace>
    </div>
  );
}
