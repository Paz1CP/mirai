"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { cvMetadataSchema, professionalProfileSchema, type CvDetail } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CvPreview, DocumentWorkspace } from "@/features/profiles/DocumentWorkspace";
import { ProfileEditor } from "@/features/profiles/ProfileEditor";
import { ProfileError } from "@/features/profiles/profileApi";
import { validProfileDates } from "@/features/profiles/profileDates";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cvApi } from "./cvApi";
import { cvErrorText } from "./cvText";
import { CvDocumentDialog } from "./CvDocumentDialog";

type CvDraft = Pick<CvDetail, "name" | "specialization" | "profile" | "revision">;

export function CvDraftDialog({
  initial,
  title,
  submitLabel,
  mode,
  id,
  onSave,
  onClose,
}: {
  initial: CvDraft;
  title: string;
  submitLabel: string;
  mode: "view" | "edit" | "replace";
  id?: string;
  onSave: (draft: CvDraft) => Promise<CvDetail>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const c = t.cvs;
  const [editing, setEditing] = useState(mode !== "view");
  const [baseline, setBaseline] = useState(initial);
  const [profile, setProfile] = useState(initial.profile);
  const [name, setName] = useState(initial.name);
  const [specialization, setSpecialization] = useState(initial.specialization);
  const [discard, setDiscard] = useState(false);
  const [latest, setLatest] = useState<CvDetail>();
  const isReplacement = mode === "replace";
  const dirty =
    editing &&
    (isReplacement ||
      profile !== baseline.profile ||
      name !== baseline.name ||
      specialization !== baseline.specialization);
  const save = useMutation({
    mutationFn: async (revision: string) => {
      const content = professionalProfileSchema.safeParse(profile);
      const metadata = cvMetadataSchema.safeParse({ name, specialization });
      if (!content.success || !metadata.success) throw new ProfileError("INVALID_REQUEST");
      if (!validProfileDates(content.data)) throw new ProfileError("INVALID_PROFILE_DATES");
      return onSave({ ...metadata.data, profile: content.data, revision });
    },
    onSuccess: (stored) => {
      if (isReplacement) {
        onClose();
        return;
      }
      setBaseline(stored);
      setProfile(stored.profile);
      setName(stored.name);
      setSpecialization(stored.specialization);
    },
  });
  const readLatest = useMutation({
    mutationFn: () => (id ? cvApi.detail(id) : Promise.reject(new ProfileError("CV_NOT_FOUND"))),
    onSuccess: setLatest,
  });
  const conflict = save.error instanceof ProfileError && save.error.code === "CV_CONFLICT";
  function close() {
    if (save.isPending) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  useEffect(() => {
    if (!dirty && !save.isPending) return;
    const confirmExit = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", confirmExit);
    return () => window.removeEventListener("beforeunload", confirmExit);
  }, [dirty, save.isPending]);

  return (
    <CvDocumentDialog
      title={isReplacement ? title : baseline.name}
      description={
        mode === "replace" ? (
          <DialogDescription className="mt-2">{c.replacementNote}</DialogDescription>
        ) : undefined
      }
      onClose={close}
      action={
        editing ? (
          <Button
            size="sm"
            disabled={!dirty || save.isPending || conflict}
            onClick={() => save.mutate(baseline.revision)}
          >
            {save.isPending ? c.saving : save.error && !conflict ? t.retry : submitLabel}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setEditing(true)}>
            {c.edit}
          </Button>
        )
      }
    >
      {(save.error || readLatest.error) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2">
          <p role="alert" className={conflict ? "text-warning" : "text-destructive"}>
            {cvErrorText(readLatest.error ?? save.error, locale)}
          </p>
          {conflict && (
            <Button
              variant="outline"
              size="sm"
              disabled={readLatest.isPending}
              onClick={() => readLatest.mutate()}
            >
              {c.reviewLatest}
            </Button>
          )}
        </div>
      )}
      <DocumentWorkspace profile={profile} name={name || undefined}>
        <fieldset
          disabled={!editing || save.isPending}
          className="min-h-0 min-w-0 overflow-auto border-s border-border p-5"
        >
          {mode !== "replace" && (
            <div className="mb-4 grid gap-3 border-b border-border pb-4">
              <label className="grid gap-1.5">
                {c.name}
                <Input
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                {c.specialization}
                <Input
                  maxLength={120}
                  value={specialization}
                  onChange={(event) => setSpecialization(event.target.value)}
                />
              </label>
            </div>
          )}
          <ProfileEditor
            draft={profile}
            setDraft={setProfile}
            onSave={() => {
              if (dirty && !save.isPending && !conflict) save.mutate(baseline.revision);
            }}
          />
        </fieldset>
      </DocumentWorkspace>
      <Dialog open={discard} onOpenChange={setDiscard}>
        <DialogContent>
          <DialogTitle>{c.discardTitle}</DialogTitle>
          <DialogDescription>{c.discardDescription}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              {c.keepEditing}
            </Button>
            <Button variant="destructive" onClick={onClose}>
              {c.discard}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {latest && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setLatest(undefined);
          }}
        >
          <DialogContent className="flex h-[85svh] flex-col overflow-hidden sm:max-w-4xl">
            <DialogTitle className="pe-8">{latest.name}</DialogTitle>
            <DialogDescription>{c.conflictDescription}</DialogDescription>
            <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
              <CvPreview profile={latest.profile} name={latest.name} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLatest(undefined)}>
                {c.keepEditing}
              </Button>
              <Button
                onClick={() => {
                  setBaseline(latest);
                  setLatest(undefined);
                  save.mutate(latest.revision);
                }}
              >
                {c.confirmOverwrite}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </CvDocumentDialog>
  );
}
