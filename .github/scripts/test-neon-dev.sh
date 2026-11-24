set -euo pipefail

report="${1:?Pass a path for the Vitest JSON report}"
suites=(
  apps/api/src/features/billing/billing.integration.test.ts
  apps/api/src/features/profiles/profileRepository.test.ts
  apps/api/src/features/cvs/cvLibrary.test.ts
)

node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const env = process.env;
const pooled = 'ep-crimson-recipe-bbl32a9s-pooler.c-15.us-east-1.aws.neon.tech';
const direct = 'ep-crimson-recipe-bbl32a9s.c-15.us-east-1.aws.neon.tech';
const storage = 'https://br-cool-forest-bb10zfbm.storage.c-15.us-east-1.aws.neon.tech';
function targetsDev(value, host) {
  const url = URL.parse(value ?? '');
  return url?.hostname === host && url.pathname === '/mirai' &&
    url.searchParams.get('sslmode') === 'require';
}

assert(targetsDev(env.DATABASE_URL, pooled), 'Expected the Neon dev pooled URL');
assert(targetsDev(env.DATABASE_URL_UNPOOLED, direct), 'Expected the Neon dev direct URL');
assert(env.MIRAI_BILLING_TEST_DATABASE_URL === env.DATABASE_URL_UNPOOLED, 'Billing must use the dev direct URL');
assert(env.AWS_ENDPOINT_URL_S3?.replace(/\/$/, '') === storage, 'Expected the Neon dev storage endpoint');
assert(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_REGION === 'us-east-1' &&
  env.NEON_STORAGE_BUCKET === 'mirai-documents', 'Expected dev storage configuration');
assert(env.MIRAI_DB_TEST === '1' && env.MIRAI_CV_TEST_NEON === '1', 'Mandatory integration flags must be enabled');

const require = createRequire(new URL('./apps/api/package.json', import.meta.url));
const { Client } = require('pg');
for (const [label, connectionString] of [['pooled', env.DATABASE_URL], ['direct', env.DATABASE_URL_UNPOOLED]]) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    const { rows } = await client.query('select current_database() as name');
    assert(rows[0].name === 'mirai');
  } catch (error) {
    throw new Error(`Neon dev ${label} connection failed (${error.code ?? error.name})`);
  } finally {
    await client.end();
  }
}
console.log('Verified pooled and direct connections to Neon dev.');
NODE

pnpm --filter @mirai/api db:migrate
pnpm exec vitest run "${suites[@]}" --no-file-parallelism --testTimeout 90000 --hookTimeout 45000 \
  --reporter=default --reporter=json --outputFile.json="$report"

node --input-type=module - "$report" "${suites[@]}" <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [file, ...suites] = process.argv.slice(2);
const { testResults } = JSON.parse(readFileSync(file, 'utf8'));
for (const suite of suites) {
  const result = testResults.find(({ name }) => name.replaceAll('\\', '/').endsWith('/' + suite));
  const tests = result?.assertionResults ?? [];
  assert(tests.length > 0 && tests.every(({ status }) => status === 'passed'),
    `Mandatory integration suite did not run every test successfully: ${suite}`);
  console.log(`${suite}: ${tests.length} passed`);
}
NODE
