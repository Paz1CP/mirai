import { z } from "zod";
import { preferenceOptions as options } from "./preferenceOptions.js";

export const permissionsSchema = z.strictObject({
  allow_job_portals: z.boolean(),
  allow_portal_messages: z.boolean(),
  allow_email: z.boolean(),
});
export const permissionPatchSchema = permissionsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export const countrySchema = z.strictObject({
  code: z.string(),
  name: z.string(),
  currency: z.string(),
  regions: z.array(z.string()),
});
export const preferencesSchema = z
  .strictObject({
    roles: z.array(z.string().trim().min(1)).max(10),
    roles_required: z.boolean(),
    seniorities: z.array(z.enum(options.seniority)),
    seniority_required: z.boolean(),
    industries: z.array(z.enum(options.industry)),
    industries_required: z.boolean(),
    work_modes: z.array(z.enum(options.work_mode)),
    work_modes_required: z.boolean(),
    locations: z.array(
      z.strictObject({ country: z.string().min(1), region: z.string().min(1).optional() }),
    ),
    locations_required: z.boolean(),
    salary_amount: z
      .string()
      .regex(/^\d+(?:\.\d{1,2})?$/)
      .refine((value) => Number(value) > 0 && Number.isFinite(Number(value)))
      .nullable(),
    salary_currency: z.string().min(1).nullable(),
    salary_period: z.enum(options.salary_period).nullable(),
    salary_required: z.boolean(),
    schedules: z.array(z.enum(options.work_schedule)),
    schedules_required: z.boolean(),
    contracts: z.array(z.enum(options.contract_type)),
    contracts_required: z.boolean(),
    work_languages: z.array(z.enum(options.work_language)),
    languages_required: z.boolean(),
    relocation: z.boolean().nullable(),
    visa_sponsorship: z.boolean().nullable(),
    mobility_required: z.boolean(),
    custom_rules: z.string(),
  })
  .superRefine((value, ctx) => {
    const hasSalary = [value.salary_amount, value.salary_currency, value.salary_period].filter(
      (item) => item !== null,
    ).length;
    if (hasSalary !== 0 && hasSalary !== 3)
      ctx.addIssue({ code: "custom", path: ["salary_amount"], message: "SALARY_INCOMPLETE" });
    const requirements = [
      ["roles_required", value.roles.length],
      ["seniority_required", value.seniorities.length],
      ["industries_required", value.industries.length],
      ["work_modes_required", value.work_modes.length],
      ["locations_required", value.locations.length],
      ["salary_required", hasSalary === 3],
      ["schedules_required", value.schedules.length],
      ["contracts_required", value.contracts.length],
      ["languages_required", value.work_languages.length],
      ["mobility_required", value.relocation !== null || value.visa_sponsorship !== null],
    ] as const;
    for (const [key, present] of requirements)
      if (value[key] && !present)
        ctx.addIssue({ code: "custom", path: [key], message: "REQUIRED_WITHOUT_VALUE" });
  });
export const preferenceResponseSchema = z.strictObject({
  preferences: preferencesSchema,
  permissions: permissionsSchema,
});
export type JobPreferences = z.infer<typeof preferencesSchema>;
