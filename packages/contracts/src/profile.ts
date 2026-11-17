import { z } from "zod";

const text = z.string().nullable().default(null);
const texts = z.array(z.string()).default([]);
const date = z
  .string()
  .regex(/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/)
  .nullable()
  .default(null);
const list = <T extends z.ZodType>(item: T) => z.array(item).default([]);

export const professionalProfileSchema = z.strictObject({
  personal: z
    .strictObject({ full_name: text, email: text, phone: text, location: text, links: texts })
    .prefault({}),
  headline: text,
  summary: text,
  experience: list(
    z.strictObject({
      title: text,
      company: text,
      location: text,
      employment_type: text,
      start_date: date,
      end_date: date,
      is_current: z.boolean().nullable().default(null),
      description: text,
      highlights: texts,
    }),
  ),
  education: list(
    z.strictObject({
      institution: text,
      degree: text,
      field: text,
      location: text,
      start_date: date,
      end_date: date,
      details: texts,
    }),
  ),
  skills: list(z.strictObject({ category: text, items: texts })),
  languages: list(z.strictObject({ name: z.string().min(1), level: text })),
  projects: list(
    z.strictObject({
      name: text,
      role: text,
      description: text,
      technologies: texts,
      highlights: texts,
      links: texts,
    }),
  ),
  certifications: list(
    z.strictObject({ name: text, issuer: text, date, credential: text, url: text }),
  ),
  courses: list(z.strictObject({ name: text, institution: text, date, details: text })),
  awards: list(z.strictObject({ title: text, issuer: text, date, description: text })),
  volunteering: list(
    z.strictObject({ organization: text, role: text, period: text, description: text }),
  ),
  publications: list(z.strictObject({ title: text, date, description: text, url: text })),
  references: list(z.strictObject({ name: text, relationship: text, contact: text })),
  other_sections: list(z.strictObject({ title: z.string().min(1), items: texts })),
});
export const cvExtractionSchema = z.strictObject({
  profile: professionalProfileSchema,
  suggested_roles: z.array(z.string().min(1)).max(5).default([]),
});
export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;
export type CvExtraction = z.infer<typeof cvExtractionSchema>;
export const profileResponseSchema = z.strictObject({
  profile: professionalProfileSchema.nullable(),
  extraction: cvExtractionSchema.nullable(),
  confirmed: z.boolean(),
  onboarding_completed: z.boolean(),
  cv_url: z.string().nullable(),
  evidence_urls: z.array(z.string()),
});
