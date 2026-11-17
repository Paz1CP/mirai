import { notFound } from "next/navigation";
import { getLocale } from "@/shared/i18n/server";
import { messages } from "@/shared/i18n/catalog";
import { ProfessionalPage } from "@/features/profiles/ProfessionalPage";
const areas = ["dashboard", "applications", "documents", "profile"];
export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const area = (await params).area;
  if (!areas.includes(area)) notFound();
  if (area === "profile" || area === "documents") return <ProfessionalPage />;
  return (
    <p className="p-8 text-sm text-muted-foreground">{messages[await getLocale()].comingNext}</p>
  );
}
