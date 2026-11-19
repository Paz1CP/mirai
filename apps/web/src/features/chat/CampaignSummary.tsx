"use client";

import { useQuery } from "@tanstack/react-query";
import { applicationStatusSchema } from "@mirai/contracts";
import { resultsApi } from "@/features/applications/resultsApi";
import { useI18n } from "@/shared/i18n/I18nProvider";

export function CampaignSummary({ id, working }: { id: string; working?: boolean }) {
  const { locale, t } = useI18n();
  const query = useQuery({
    queryKey: ["results", "campaign", id],
    queryFn: ({ signal }) => resultsApi.campaign(id, signal),
  });
  const data = query.data;
  if (!data) return null;
  const format = new Intl.NumberFormat(locale);
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{data.title}</h3>
        <span className={working ? "text-primary" : "text-muted-foreground"}>
          {t.results.campaignStatus[data.status]}
        </span>
      </div>
      <p className="whitespace-pre-wrap wrap-break-word text-muted-foreground">{data.mandate}</p>
      {Object.keys(data.criteria).length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t.conversation.criteria}
          </summary>
          <dl className="mt-2 space-y-1">
            {Object.entries(data.criteria).map(([key, value]) => (
              <div key={key} className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="wrap-break-word">
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {data.maxApplications !== null && (
        <p>
          {t.results.maxApplications} · {format.format(data.maxApplications)}
        </p>
      )}
      <dl className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3">
        {applicationStatusSchema.options.map((status) => (
          <div key={status} className="flex gap-1.5">
            <dt className="text-muted-foreground">{t.results.applicationStatus[status]}</dt>
            <dd className="tabular-nums">{format.format(data.counts[status])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
