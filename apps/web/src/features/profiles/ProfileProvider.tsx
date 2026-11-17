"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { profileApi, ProfileError } from "./profileApi";
import { useI18n } from "@/shared/i18n/I18nProvider";

type Status = "idle" | "pending" | "done" | "failed";
type ImportState = {
  operationId?: string;
  files: File[];
  note: string;
  extraction: Status;
  extractionError?: string;
  uploads: Array<{ status: Status; error?: string }>;
};
function useProfileState(accountId: string, available: boolean) {
  const { locale } = useI18n();
  const client = useQueryClient();
  const profileKey = ["professional-profile", accountId];
  const preferencesKey = ["job-preferences", accountId];
  const profile = useQuery({
    queryKey: profileKey,
    queryFn: ({ signal }) => profileApi.read(signal),
    enabled: available,
    retry: false,
  });
  const preferences = useQuery({
    queryKey: preferencesKey,
    queryFn: ({ signal }) => profileApi.preferences(signal),
    enabled: available,
    retry: false,
  });
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  const [processing, setProcessing] = useState(false);
  const [processingStartedAt, setProcessingStartedAt] = useState(0);
  const errorCode = (error: unknown) =>
    error instanceof ProfileError ? error.code : "NETWORK_ERROR";
  const refresh = () => client.invalidateQueries({ queryKey: profileKey });
  async function extract(operationId: string, files: File[], note: string) {
    setImportState((state) =>
      state?.operationId === operationId
        ? { ...state, extraction: "pending", extractionError: undefined }
        : state,
    );
    try {
      const result = await profileApi.extract(operationId, files, note, locale);
      client.setQueryData(profileKey, result);
      setImportState((state) =>
        state?.operationId === operationId ? { ...state, extraction: "done" } : state,
      );
    } catch (error) {
      setImportState((state) =>
        state?.operationId === operationId
          ? { ...state, extraction: "failed", extractionError: errorCode(error) }
          : state,
      );
    }
  }
  async function upload(operationId: string, files: File[], index: number) {
    setImportState((state) =>
      state?.operationId === operationId
        ? {
            ...state,
            uploads: state.uploads.map((item, i) => (i === index ? { status: "pending" } : item)),
          }
        : state,
    );
    try {
      await profileApi.upload(operationId, files[index]!, index === 0);
      await refresh();
      setImportState((state) =>
        state?.operationId === operationId
          ? {
              ...state,
              uploads: state.uploads.map((item, i) => (i === index ? { status: "done" } : item)),
            }
          : state,
      );
    } catch (error) {
      setImportState((state) =>
        state?.operationId === operationId
          ? {
              ...state,
              uploads: state.uploads.map((item, i) =>
                i === index ? { status: "failed", error: errorCode(error) } : item,
              ),
            }
          : state,
      );
    }
  }
  async function start(files: File[], filesOnly = false, note = "") {
    setStarting(true);
    setStartError(undefined);
    setProcessing(!filesOnly);
    setProcessingStartedAt(Date.now());
    setImportState({
      files,
      note,
      extraction: filesOnly ? "idle" : "pending",
      uploads: files.map(() => ({ status: "idle" })),
    });
    try {
      const { operationId } = await profileApi.begin();
      setImportState({
        operationId,
        files,
        note,
        extraction: filesOnly ? "idle" : "pending",
        uploads: files.map(() => ({ status: "pending" })),
      });
      // Independent requests let review begin while object storage is still completing.
      if (!filesOnly) void extract(operationId, files, note);
      files.forEach((_, index) => void upload(operationId, files, index));
    } catch (error) {
      setStartError(errorCode(error));
      setImportState((state) =>
        state ? { ...state, extraction: "failed", extractionError: errorCode(error) } : state,
      );
    } finally {
      setStarting(false);
    }
  }
  return {
    accountId,
    available,
    profileKey,
    preferencesKey,
    profile,
    preferences,
    importState,
    starting,
    startError,
    processing,
    processingStartedAt,
    finishProcessing: () => setProcessing(false),
    start,
    refresh,
    retryExtraction: () => {
      if (!importState || starting || importState.extraction === "pending") return;
      setProcessingStartedAt(Date.now());
      if (importState.operationId)
        void extract(importState.operationId, importState.files, importState.note);
      else void start(importState.files, false, importState.note);
    },
    retryUpload: (index: number) => {
      if (importState?.operationId) void upload(importState.operationId, importState.files, index);
    },
  };
}
const ProfileContext = createContext<ReturnType<typeof useProfileState> | null>(null);
export function ProfileProvider({
  accountId,
  available,
  children,
}: {
  accountId: string;
  available: boolean;
  children: ReactNode;
}) {
  const state = useProfileState(accountId, available);
  return <ProfileContext.Provider value={state}>{children}</ProfileContext.Provider>;
}
export function useProfile() {
  const state = useContext(ProfileContext);
  if (!state) throw new Error("PROFILE_PROVIDER_MISSING");
  return state;
}
