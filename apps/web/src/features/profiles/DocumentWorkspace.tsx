"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import type { ProfessionalProfile } from "@mirai/contracts";

export const CvPreview = dynamic(() => import("./MiraiCv").then((module) => module.MiraiCv), {
  ssr: false,
});

export function DocumentWorkspace({
  profile,
  name,
  children,
}: {
  profile: ProfessionalProfile;
  name?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)] overflow-hidden">
      <CvPreview profile={profile} name={name} />
      {children}
    </div>
  );
}
