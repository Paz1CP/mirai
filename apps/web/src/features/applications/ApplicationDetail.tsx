"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { WorkspaceLink } from "@/features/sessions/WorkspaceLink";
import { resultsApi } from "./resultsApi";

export function ApplicationDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { locale, t } = useI18n();
  const label = t.results;
  const query = useQuery({
    queryKey: ["results", "application", id],
    queryFn: ({ signal }) => resultsApi.application(id!, signal),
    enabled: Boolean(id),
  });
  const application = query.data;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const facts = application && [
    [label.status, label.applicationStatus[application.status]],
    [label.campaign, application.campaignTitle],
    [label.platform, application.platform],
    [label.location, application.location],
    [label.createdAt, date.format(new Date(application.createdAt))],
    [label.updatedAt, date.format(new Date(application.updatedAt))],
    [label.submittedAt, application.submittedAt && date.format(new Date(application.submittedAt))],
  ];
  return (
    <Sheet
      open={Boolean(id)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        showCloseButton={false}
        className="w-[min(100%,34rem)] gap-6 overflow-y-auto p-6 sm:max-w-[34rem]"
      >
        <SheetClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.close}
              className="absolute right-4 top-4 text-lg"
            />
          }
        >
          <span aria-hidden="true">×</span>
        </SheetClose>
        <header className="space-y-1 pr-8">
          <SheetTitle className="text-xl">{application?.jobTitle ?? label.detail}</SheetTitle>
          <SheetDescription className={application ? undefined : "sr-only"}>
            {application?.companyName ?? label.detail}
          </SheetDescription>
        </header>
        {query.isError ? (
          <div className="flex flex-wrap items-center gap-3" role="alert">
            <span className="text-destructive">{label.resultLoadError}</span>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t.retry}
            </Button>
          </div>
        ) : application && facts ? (
          <>
            <a
              href={application.jobUrl}
              target="_blank"
              rel="noreferrer"
              className="w-fit text-primary underline-offset-4 hover:underline"
            >
              {label.offer}
            </a>
            <dl className="divide-y divide-border border-y border-border">
              {facts
                .filter(([, value]) => value)
                .map(([name, value]) => (
                  <div key={name} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-3">
                    <dt className="text-muted-foreground">{name}</dt>
                    <dd className="wrap-break-word">{value}</dd>
                  </div>
                ))}
            </dl>
            {application.statusReason && (
              <section className="space-y-2">
                <h3 className="font-medium">{label.reason}</h3>
                <p className="whitespace-pre-wrap wrap-break-word leading-relaxed text-muted-foreground">
                  {application.statusReason}
                </p>
              </section>
            )}
            {application.documents.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-medium">{t.documents}</h3>
                <ul className="space-y-2">
                  {application.documents.map((document) => (
                    <li key={`${document.kind}:${document.id}`}>
                      <WorkspaceLink
                        className="wrap-break-word text-primary underline-offset-4 hover:underline"
                        href={`/documents?kind=${document.kind}&id=${document.id}`}
                      >
                        {document.name}
                      </WorkspaceLink>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <Skeleton className="h-40 rounded-xl" aria-label={label.loading} />
        )}
      </SheetContent>
    </Sheet>
  );
}
