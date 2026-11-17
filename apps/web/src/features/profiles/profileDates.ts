import type { ProfessionalProfile } from "@mirai/contracts";

export function profileDate(value: unknown, end = false): Date | undefined {
  if (typeof value !== "string" || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return undefined;
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  if (end && value.length === 4) return new Date(year, 11, 31);
  if (end && value.length === 7) return new Date(year, month, 0);
  return new Date(year, month - 1, day);
}
export function dateValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function validProfileDates(profile: ProfessionalProfile) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  for (const entry of [...profile.experience, ...profile.education]) {
    const start = profileDate(entry.start_date);
    const end = profileDate(entry.end_date, true);
    if (start && start > today) return false;
    if (!("is_current" in entry && entry.is_current) && start && end && start > end) return false;
  }
  for (const entry of profile.experience) {
    if (entry.is_current) continue;
    const end = profileDate(entry.end_date);
    if (end && end > today) return false;
  }
  for (const entry of [
    ...profile.certifications,
    ...profile.courses,
    ...profile.awards,
    ...profile.publications,
  ]) {
    const date = profileDate(entry.date);
    if (date && date > today) return false;
  }
  for (const entry of profile.volunteering) {
    const values = entry.period?.match(/\d{4}(?:-\d{2}(?:-\d{2})?)?/g) ?? [];
    const from = profileDate(values[0]);
    const to = profileDate(values[1]);
    if ((from && from > today) || (to && to > today) || (from && to && from > to)) return false;
  }
  return true;
}
