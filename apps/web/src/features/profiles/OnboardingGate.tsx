"use client";
import type { ReactNode } from "react";
import { useProfile } from "./ProfileProvider";
import { ProfessionalPage } from "./ProfessionalPage";
export function OnboardingGate({ children }: { children: ReactNode }) {
  const state = useProfile();
  return state.profile.data?.onboarding_completed && state.profile.data.confirmed ? (
    children
  ) : (
    <ProfessionalPage />
  );
}
