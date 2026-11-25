import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const baseline = JSON.parse(
  readFileSync(new URL("codeql-baseline.json", import.meta.url), "utf8"),
);
const existing = new Map();
for (const alert of baseline.alerts) {
  const key = JSON.stringify(alert);
  existing.set(key, (existing.get(key) ?? 0) + 1);
}
const directory = process.argv[2];
const files = readdirSync(directory).filter((file) => file.endsWith(".sarif"));
if (!files.length) throw new Error("No CodeQL SARIF reports available");

let high = 0;
let added = 0;
let runs = 0;
for (const file of files) {
  const report = JSON.parse(readFileSync(join(directory, file), "utf8"));
  for (const run of report.runs) {
    if (run.tool.driver.name !== "CodeQL") continue;
    runs += 1;
    const rules = new Map(
      [run.tool.driver, ...(run.tool.extensions ?? [])]
        .flatMap((component) => component.rules ?? [])
        .map((rule) => [rule.id, rule.properties]),
    );
    for (const finding of run.results ?? []) {
      if (!rules.has(finding.ruleId)) throw new Error("CodeQL report has an unknown rule");
      const rule = rules.get(finding.ruleId);
      const severity = Number(rule?.["security-severity"]);
      if (!Number.isFinite(severity) && rule?.tags?.includes("security")) {
        throw new Error("Missing severity for a CodeQL security result");
      }
      if (!(severity >= 7)) continue;
      high += 1;
      const uri = finding.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? "";
      const path = uri.startsWith("file:") ? fileURLToPath(uri) : decodeURIComponent(uri);
      const location = (isAbsolute(path) ? relative(process.cwd(), path) : path).replaceAll("\\", "/");
      const key = JSON.stringify([
        finding.ruleId, location, finding.partialFingerprints?.primaryLocationLineHash,
      ]);
      const remaining = existing.get(key) ?? 0;
      if (remaining > 0) {
        existing.set(key, remaining - 1);
      } else {
        added += 1;
        console.log(JSON.stringify({ rule: finding.ruleId, path: location, severity }));
      }
    }
  }
}

if (!runs) throw new Error("No CodeQL analysis present");
console.log(JSON.stringify({ highOrCritical: high, newHighOrCritical: added, baseline: baseline.analysis }));
if (added) process.exitCode = 1;
