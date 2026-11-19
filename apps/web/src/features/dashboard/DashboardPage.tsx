"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { applicationStatusSchema, campaignStatusSchema } from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { ApplicationDetail } from "@/features/applications/ApplicationDetail";
import { ApplicationExplorer } from "@/features/applications/ApplicationExplorer";
import { resultsApi } from "@/features/applications/resultsApi";

const campaignsPerPage = 6;

export function DashboardPage() {
  const { t, locale } = useI18n();
  const label = t.results;
  const [campaignId, setCampaignId] = useState<string>();
  const [page, setPage] = useState(1);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const summary = useQuery({
    queryKey: ["results", "dashboard"],
    queryFn: ({ signal }) => resultsApi.dashboard(signal),
  });
  const campaigns = useQuery({
    queryKey: ["results", "campaigns", page],
    queryFn: ({ signal }) => resultsApi.campaigns({ page, pageSize: campaignsPerPage }, signal),
    placeholderData: keepPreviousData,
  });
  const campaign = useQuery({
    queryKey: ["results", "campaign", campaignId],
    queryFn: ({ signal }) => resultsApi.campaign(campaignId!, signal),
    enabled: Boolean(campaignId),
  });
  const counts = campaignId ? campaign.data?.counts : summary.data?.counts;
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const pageCount = Math.max(1, Math.ceil((campaigns.data?.total ?? 0) / campaignsPerPage));
  return (
    <main className="min-w-0 space-y-7 p-5 lg:p-8">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t.dashboard}</h2>
        <p className="text-sm text-muted-foreground">{label.description}</p>
      </header>
      {summary.isError || campaign.isError ? (
        <div className="flex items-center gap-3 rounded-xl border border-border p-4" role="alert">
          <p className="text-sm text-destructive">{label.resultLoadError}</p>
          <Button
            variant="outline"
            onClick={() => {
              if (summary.isError) void summary.refetch();
              if (campaign.isError) void campaign.refetch();
            }}
          >
            {t.retry}
          </Button>
        </div>
      ) : !counts ? (
        <Skeleton className="h-20 rounded-xl" aria-label={label.loading} />
      ) : (
        <dl className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-5 lg:divide-x lg:divide-y-0">
          {applicationStatusSchema.options.map((status) => (
            <div key={status} className="flex flex-col gap-1 px-4 py-3">
              <dt className="text-xs text-muted-foreground">{label.applicationStatus[status]}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {number.format(counts[status])}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-3 rounded-xl border border-border p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{label.campaigns}</h3>
            {campaignId && (
              <Button variant="outline" size="sm" onClick={() => setCampaignId(undefined)}>
                {label.allCampaigns}
              </Button>
            )}
          </header>
          {summary.data && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {campaignStatusSchema.options.map((status) => (
                <li key={status}>
                  {label.campaignStatus[status]} ·{" "}
                  {number.format(summary.data.campaignCounts[status])}
                </li>
              ))}
            </ul>
          )}
          {campaigns.isError ? (
            <div className="flex items-center gap-3" role="alert">
              <span className="text-sm text-destructive">{label.resultLoadError}</span>
              <Button variant="outline" size="sm" onClick={() => void campaigns.refetch()}>
                {t.retry}
              </Button>
            </div>
          ) : !campaigns.data ? (
            <Skeleton className="h-20 rounded-lg" aria-label={label.loading} />
          ) : campaigns.data.items.length ? (
            <ul className="divide-y divide-border">
              {campaigns.data.items.map((item) => (
                <li key={item.id}>
                  <Button
                    variant={campaignId === item.id ? "secondary" : "ghost"}
                    className="my-1 h-auto w-full justify-between gap-3 py-2"
                    aria-pressed={campaignId === item.id}
                    onClick={() => setCampaignId(item.id === campaignId ? undefined : item.id)}
                  >
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {label.campaignStatus[item.status]}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">{label.noCampaigns}</p>
          )}
          {pageCount > 1 && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || campaigns.isPlaceholderData}
                onClick={() => setPage(page - 1)}
              >
                {label.previous}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount || campaigns.isPlaceholderData}
                onClick={() => setPage(page + 1)}
              >
                {label.next}
              </Button>
            </div>
          )}
          {campaign.data && (
            <div className="space-y-2 border-t border-border pt-3 text-sm">
              <p className="font-medium">{campaign.data.title}</p>
              <p className="whitespace-pre-wrap wrap-break-word text-muted-foreground">
                {campaign.data.mandate}
              </p>
              {campaign.data.statusReason && (
                <p className="wrap-break-word">{campaign.data.statusReason}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {campaign.data.maxApplications === null
                  ? label.noLimit
                  : `${label.maxApplications} · ${number.format(campaign.data.maxApplications)}`}
              </p>
            </div>
          )}
        </section>
        <section className="min-w-0 space-y-3 rounded-xl border border-border p-4">
          <h3 className="font-semibold">{label.recent}</h3>
          {summary.data ? (
            summary.data.recent.length ? (
              <ul className="divide-y divide-border">
                {summary.data.recent.map((item) => (
                  <li key={item.id}>
                    <Button
                      variant="ghost"
                      className="my-1 h-auto w-full justify-between gap-3 py-2 text-left"
                      onClick={() => setApplicationId(item.id)}
                    >
                      <span className="min-w-0 truncate">
                        {item.jobTitle}
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.companyName}
                        </span>
                      </span>
                      <time
                        dateTime={item.updatedAt}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {date.format(new Date(item.updatedAt))}
                      </time>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">{label.noApplications}</p>
            )
          ) : (
            !summary.isError && <Skeleton className="h-20 rounded-lg" aria-label={label.loading} />
          )}
        </section>
      </div>
      <section className="space-y-3">
        <h3 className="font-semibold">{t.applications}</h3>
        <ApplicationExplorer campaignId={campaignId} configurable onSelect={setApplicationId} />
      </section>
      <ApplicationDetail id={applicationId} onClose={() => setApplicationId(null)} />
    </main>
  );
}
