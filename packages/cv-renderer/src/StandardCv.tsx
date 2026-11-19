import { Document, Page, Text, View, Link, Font, StyleSheet } from "@react-pdf/renderer";
import type { ProfessionalProfile } from "@mirai/contracts";
import { documentLabels } from "./labels.js";

let fontsRegistered = false;
export function registerStandardCvFonts(resolve: (file: string) => string) {
  if (fontsRegistered) return;
  Font.register({
    family: "Geist",
    fonts: [
      { src: resolve("Geist-Regular.ttf"), fontWeight: 400 },
      { src: resolve("Geist-Semibold.ttf"), fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}
const styles = StyleSheet.create({
  page: {
    padding: "20mm",
    fontFamily: "Geist",
    fontSize: 10.5,
    lineHeight: 1.2,
    color: "#202322",
    backgroundColor: "#ffffff",
  },
  name: { fontSize: 23, lineHeight: 1.25, fontWeight: 600, marginBottom: 6 },
  headline: { fontSize: 11, lineHeight: 1.25, marginBottom: 6 },
  contact: { fontSize: 9.5, lineHeight: 1.25, color: "#626862", marginBottom: 3 },
  section: {
    fontSize: 11.5,
    lineHeight: 1.25,
    fontWeight: 600,
    marginTop: 14,
    marginBottom: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: "#DCDDDA",
    paddingBottom: 4,
  },
  entry: { marginTop: 10 },
  heading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 5 },
  title: { fontSize: 11, lineHeight: 1.25, fontWeight: 600 },
  headingTitle: { fontSize: 11, lineHeight: 1.25, fontWeight: 600, flexGrow: 1, flexBasis: "65%" },
  date: { fontSize: 9.5, color: "#626862", textAlign: "right" },
  secondary: { color: "#626862", marginTop: 3, marginBottom: 3 },
  paragraph: { marginBottom: 4 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletMark: { width: 11 },
  bulletText: { flex: 1 },
  link: { color: "#626862", textDecoration: "none" },
});
const join = (values: (string | null | undefined)[]) => values.filter(Boolean).join(" · ");
function destination(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}
function populated<T extends object>(items: T[]) {
  return items.filter((item) =>
    Object.values(item).some((value) =>
      typeof value === "string"
        ? value.trim().length > 0
        : Array.isArray(value) && value.some(Boolean),
    ),
  );
}
export function StandardCv({
  profile: input,
  locale,
}: {
  profile: ProfessionalProfile;
  locale: keyof typeof documentLabels;
}) {
  const normalize = (value: string) =>
    value.toLocaleLowerCase(locale).replace(/[^\p{L}\p{N}]/gu, "");
  const languages = populated(input.languages);
  const languageLabels = new Set(
    languages.flatMap((item) => [
      normalize(item.name),
      normalize(`${item.name}${item.level ?? ""}`),
    ]),
  );
  const profile = {
    ...input,
    experience: populated(input.experience),
    education: populated(input.education),
    projects: populated(input.projects),
    languages,
    skills: populated(
      input.skills.map((item) => ({
        ...item,
        items: item.items.filter((value) => !languageLabels.has(normalize(value))),
      })),
    ).filter((item) => item.items.some(Boolean)),
    certifications: populated(input.certifications),
    courses: populated(input.courses),
    awards: populated(input.awards),
    volunteering: populated(input.volunteering),
    publications: populated(input.publications),
    references: populated(input.references),
  };
  const p = documentLabels[locale];
  const date = (value: string | null) => {
    if (!value || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return value ?? "";
    if (value.length === 4) return value;
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`));
  };
  const period = (start: string | null, end: string | null, current = false) =>
    [date(start), current ? p.present : date(end)].filter(Boolean).join(" – ");
  const heading = (title: string) => (
    <Text style={styles.section} minPresenceAhead={40}>
      {title}
    </Text>
  );
  const paragraph = (value: string | null) =>
    value ? (
      <Text style={styles.paragraph} orphans={2} widows={2}>
        {value}
      </Text>
    ) : null;
  const bullets = (items: string[]) =>
    items.filter(Boolean).map((item, i) => (
      <View key={i} style={styles.bullet}>
        <Text style={styles.bulletMark}>•</Text>
        <Text style={styles.bulletText} orphans={2} widows={2}>
          {item}
        </Text>
      </View>
    ));
  const links = (items: string[]) =>
    items.filter(Boolean).map((item, i) => (
      <Text key={i} style={styles.contact}>
        <Link src={destination(item)} style={styles.link}>
          {item}
        </Link>
      </Text>
    ));
  const education = profile.education.length ? (
    <>
      {heading(p.fields.education)}
      {[...profile.education]
        .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""))
        .map((item, i) => (
          <View key={i} style={styles.entry}>
            <View wrap={false} minPresenceAhead={25}>
              <View style={styles.heading}>
                <Text style={styles.headingTitle}>{join([item.degree, item.field])}</Text>
                <Text style={styles.date}>{period(item.start_date, item.end_date)}</Text>
              </View>
              <Text style={styles.secondary}>{join([item.institution, item.location])}</Text>
            </View>
            {bullets(item.details)}
          </View>
        ))}
    </>
  ) : null;
  const projects = profile.projects.length ? (
    <>
      {heading(p.fields.projects)}
      {profile.projects.map((item, i) => (
        <View key={i} style={styles.entry}>
          <Text style={styles.title} minPresenceAhead={25}>
            {join([item.name, item.role])}
          </Text>
          {paragraph(item.description)}
          {item.technologies.length > 0 && paragraph(item.technologies.filter(Boolean).join(", "))}
          {bullets(item.highlights)}
          {links(item.links)}
        </View>
      ))}
    </>
  ) : null;
  return (
    <Document
      title={`${profile.personal.full_name ?? "Mirai"} — CV`}
      author={profile.personal.full_name ?? "Mirai"}
      language={locale}
    >
      <Page size="A4" style={styles.page} wrap>
        <View minPresenceAhead={35}>
          <Text style={styles.name}>{profile.personal.full_name}</Text>
          {profile.headline && <Text style={styles.headline}>{profile.headline}</Text>}
          <Text style={styles.contact}>
            {join([profile.personal.location, profile.personal.phone])}
            {profile.personal.email && (
              <Link
                src={`mailto:${profile.personal.email}`}
                style={styles.link}
              >{` · ${profile.personal.email}`}</Link>
            )}
            {profile.personal.links.filter(Boolean).map((link, i) => (
              <Link key={i} src={destination(link)} style={styles.link}>{` · ${link}`}</Link>
            ))}
          </Text>
        </View>
        {profile.summary && (
          <>
            {heading(p.cvSummary)}
            {paragraph(profile.summary)}
          </>
        )}
        {!profile.experience.length && (
          <>
            {education}
            {projects}
          </>
        )}
        {profile.experience.length > 0 && (
          <>
            {heading(p.cvExperience)}
            {[...profile.experience]
              .sort(
                (a, b) =>
                  Number(!!b.is_current) - Number(!!a.is_current) ||
                  (b.start_date ?? "").localeCompare(a.start_date ?? ""),
              )
              .map((item, i) => (
                <View key={i} style={styles.entry}>
                  <View wrap={false} minPresenceAhead={28}>
                    <View style={styles.heading}>
                      <Text style={styles.headingTitle}>{item.title}</Text>
                      <Text style={styles.date}>
                        {period(item.start_date, item.end_date, item.is_current === true)}
                      </Text>
                    </View>
                    <Text style={styles.secondary}>
                      {join([item.company, item.location, item.employment_type])}
                    </Text>
                  </View>
                  {paragraph(item.description)}
                  {bullets(item.highlights)}
                </View>
              ))}
          </>
        )}
        {profile.skills.length > 0 && (
          <>
            {heading(p.fields.skills)}
            {profile.skills.map((item, i) => (
              <Text key={i} style={styles.paragraph} orphans={2} widows={2}>
                <Text style={{ fontWeight: 600 }}>{item.category ? `${item.category}: ` : ""}</Text>
                {item.items.filter(Boolean).join(", ")}
              </Text>
            ))}
          </>
        )}
        {!!profile.experience.length && (
          <>
            {education}
            {projects}
          </>
        )}
        {profile.languages.length > 0 && (
          <>
            {heading(p.fields.languages)}
            {paragraph(profile.languages.map((item) => join([item.name, item.level])).join("; "))}
          </>
        )}
        {(
          [
            "certifications",
            "courses",
            "awards",
            "volunteering",
            "publications",
            "references",
          ] as const
        ).map(
          (section) =>
            profile[section].length > 0 && (
              <View key={section}>
                {heading(p.fields[section])}
                {profile[section].map((item, i) => {
                  const record: Record<string, unknown> = item;
                  const titleKey = ["name", "title", "organization"].find(
                    (key) => typeof record[key] === "string" && record[key],
                  );
                  const title = titleKey ? String(record[titleKey]) : "";
                  const metaKeys = [
                    "issuer",
                    "institution",
                    "role",
                    "relationship",
                    "period",
                    "date",
                    "credential",
                  ];
                  return (
                    <View key={i} style={styles.entry}>
                      <View wrap={false} minPresenceAhead={20}>
                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.secondary}>
                          {join(
                            metaKeys.map((key) =>
                              typeof record[key] === "string"
                                ? key === "date"
                                  ? date(String(record[key]))
                                  : String(record[key])
                                : null,
                            ),
                          )}
                        </Text>
                      </View>
                      {paragraph(
                        typeof record.description === "string" ? record.description : null,
                      )}
                      {paragraph(typeof record.details === "string" ? record.details : null)}
                      {paragraph(typeof record.contact === "string" ? record.contact : null)}
                      {typeof record.url === "string" && links([record.url])}
                    </View>
                  );
                })}
              </View>
            ),
        )}
        {profile.other_sections
          .filter((section) => section.items.some(Boolean))
          .map((section, i) => (
            <View key={i}>
              {heading(section.title)}
              {bullets(section.items)}
            </View>
          ))}
      </Page>
    </Document>
  );
}
