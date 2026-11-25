import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const require = createRequire(new URL("apps/api/package.json", root));
const { Client } = require("pg");
const { readMigrationFiles } = require("drizzle-orm/migrator");
const policy = JSON.parse(readFileSync(new URL("release-policy.json", import.meta.url), "utf8"));
const fingerprint = (ledger) => createHash("sha256").update(JSON.stringify(ledger)).digest("hex");

async function main() {
  const action = process.argv[2];
  if (!["read", "migrate"].includes(action)) throw new Error("Invalid schema operation");
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  const url = URL.parse(connectionString ?? "");
  if (
    url?.protocol !== "postgresql:" ||
    url.hostname !== "ep-mute-cake-bbcfihtb.c-15.us-east-1.aws.neon.tech" ||
    url.pathname !== "/mirai" ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode"))
  ) {
    throw new Error("Secret does not target the approved direct production endpoint");
  }
  const expected = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL("apps/api/database/migrations", root)),
  }).map(({ folderMillis, hash }) => ({ created_at: String(folderMillis), hash }));

  const client = new Client({ connectionString, connectionTimeoutMillis: 15_000, statement_timeout: 15_000 });
  try {
    await client.connect();
    async function ledger() {
      return (await client.query(
        "select created_at::text, hash from drizzle.__drizzle_migrations order by created_at",
      )).rows;
    }
    const current = await ledger();
    if (JSON.stringify(current) !== JSON.stringify(expected.slice(0, current.length))) {
      throw new Error("Production migration journal differs from the reviewed repository history");
    }
    const before = fingerprint(current);
    if (action === "read") {
      console.log(before);
      return;
    }
    // Each transition explicitly attests that both the live and all recoverable releases still work.
    const pending = expected.slice(current.length);
    for (const [index, entry] of pending.entries()) {
      const from = fingerprint(expected.slice(0, current.length + index));
      const to = fingerprint(expected.slice(0, current.length + index + 1));
      if (!policy.compatibleMigrations.some((review) =>
        review.from === from && review.to === to && review.migration === entry.hash
      )) throw new Error("Pending migration has no reviewed rollback-compatible transition");
    }
    const result = spawnSync("pnpm", ["--filter", "@mirai/api", "db:migrate"], {
      cwd: fileURLToPath(root), stdio: "ignore", timeout: 180_000,
      env: { ...process.env, PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=120000" },
    });
    if (result.status !== 0) throw new Error("Drizzle migration command failed; connection details withheld");
    const after = await ledger();
    if (JSON.stringify(after) !== JSON.stringify(expected)) {
      throw new Error("Drizzle did not reach the expected migration journal");
    }
    console.log(JSON.stringify({ schema: fingerprint(after), applied: pending.length }));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  const safe = /^(Invalid schema operation|Secret does not target|Production migration journal|Pending migration|Drizzle)/.test(error.message);
  console.error(safe ? error.message : "Production schema verification failed; connection details withheld");
  process.exitCode = 1;
});
