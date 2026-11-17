"use client";
import { useId, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { preferenceOptions, type JobPreferences } from "@mirai/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { preferenceLabel } from "@/shared/i18n/preferenceLabels";
import { profileApi } from "./profileApi";
import { profileErrorText } from "./profileText";

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <Select
        items={[{ value: "__empty", label: t.professional.unknown }, ...options]}
        value={value ?? "__empty"}
        onValueChange={(next) => onChange(next === "__empty" ? null : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty">{t.professional.unknown}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Multiple({
  values,
  options,
  label,
  onChange,
}: {
  values: string[];
  options: readonly string[];
  label: string;
  onChange: (values: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const { locale, t } = useI18n();
  const language = options === preferenceOptions.work_language;
  const filtered = options.filter((code) =>
    preferenceLabel(code, locale, language)
      .toLocaleLowerCase(locale)
      .includes(search.toLocaleLowerCase(locale)),
  );
  return (
    <div className="space-y-3">
      <Input
        aria-label={`${t.professional.search}: ${label}`}
        placeholder={t.professional.search}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="grid max-h-52 gap-3 overflow-y-auto py-2 sm:grid-cols-2">
        {filtered.map((code) => (
          <label key={code} className="flex cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={values.includes(code)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...values, code] : values.filter((item) => item !== code))
              }
            />
            {preferenceLabel(code, locale, language)}
          </label>
        ))}
      </div>
    </div>
  );
}
function Preference({
  label,
  required,
  hasValue,
  onRequired,
  children,
}: {
  label: string;
  required: boolean;
  hasValue: boolean;
  onRequired: (required: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">{label}</h3>
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          <Switch
            checked={required}
            disabled={!hasValue}
            onCheckedChange={onRequired}
            aria-label={`${label}: ${t.professional.required}`}
          />
          {t.professional.required}
        </label>
      </div>
      {children}
    </section>
  );
}
export function PreferencesEditor({
  draft,
  setDraft,
  suggestions,
  onSave,
}: {
  draft: JobPreferences;
  setDraft: Dispatch<SetStateAction<JobPreferences>>;
  suggestions: string[];
  onSave: () => void;
}) {
  const { locale, t } = useI18n();
  const p = t.professional;
  const [role, setRole] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const catalog = useQuery({
    queryKey: ["geo-countries"],
    queryFn: ({ signal }) => profileApi.countries(signal),
    staleTime: 3600000,
    retry: false,
  });
  const update = <K extends keyof JobPreferences>(key: K, value: JobPreferences[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const addRole = (value: string) => {
    const title = value.trim();
    if (title && draft.roles.length < 10 && !draft.roles.includes(title)) {
      update("roles", [...draft.roles, title]);
      setRole("");
    }
  };
  const groups = [
    ["seniorities", "seniority_required", preferenceOptions.seniority],
    ["industries", "industries_required", preferenceOptions.industry],
    ["work_modes", "work_modes_required", preferenceOptions.work_mode],
    ["schedules", "schedules_required", preferenceOptions.work_schedule],
    ["contracts", "contracts_required", preferenceOptions.contract_type],
    ["work_languages", "languages_required", preferenceOptions.work_language],
  ] as const;
  const salaryPresent = Boolean(
    draft.salary_amount && draft.salary_currency && draft.salary_period,
  );
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Preference
        label={p.fields.roles}
        required={draft.roles_required}
        hasValue={Boolean(draft.roles.length)}
        onRequired={(value) => update("roles_required", value)}
      >
        <div className="flex gap-3">
          <Input
            aria-label={p.fields.roles}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addRole(role);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!role.trim() || draft.roles.length >= 10}
            onClick={() => addRole(role)}
          >
            {p.add}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{p.roleHelp}</p>
        <div className="flex flex-wrap gap-2">
          {draft.roles.map((item) => (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              key={item}
              aria-label={`${p.remove}: ${item}`}
              onClick={() => {
                const roles = draft.roles.filter((value) => value !== item);
                setDraft((previous) => ({
                  ...previous,
                  roles,
                  roles_required: roles.length ? previous.roles_required : false,
                }));
              }}
            >
              {item} ×
            </Button>
          ))}
        </div>
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{p.suggested}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={draft.roles.includes(item) ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (draft.roles.includes(item)) {
                      const roles = draft.roles.filter((value) => value !== item);
                      setDraft((previous) => ({
                        ...previous,
                        roles,
                        roles_required: roles.length ? previous.roles_required : false,
                      }));
                    } else addRole(item);
                  }}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Preference>
      {groups.map(([key, required, options]) => (
        <Preference
          key={key}
          label={p.fields[key]}
          required={draft[required]}
          hasValue={Boolean(draft[key].length)}
          onRequired={(value) => update(required, value)}
        >
          <Multiple
            values={draft[key]}
            options={options}
            label={p.fields[key]}
            onChange={(values) =>
              setDraft((previous) => ({
                ...previous,
                [key]: values,
                [required]: values.length ? previous[required] : false,
              }))
            }
          />
        </Preference>
      ))}
      <Preference
        label={p.fields.locations}
        required={draft.locations_required}
        hasValue={Boolean(draft.locations.length)}
        onRequired={(value) => update("locations_required", value)}
      >
        {catalog.isPending ? (
          <p className="text-sm text-muted-foreground">{p.loading}</p>
        ) : catalog.error ? (
          <p role="alert">
            {profileErrorText(catalog.error, locale)}
            <Button type="button" variant="ghost" onClick={() => void catalog.refetch()}>
              {p.retry}
            </Button>
          </p>
        ) : (
          <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <Choice
              label={p.country}
              value={country}
              options={(catalog.data ?? []).map((item) => ({
                value: item.code,
                label:
                  new Intl.DisplayNames([locale], { type: "region" }).of(item.code) ?? item.name,
              }))}
              onChange={(value) => {
                setCountry(value);
                setRegion(null);
              }}
            />
            <Choice
              label={p.region}
              value={region}
              options={(catalog.data?.find((item) => item.code === country)?.regions ?? []).map(
                (name) => ({ value: name, label: name }),
              )}
              onChange={setRegion}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!country}
              onClick={() => {
                if (!country) return;
                const location = { country, ...(region ? { region } : {}) };
                if (
                  !draft.locations.some(
                    (item) => item.country === country && (item.region ?? null) === region,
                  )
                )
                  update("locations", [...draft.locations, location]);
              }}
            >
              {p.add}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {draft.locations.map((item, index) => (
            <Button
              type="button"
              key={index}
              size="sm"
              variant="secondary"
              aria-label={`${p.remove}: ${item.country} ${item.region ?? p.wholeCountry}`}
              onClick={() => {
                const locations = draft.locations.filter((_, i) => i !== index);
                setDraft((previous) => ({
                  ...previous,
                  locations,
                  locations_required: locations.length ? previous.locations_required : false,
                }));
              }}
            >
              {new Intl.DisplayNames([locale], { type: "region" }).of(item.country)} ·{" "}
              {item.region ?? p.wholeCountry} ×
            </Button>
          ))}
        </div>
      </Preference>
      <Preference
        label={p.fields.salary}
        required={draft.salary_required}
        hasValue={salaryPresent}
        onRequired={(value) => update("salary_required", value)}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-2 text-sm text-muted-foreground">
            <span>{p.amount}</span>
            <Input
              inputMode="decimal"
              value={draft.salary_amount ?? ""}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  salary_amount: event.target.value || null,
                  salary_required: event.target.value ? previous.salary_required : false,
                }))
              }
            />
          </label>
          <Choice
            label={p.currency}
            value={draft.salary_currency}
            options={[...new Set(catalog.data?.map((item) => item.currency) ?? [])]
              .sort()
              .map((value) => ({ value, label: value }))}
            onChange={(value) =>
              setDraft((previous) => ({
                ...previous,
                salary_currency: value,
                salary_required: value ? previous.salary_required : false,
              }))
            }
          />
          <Choice
            label={p.salaryPeriod}
            value={draft.salary_period}
            options={preferenceOptions.salary_period.map((value) => ({
              value,
              label: preferenceLabel(value, locale),
            }))}
            onChange={(value) =>
              setDraft((previous) => ({
                ...previous,
                salary_period:
                  preferenceOptions.salary_period.find((item) => item === value) ?? null,
                salary_required: value ? previous.salary_required : false,
              }))
            }
          />
        </div>
      </Preference>
      <Preference
        label={p.fields.mobility}
        required={draft.mobility_required}
        hasValue={draft.relocation !== null || draft.visa_sponsorship !== null}
        onRequired={(value) => update("mobility_required", value)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(["relocation", "visa_sponsorship"] as const).map((key) => (
            <Choice
              key={key}
              label={p.fields[key]}
              value={draft[key] === null ? null : draft[key] ? "yes" : "no"}
              options={[
                { value: "yes", label: p.yes },
                { value: "no", label: p.no },
              ]}
              onChange={(value) =>
                setDraft((previous) => {
                  const next = { ...previous, [key]: value === null ? null : value === "yes" };
                  return {
                    ...next,
                    mobility_required:
                      next.relocation !== null || next.visa_sponsorship !== null
                        ? next.mobility_required
                        : false,
                  };
                })
              }
            />
          ))}
        </div>
      </Preference>
      <label className="block space-y-3">
        <span className="text-sm">{p.fields.custom_rules}</span>
        <Textarea
          rows={5}
          value={draft.custom_rules}
          onChange={(event) => update("custom_rules", event.target.value)}
        />
      </label>
    </form>
  );
}
