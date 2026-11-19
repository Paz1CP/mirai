"use client";

import { useDeferredValue, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  applicationStatusSchema,
  type ApplicationListQuery,
  type ApplicationStatus,
} from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { resultsApi } from "./resultsApi";

const columns = ["jobTitle", "companyName", "platform", "status", "updatedAt", "location"] as const;
const defaultColumns = columns.filter((column) => column !== "location");
type Column = (typeof columns)[number];
const pageSize = 20;
const statusColors: Record<ApplicationStatus, string> = {
  confirmed: "text-success",
  unconfirmed: "text-warning",
  pending_review: "text-warning",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
};

export function ApplicationExplorer({
  campaignId,
  configurable = false,
  onSelect,
}: {
  campaignId?: string;
  configurable?: boolean;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const label = t.results;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>();
  const [sort, setSort] = useState<ApplicationListQuery["sort"]>("updatedAt");
  const [direction, setDirection] = useState<ApplicationListQuery["direction"]>("desc");
  const [paging, setPaging] = useState({ page: 1, campaignId });
  const [visible, setVisible] = useState<readonly Column[]>(defaultColumns);
  const q = useDeferredValue(search.trim());
  const page = paging.campaignId === campaignId ? paging.page : 1;
  const resetPage = () => setPaging({ page: 1, campaignId });
  const filters = { page, pageSize, campaignId, status, q, sort, direction };
  const query = useQuery({
    queryKey: ["results", "applications", filters],
    queryFn: ({ signal }) => resultsApi.applications(filters, signal),
    placeholderData: keepPreviousData,
  });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize));
  const format = new Intl.NumberFormat(locale);
  function sortBy(column: Column) {
    if (column === "platform" || column === "location") return;
    setDirection(sort === column && direction === "asc" ? "desc" : "asc");
    setSort(column);
    resetPage();
  }

  return (
    <section className="min-w-0 space-y-4" aria-label={t.applications}>
      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          className="h-9 min-w-48 flex-1"
          placeholder={label.search}
          aria-label={label.search}
          maxLength={240}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetPage();
          }}
        />
        <Select
          value={status ?? "all"}
          onValueChange={(value) => {
            setStatus(applicationStatusSchema.safeParse(value).data);
            resetPage();
          }}
        >
          <SelectTrigger className="h-9 min-w-40" aria-label={label.status}>
            <SelectValue>
              {status ? label.applicationStatus[status] : label.allStatuses}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{label.allStatuses}</SelectItem>
            {applicationStatusSchema.options.map((option) => (
              <SelectItem key={option} value={option}>
                {label.applicationStatus[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {configurable && (
          <Popover>
            <PopoverTrigger render={<Button variant="outline" className="h-9" />}>
              {label.columns}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44">
              {columns.map((column) => (
                <label key={column} className="flex items-center gap-2 rounded-md px-2 py-1">
                  <Checkbox
                    checked={visible.includes(column)}
                    disabled={column === "jobTitle"}
                    onCheckedChange={(checked) => {
                      setVisible((current) =>
                        checked ? [...current, column] : current.filter((item) => item !== column),
                      );
                    }}
                  />
                  {label[column]}
                </label>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {query.isError ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">{label.resultLoadError}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t.retry}
          </Button>
        </div>
      ) : !query.data ? (
        <Skeleton className="h-52 rounded-xl" aria-label={label.loading} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="overflow-x-auto" aria-busy={query.isFetching}>
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-muted-foreground">
                <tr>
                  {columns
                    .filter((column) => visible.includes(column))
                    .map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="px-4 py-3 font-medium whitespace-nowrap"
                        aria-sort={
                          sort === column
                            ? direction === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        {column === "platform" || column === "location" ? (
                          label[column]
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-mx-2"
                            onClick={() => sortBy(column)}
                          >
                            {label[column]}{" "}
                            {sort === column && (
                              <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
                            )}
                          </Button>
                        )}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {query.data.items.map((item) => (
                  <tr key={item.id} className="border-t border-border hover:bg-card/65">
                    {columns
                      .filter((column) => visible.includes(column))
                      .map((column) => (
                        <td key={column} className="px-4 py-3">
                          {column === "jobTitle" ? (
                            <Button
                              variant="link"
                              className="h-auto whitespace-normal p-0 text-left font-medium text-foreground"
                              onClick={() => onSelect(item.id)}
                            >
                              {item.jobTitle}
                            </Button>
                          ) : column === "status" ? (
                            <span className={statusColors[item.status]}>
                              {label.applicationStatus[item.status]}
                            </span>
                          ) : column === "updatedAt" ? (
                            <time dateTime={item.updatedAt} className="whitespace-nowrap">
                              {date.format(new Date(item.updatedAt))}
                            </time>
                          ) : (
                            (item[column] ?? "—")
                          )}
                        </td>
                      ))}
                  </tr>
                ))}
                {!query.data.items.length && (
                  <tr>
                    <td
                      colSpan={visible.length}
                      className="border-t border-border p-10 text-center text-muted-foreground"
                    >
                      {q || status || campaignId ? label.noMatches : label.noApplications}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {format.format(page)} / {format.format(pages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || query.isPlaceholderData}
                onClick={() => setPaging({ page: page - 1, campaignId })}
              >
                {label.previous}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages || query.isPlaceholderData}
                onClick={() => setPaging({ page: page + 1, campaignId })}
              >
                {label.next}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
