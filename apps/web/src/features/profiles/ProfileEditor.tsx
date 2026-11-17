"use client";
import { type Dispatch, type SetStateAction } from "react";
import { preferenceOptions, type ProfessionalProfile } from "@mirai/contracts";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { ProfessionalLabel } from "@/shared/i18n/professional";
import { useQuery } from "@tanstack/react-query";
import { profileApi } from "./profileApi";
import { ProfileField as Field } from "./ProfileField";
import { preferenceLabel } from "@/shared/i18n/preferenceLabels";
import { profileErrorText } from "./profileText";

const sections = {
  experience: [
    "title",
    "company",
    "location",
    "employment_type",
    "start_date",
    "end_date",
    "is_current",
    "description",
    "highlights",
  ],
  education: ["institution", "degree", "field", "location", "start_date", "end_date", "details"],
  skills: ["category", "items"],
  languages: ["name", "level"],
  projects: ["name", "role", "description", "technologies", "highlights", "links"],
  certifications: ["name", "issuer", "date", "credential", "url"],
  courses: ["name", "institution", "date", "details"],
  awards: ["title", "issuer", "date", "description"],
  volunteering: ["organization", "role", "period", "description"],
  publications: ["title", "date", "description", "url"],
  references: ["name", "relationship", "contact"],
  other_sections: ["title", "items"],
} as const;
export type ProfileSection = keyof typeof sections;
export const profileSections = Object.keys(sections) as ProfileSection[];
const lists = new Set(["links", "highlights", "items", "technologies"]);
export function ProfileEditor({
  draft,
  setDraft,
  onSave,
}: {
  draft: ProfessionalProfile;
  setDraft: Dispatch<SetStateAction<ProfessionalProfile>>;
  onSave: () => void;
}) {
  const { t, locale } = useI18n();
  const p = t.professional;
  const catalog = useQuery({
    queryKey: ["geo-countries"],
    queryFn: ({ signal }) => profileApi.countries(signal),
    staleTime: 3600000,
    retry: false,
  });
  const countryNames = new Intl.DisplayNames([locale], { type: "region" });
  const locations = (catalog.data ?? []).flatMap((country) => {
    const name = countryNames.of(country.code) ?? country.name;
    return [name, ...country.regions.map((region) => `${region}, ${name}`)];
  });
  const languages = preferenceOptions.work_language.map((code) =>
    preferenceLabel(code, locale, true),
  );
  const update = (key: ProfileSection, index: number, field: string, value: unknown) =>
    setDraft((previous) => ({
      ...previous,
      [key]: previous[key].map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)),
    }));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      className="space-y-6"
    >
      {catalog.error && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <p>{profileErrorText(catalog.error, locale)}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void catalog.refetch()}>
            {p.retry}
          </Button>
        </div>
      )}
      <Accordion defaultValue={["personal"]} multiple>
        <AccordionItem value="personal">
          <AccordionTrigger>{p.fields.personal}</AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-6 py-4 sm:grid-cols-2 lg:grid-cols-3 ">
              {Object.entries(draft.personal).map(([key, value]) => (
                <Field
                  key={key}
                  name={key as ProfessionalLabel}
                  value={value}
                  array={key === "links"}
                  options={key === "location" ? locations : undefined}
                  onChange={(next) =>
                    setDraft((previous) => ({
                      ...previous,
                      personal: { ...previous.personal, [key]: next },
                    }))
                  }
                />
              ))}
              {(["headline", "summary"] as const).map((key) => (
                <Field
                  key={key}
                  name={key}
                  value={draft[key]}
                  onChange={(value) => setDraft((previous) => ({ ...previous, [key]: value }))}
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
        {profileSections.map((section) => (
          <AccordionItem value={section} key={section}>
            <AccordionTrigger>
              {p.fields[section]}{" "}
              <span className="ms-2 text-muted-foreground">{draft[section].length}</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-6 py-4">
                {draft[section].map((entry, index) => (
                  <div key={index} className="rounded-xl border border-border p-5">
                    <div className="grid gap-5 ">
                      {sections[section].map((field) => {
                        const value = Object.fromEntries(Object.entries(entry))[field];
                        const array =
                          lists.has(field) || (section === "education" && field === "details");
                        return (
                          <Field
                            key={field}
                            name={field as ProfessionalLabel}
                            value={value}
                            array={array}
                            options={
                              field === "location"
                                ? locations
                                : section === "languages" && field === "name"
                                  ? languages
                                  : undefined
                            }
                            start={
                              field === "end_date"
                                ? Object.fromEntries(Object.entries(entry)).start_date
                                : undefined
                            }
                            end={
                              field === "start_date"
                                ? Object.fromEntries(Object.entries(entry)).end_date
                                : undefined
                            }
                            allowFuture={section === "education" && field === "end_date"}
                            disabled={
                              field === "end_date" &&
                              Object.fromEntries(Object.entries(entry)).is_current === true
                            }
                            onChange={(next) => update(section, index, field, next)}
                          />
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3"
                      onClick={() =>
                        setDraft((previous) => ({
                          ...previous,
                          [section]: previous[section].filter((_, i) => i !== index),
                        }))
                      }
                    >
                      {p.remove}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setDraft((previous) => ({
                      ...previous,
                      [section]: [
                        ...previous[section],
                        Object.fromEntries(
                          sections[section].map((field) => [
                            field,
                            lists.has(field) || (section === "education" && field === "details")
                              ? []
                              : field === "name" || field === "title"
                                ? ""
                                : null,
                          ]),
                        ),
                      ],
                    }))
                  }
                >
                  {p.add} · {p.fields[section]}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </form>
  );
}
