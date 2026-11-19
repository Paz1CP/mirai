"use client";

import { useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { ApplicationDetail } from "./ApplicationDetail";
import { ApplicationExplorer } from "./ApplicationExplorer";

export function ApplicationsPage() {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t.applications}</h2>
        <p className="text-sm text-muted-foreground">{t.results.applicationsDescription}</p>
      </header>
      <ApplicationExplorer onSelect={setSelected} />
      <ApplicationDetail id={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
