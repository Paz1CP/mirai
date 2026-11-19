import { notFound } from "next/navigation";
import { z } from "zod";
import { ProfessionalPage } from "@/features/profiles/ProfessionalPage";
import { OnboardingGate } from "@/features/profiles/OnboardingGate";
import { CvLibrary } from "@/features/cvs/CvLibrary";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
const areas = ["dashboard", "applications", "documents", "profile"];
export default async function AreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const area = (await params).area;
  if (!areas.includes(area)) notFound();
  if (area === "profile") return <ProfessionalPage />;
  if (area === "dashboard") return <DashboardPage />;
  if (area === "applications") return <ApplicationsPage />;
  const reference = z
    .object({ kind: z.enum(["cv", "original"]), id: z.uuid() })
    .safeParse(await searchParams);
  return (
    <OnboardingGate>
      <CvLibrary key={reference.data?.id ?? "library"} reference={reference.data} />
    </OnboardingGate>
  );
}
