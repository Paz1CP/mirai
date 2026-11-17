"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { ProfessionalLabel } from "@/shared/i18n/professional";
import { ProfileDatePicker } from "./ProfileDatePicker";

const multiline = new Set(["summary", "description", "details"]);
export function ProfileField({
  name,
  value,
  onChange,
  array = false,
  options = [],
  start,
  end,
  allowFuture = false,
  disabled = false,
}: {
  name: ProfessionalLabel;
  value: unknown;
  onChange: (value: unknown) => void;
  array?: boolean;
  options?: string[];
  start?: unknown;
  end?: unknown;
  allowFuture?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const { t } = useI18n();
  const p = t.professional;
  const items: string[] = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  const text = typeof value === "string" ? value : "";
  return (
    <div className={array || multiline.has(name) ? "col-span-full space-y-1.5" : "space-y-1.5"}>
      <label htmlFor={id} className="block text-sm text-muted-foreground">
        {p.fields[name]}
      </label>
      {array ? (
        <div className="space-y-2">
          {(items.length ? items : [""]).map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                id={index === 0 ? id : undefined}
                value={item}
                aria-label={`${p.fields[name]} ${index + 1}`}
                onChange={(event) => {
                  const next = items.length ? [...items] : [""];
                  next[index] = event.target.value;
                  onChange(next);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onChange([...items, ""]);
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${p.remove}: ${p.fields[name]} ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...items, ""])}
          >
            {p.add}
          </Button>
        </div>
      ) : name === "is_current" ? (
        <Select
          items={{ unknown: p.unknown, yes: p.yes, no: p.no }}
          value={value === null ? "unknown" : value ? "yes" : "no"}
          onValueChange={(selected) => onChange(selected === "unknown" ? null : selected === "yes")}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unknown">{p.unknown}</SelectItem>
            <SelectItem value="yes">{p.yes}</SelectItem>
            <SelectItem value="no">{p.no}</SelectItem>
          </SelectContent>
        </Select>
      ) : name.includes("date") || name === "period" ? (
        <ProfileDatePicker
          id={id}
          value={value}
          onChange={onChange}
          start={start}
          end={end}
          allowFuture={allowFuture}
          disabled={disabled}
          range={name === "period"}
        />
      ) : options.length ? (
        <Combobox
          items={options}
          inputValue={text}
          value={options.includes(text) ? text : null}
          onInputValueChange={(next, details) => {
            if (details.reason === "input-change" || details.reason === "input-clear")
              onChange(next || null);
          }}
          onValueChange={(next) => {
            if (next) onChange(next);
          }}
        >
          <ComboboxInput id={id} />
          <ComboboxContent>
            <ComboboxEmpty>{p.freeEntry}</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : multiline.has(name) ? (
        <Textarea
          id={id}
          rows={3}
          value={text}
          onChange={(event) => onChange(event.target.value || null)}
        />
      ) : (
        <Input id={id} value={text} onChange={(event) => onChange(event.target.value || null)} />
      )}
    </div>
  );
}
