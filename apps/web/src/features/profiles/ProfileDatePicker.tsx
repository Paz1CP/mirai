"use client";
import { useState } from "react";
import { es, enUS } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { profileDate, dateValue } from "./profileDates";

export function ProfileDatePicker({
  id,
  value,
  onChange,
  start,
  end,
  allowFuture = false,
  disabled = false,
  range = false,
}: {
  id: string;
  value: unknown;
  onChange: (value: string | null) => void;
  start?: unknown;
  end?: unknown;
  allowFuture?: boolean;
  disabled?: boolean;
  range?: boolean;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = profileDate(value);
  const parts = typeof value === "string" ? value.match(/\d{4}-\d{2}-\d{2}/g) : null;
  const from = range ? profileDate(parts?.[0]) : selected;
  const to = range ? profileDate(parts?.[1]) : undefined;
  const min = profileDate(start);
  const max = profileDate(end, true);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const futureLimit = allowFuture ? undefined : today;
  const latest = max && (!futureLimit || max < futureLimit) ? max : futureLimit;
  const format = (date: Date) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
      date,
    );
  const display =
    selected && typeof value === "string" && value.length === 10
      ? format(selected)
      : typeof value === "string"
        ? value
        : "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-10 w-full justify-start text-start font-normal"
          />
        }
      >
        {display || t.professional.selectDate}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          locale={locale === "es" ? es : enUS}
          captionLayout="dropdown"
          defaultMonth={from ?? min ?? today}
          labels={{
            labelNext: () => t.professional.nextMonth,
            labelPrevious: () => t.professional.previousMonth,
            labelMonthDropdown: () => t.professional.chooseMonth,
            labelYearDropdown: () => t.professional.chooseYear,
          }}
          startMonth={new Date(Math.min(1900, (from ?? today).getFullYear()), 0)}
          endMonth={latest ?? new Date(today.getFullYear() + 20, 11)}
          disabled={(date) => !!((min && date < min) || (latest && date > latest))}
          {...(range
            ? {
                mode: "range" as const,
                selected: from ? { from, to } : undefined,
                onSelect: (next: { from?: Date; to?: Date } | undefined) => {
                  onChange(
                    next?.from
                      ? `${dateValue(next.from)}${next.to ? ` – ${dateValue(next.to)}` : ""}`
                      : null,
                  );
                  if (next?.to) setOpen(false);
                },
              }
            : {
                mode: "single" as const,
                selected,
                onSelect: (next: Date | undefined) => {
                  onChange(next ? dateValue(next) : null);
                  setOpen(false);
                },
              })}
        />
        <Button
          variant="ghost"
          type="button"
          className="m-2"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          {t.professional.clearDate}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
