import { notFound } from "next/navigation";
import { getLocale } from "@/shared/i18n/server";
import { messages } from "@/shared/i18n/catalog";
const areas = ["dashboard", "applications", "documents", "profile"];
export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  if (!areas.includes((await params).area)) notFound();
  return (
    <p className="p-8 text-sm text-muted-foreground">{messages[await getLocale()].comingNext}</p>
  );
}
