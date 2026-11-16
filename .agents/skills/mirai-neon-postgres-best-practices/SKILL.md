---
name: mirai-neon-postgres-best-practices
description: "MANDATORY database engineering standard for Mirai using Neon PostgreSQL 18, Drizzle ORM, Drizzle Kit, node-postgres and Express. Use for SQL, schema design, indexes, constraints, transactions, tenant security, connection pooling, migrations, concurrency, storage metadata, database performance, and DB-backed bug fixes. Enforces correctness under failure, reviewable migrations and risk-based verification. Do NOT invoke for unrelated frontend or non-persistence work."
---

# Mirai — Neon & PostgreSQL Best Practices

**Priority:** Database engineering authority. Apply alongside `mirai-clean-code-architecture`.  
**Baseline:** Neon PostgreSQL 18 · Drizzle ORM + Drizzle Kit · `pg` · Express on Google Cloud Run.  
**Last reviewed:** 2026-11-16.

## 1. Mission — CORRECTNESS FIRST

**MUST produce SQL and database code that remain correct under concurrency, partial failure, and multi-tenant access.** Code working on an empty database is NOT proof of production quality.

**MUST:** enforce durable invariants in PostgreSQL, parameterize SQL, keep transactions short, bound data access, review migrations, verify the actual schema and distinguish confirmed external results from database records.

**NEVER:** invent tables or deployed resources, use TypeScript assertions as database validation, transplant Supabase-specific policies, or add layers/tools to look sophisticated.

This skill governs database design and operations. General architecture, code organization and testing philosophy live in `mirai-clean-code-architecture`. **DO NOT duplicate generic rules.**

## 2. Start with Mirai's REAL implementation

Repository facts (verify again before making changes):

- `apps/api/src/infrastructure/database/client.ts` uses `drizzle-orm/node-postgres` with `pg.Pool({ max: 5 })`.
- `apps/api/drizzle.config.ts` declares the PostgreSQL dialect, feature-owned schema glob, and migration output `./database/migrations` relative to `apps/api`.
- `apps/api/src/infrastructure/database/checkConnection.ts` runs a connection diagnostic, NOT a schema or migration check.
- `apps/api/package.json` defines `db:check`, `db:generate`, `db:migrate`.
- `apps/api/.env.example` defines `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
- `neon.ts` declares private storage buckets, NOT provisioned resources.
- `docs/03. Architecture & Design.md` contains proposed database entities and rules, NOT implemented tables.

**MUST inspect the actual repository files, package versions and lockfile.** The database is owned by the API. **NEVER** add direct Neon connectivity to client React or the browser extension.

**DO NOT** create `packages/db`, a second ORM/client, parallel migrations or a rigid directory hierarchy without a demonstrated cross-package need.

**MUST follow the INSTALLED Drizzle release.** Online docs may describe release candidates or breaking major changes. NEVER copy prerelease-only APIs into the pinned stable stack.

## 3. Mandatory inspection BEFORE SQL changes

For schemas, migrations, joins, query bugs, transactions, security or performance:

1. **TRACE** the relevant feature and its repository/query code.
2. **READ** the applicable Drizzle schema, migration SQL, constraints and indexes.
3. **VERIFY** the target Neon branch/database, existing structure and affected data through authorized tooling or safe read-only SQL when live state matters.
4. **DISTINGUISH** source-code intentions, historical migrations and what actually exists in the deployed database.
5. **IDENTIFY** account scope, expected row count, lock implications, operation risk and recovery approach.
6. **IMPLEMENT ONLY THEN.**

Prefer `information_schema`, `pg_catalog`, migration metadata and sanitized query plans before reading live user records.

**NEVER** guess a foreign key, column, deployment state or successful migration. `SELECT 1` proves connectivity, NOT schema integrity. If live access is unavailable, implement against known repository definitions and state precisely what was not verified.

Use connected Neon tools if available; otherwise authorized SQL tooling. **NO mandatory MCP dependency that isn't connected. NO secrets, CV text or personal records in reports.**

## 4. Schema constraints — THE DATABASE MUST DEFEND INVARIANTS

- **MUST choose proper types:** `uuid` or suitable stable identifiers, `timestamptz` for instants, `numeric` for exact decimals, and durable integer types for monotonic counters/epochs. Never rely on floating-point for monetary exactness.
- **MUST use** primary keys, `NOT NULL`, appropriate CHECK constraints, UNIQUE constraints and actual foreign keys for invariants expressible in SQL.
- **MUST choose uniqueness scope deliberately:** account, opportunity, campaign, document, version or external intent. Pre-insert existence checks alone are NOT concurrency-safe.
- PostgreSQL UNIQUE permits several `NULL`s by default. Use `NULLS NOT DISTINCT` or a partial index ONLY when the domain requires different behavior.
- **MUST use explicit appropriate FK delete rules.** Do not cascade away CV history, submissions or audit evidence indiscriminately.
- Protect cross-account relationships using tenant-scoped lookups and, where valuable, tenant-aware composite FKs or transactional validation.
- Keep original CV files immutable and the exact applied CV version persistently referential.
- Use `jsonb` for variable observations or constraints, **NOT** as a substitute for stable relational keys and frequently queried fields.
- Defaults MUST represent genuine domain semantics. **NEVER** invent missing salary, authorization, professional facts or successful outcomes.
- Keep binaries in object storage, with keys, owner, version, hashes, retention and metadata in the database when needed.
- **NEVER** duplicate the automatic index backing a primary or unique constraint.

## 5. Account isolation and credentials — NON-NEGOTIABLE

**EXPRESS IS THE AUTHORIZATION AUTHORITY. NEON IS NOT A PUBLIC DATA API.**

- **NEVER** expose `DATABASE_URL`, SQL endpoints, database credentials or service keys to browser bundles or the extension.
- Derive account identity from validated server authentication, NOT request-provided ownership fields.
- **MUST scope every account-owned SELECT, JOIN, UPDATE, DELETE and nested resource lookup** to the authenticated account.
- **MUST enforce ownership within the mutation or same safe transaction**, and verify affected-row counts. A separate stale read followed by an unrestricted mutation is NOT sufficient.
- Protect against IDOR/BOLA. A globally unique UUID is NOT an authorization token.
- Use least-privilege runtime credentials, separate migration/admin roles where feasible, TLS and server-only secret management.
- **DO NOT paste Supabase `auth.uid()`, JWT/RLS roles or Data API rules into Neon.** If RLS is deliberately added, verify actual runtime DB roles, per-transaction identity, pooler behavior, owner bypass and `FORCE ROW LEVEL SECURITY` as applicable.
- RLS is defense in depth, NOT a substitute for Express authorization; ornamental RLS that the application role bypasses is NOT protection.
- **NEVER modify Neon Auth's managed internal schema** from Mirai migrations without a supported explicit requirement.

## 6. SQL and Drizzle — WRITE INTENTIONAL QUERIES

**MUST:**
- Prefer readable typed Drizzle operations. Use its parameterized `sql` template for expressive PostgreSQL features when clearer.
- Bind untrusted values. Dynamic sort columns or identifiers MUST be selected from explicit server-side allowlists.
- Project only the required columns, with bounded query results. Avoid `SELECT *` in expanding production endpoints.
- Filter, aggregate, sort and paginate in PostgreSQL, not after fetching whole tables into Node.js.
- Use deterministic `ORDER BY`, including a unique tie-breaker for pagination/processing.
- Prefer keyset pagination for large/changing sets; bounded offset pagination is acceptable for simple smaller screens.
- Avoid N+1 reads through joins, `EXISTS`, batch queries, or aggregations when appropriate.
- Use `RETURNING` or affected-row checks for consequential mutations.
- Use `INSERT ... ON CONFLICT` only with an actual unique arbiter. `DO NOTHING` does NOT prove a new record was created.
- Understand SQL NULL behavior. A Drizzle `sql<T>` type annotation is NOT runtime decoding or validation.

**NEVER:**
- Concatenate user values into SQL or use `sql.raw()` with untrusted input.
- Add `DISTINCT` to conceal a broken JOIN.
- Issue uncontrolled full-table mutations or unbounded result scans.
- Build generic CRUD repositories or stored-procedure frameworks when direct feature-owned queries are clearer.

## 7. Index design — MEASURE REAL ACCESS PATHS

- **MUST justify indexes** by actual predicates, JOINs, ordering, constraints or an observed plan. Indexes increase write amplification, storage and maintenance.
- Prefer B-tree for scalar equality/range/order. Choose composite column order based on actual query patterns, usually emphasizing leading equality columns.
- Use partial indexes for stable selective predicates; use partial UNIQUE indexes when uniqueness applies only to an explicit subset.
- Consider GIN for demonstrated JSON containment or text-search workloads, not automatically for every `jsonb` column.
- Use `INCLUDE`, expression indexes or advanced index types ONLY for demonstrated need.
- **NEVER** duplicate PK/UNIQUE indexes or add all permutations of indexed columns.
- Account/campaign plus ordering fields are common candidates, but MUST match the SQL actually executed.
- Use `EXPLAIN (ANALYZE, BUFFERS)` for appropriate SAFE read-only diagnostic workloads. Inspect actual rows, loops, buffers and sorts. **EXPLAIN ANALYZE EXECUTES THE STATEMENT. NEVER execute it on unsafe writes or side-effecting functions in production.**
- Sequential scans on small tables are normal. NEVER optimize merely to eliminate a `Seq Scan` label.

## 8. Transactions, controller leases and idempotency

- **MUST use transactions** for atomic multi-write invariants: acquiring/transferring leases, reserving submission capacity, recording submission intents, and committing related version/state changes.
- Keep transactions SHORT. **NEVER hold a transaction during a network request, agent inference, browser navigation, storage upload or user decision.**
- PostgreSQL's default `READ COMMITTED` does NOT make read-modify-write sequences serializable.
- For competing writers, use a conditional `UPDATE ... WHERE epoch/status/version`, row locks inside a transaction, UNIQUE constraints or intentionally chosen stronger isolation. **CHECK affected rows.**
- **MUST fence stale controllers** with durable monotonic epochs and atomic lease transitions. In-memory locks and browser flags are NOT authoritative.
- For actual `SERIALIZABLE` use, handle SQLSTATE `40001` with a bounded retry of the ENTIRE safe database transaction. Handle `40P01` deadlocks only with an equally deliberate safe retry. **NEVER replay external effects.**
- Acquire locks consistently; use `SKIP LOCKED` only for genuine competing-worker queues, NOT to hide a broken consistency model.
- **MUST reserve campaign submission slots atomically**, including unresolved uncertain attempts according to the candidate's mandate. Concurrent activity MUST NOT bypass limits.
- **MUST prevent duplicate external submissions across campaigns**, not just within `unique(campaign_id, opportunity_id)`. Canonical opportunity/account and intent identity need durable protection.
- A PostgreSQL transaction CANNOT atomically commit with an external job portal, recruiter message or object storage. Persist a durable intent, execute once under valid authority, store observed receipts and reconcile uncertainty BEFORE any retry.
- A durable outbox may be used ONLY if real asynchronous delivery semantics require it. NO premature event-sourcing or generic queue infrastructure.

## 9. Neon pooling and Cloud Run — KNOW YOUR CONNECTION TYPE

**CURRENT POLICY:**
- `DATABASE_URL` = Neon **POOLED** URL for Express/Drizzle application traffic.
- `DATABASE_URL_UNPOOLED` = Neon **DIRECT** URL for migrations, schema tools and administrative jobs.
- Current `pg.Pool({ max: 5 })` is a starting configuration, NOT an ideal default for every future workload.

**MUST** reuse a bounded process-level pool within each warm Cloud Run instance. NEVER create a pool per HTTP request. Evaluate total connections as pool maximum × potential service replicas, considering request concurrency and Neon compute limits.

**MUST** preserve TLS, bounded connection/statement/lock waits, and safe shutdown. Distinguish wake-up latency from consistently slow queries. Use actual interactive transactions supported by `drizzle-orm/node-postgres` and `pg`; do NOT swap drivers casually.

**NEON USES PGBOUNCER IN TRANSACTION MODE.** Pooled connections do not retain session settings across transactions. **NEVER** rely on session-level `SET`, SQL-level `PREPARE`, `LISTEN/NOTIFY`, persistent temporary tables or session advisory locks through pooled connections. Use `SET LOCAL` in a transaction or a direct connection when appropriate. Protocol-level prepared statements differ from SQL-level `PREPARE`; verify driver support.

**DO NOT** introduce a second Neon HTTP/WebSocket client for hypothetical performance gains. Choose driver changes only with measured need and verified transaction semantics.

## 10. Migration policy — VERSIONED, REVIEWABLE, REPRODUCIBLE

**MIGRATION SQL AND SNAPSHOTS ARE DEPLOYMENT HISTORY.**

**MANDATORY WORKFLOW:**
1. **CONFIRM** intended Neon project, database, branch and direct migration URL.
2. **EDIT** relevant Drizzle schema after understanding live constraints and dependencies.
3. **GENERATE** a migration with `db:generate`; current location is `apps/api/database/migrations`.
4. **REVIEW EVERY SQL STATEMENT:** dropped/renamed objects, implicit casts, table rewrites, indexes, locks, destructive changes and backfill requirements.
5. For unsupported DDL or backfills, use an appropriate **versioned Drizzle custom SQL migration**, not a parallel ad-hoc system.
6. Verify snapshot/history consistency with commands supported by the installed Drizzle Kit.
7. **APPLY** via `db:migrate` ONLY to the verified target with authorized execution.
8. Inspect constraints and query behavior after applying; report exact state.

**NEVER:**
- Run `drizzle-kit push` against `production` as a normal schema workflow.
- Apply unversioned DDL, persistent data backfills or ad-hoc live writes without explicit authorization and an auditable plan.
- Run destructive migrations automatically because credentials are available.
- Rewrite already-applied migrations, falsify the journal or stack conflicting migrations to repair one unapplied change.
- Assume schema rename detection is correct; review rename versus drop-and-create.
- Let a pooled URL silently substitute for the migration connection. The present config has a fallback, so **MUST VERIFY EFFECTIVE URL IS DIRECT**.
- Automatically migrate from every Cloud Run replica startup.

**BRANCH POLICY:** The user chose to develop v1 directly on Neon's `production` branch. **DO NOT create `dev`, preview branches, promote snapshots or change branch workflows without express authorization.** Neon branches do NOT support Git-like merging of independently changed data.

**SAFE EVOLUTION:** Prefer expand → backfill → verify → contract when clients or rows already exist. Consider `CREATE INDEX CONCURRENTLY` for large live tables only with the correct transaction strategy. NEVER perform unplanned destructive changes without recovery preparation.

## 11. Domain invariants specific to Mirai

| Domain | Required database responsibility |
| --- | --- |
| Candidate profile | Account isolation, fact provenance, consistent revisions |
| CV library | Original immutable; historical variants and applied versions retained |
| Campaign | Persisted mandatory constraints, mandate revision and lifecycle |
| Exclusive control | One effective controller/account, atomic transfer and epoch fencing |
| Opportunity | Candidate-scoped canonical identity, deduplication |
| Submission | Unique intent/attempt identity, uncertainty preserved, receipt recorded |
| Evidence | Private owner, verified references and retention semantics |
| Recruiter communication | Idempotent external intent; no duplicate replies |

**MUST keep separate** campaign execution state, individual application result, submission-attempt outcome, recruiter response and CV-version history. Never overload one generic status column.

**NEVER equate a successful INSERT with successful external submission.** Confirmation requires destination-side evidence.

## 12. Neon Object Storage is NOT a database transaction

- Use intended private Neon Object Storage buckets for originals, variants and artifacts. Save only metadata and opaque object keys in PostgreSQL.
- **MUST check account ownership BEFORE issuing signed upload/download URLs.** URLs MUST be short-lived; keys MUST be scoped, opaque and validated.
- **NEVER** expose S3 keys or storage secrets in the web app/extension.
- An SQL commit does not commit an object upload. Use staging/finalization and bounded cleanup/reconciliation for partial failures.
- Preserve historical documents referenced by submitted applications, including when the current variant changes.
- Declaring buckets in `neon.ts` is NOT proof they exist. **VERIFY provisioning.**

## 13. Diagnostics and efficiency — MEASURE FIRST

**Priority:** correctness/ownership → bounded reads → N+1 removal → targeted indexes → pooling → advanced optimization.

- Identify the actual slow query and inspect plans/real workload BEFORE adding caches, materialized views or indexes.
- Use safely scoped signals: query duration, cardinality, lock waits, `pg_stat_statements` when available, Neon pool metrics and compute wake-ups.
- Keep backfills chunked/resumable. **NEVER** introduce long all-table transactions or blocking schema changes by default.
- Do not add speculative partitions, read replicas, extensions or aggressive manual vacuum settings.
- Handle transient disconnects by safe reconnection/controlled recovery. Retry idempotent reads when justified; **NEVER blindly retry writes of uncertain outcome.**
- Sanitize logs; retain operation IDs and SQLSTATE, but NO secrets, CVs, recruiter content or personal payloads.

## 14. Risk-based tests — NO TESTING THEATER

**MUST add/update focused tests** when implementing critical account isolation, authorization, cross-tenant references, lease transfer, concurrency, submission limits, idempotency, transactions, historic CV integrity, or high-impact regressions.

**DO NOT** generate tests for trivial Drizzle mappings, routine CRUD, mechanical schema changes, UI cosmetics or every basic query. NO coverage quotas or ornamental mocks.

Use Vitest for pure domain rules; use a suitably isolated/authorized PostgreSQL environment when actual constraints or locks must be exercised. Mocked repositories cannot prove transactional correctness. **NEVER create an unauthorized Neon branch merely for tests.**

**MUST distinguish** static validation, reviewed migration, applied migration on named branch, live DB checks and E2E verified behavior. NEVER report an unperformed validation.

## 15. Completion contract

1. **TRACE** the source flow and real DB dependency.
2. **VERIFY** schema, target branch and authorization when relevant.
3. **DESIGN** minimal SQL/Drizzle changes respecting constraints, ownership and concurrency.
4. **VERSION** durable schema/data changes through reviewed migrations.
5. **VALIDATE** affected package checks, critical invariants and plans when appropriate.
6. **REPORT** files, branch, migration state and verified results without claiming unrun operations.

**FINAL RULE: POSTGRES ENFORCES DATA INTEGRITY. EXPRESS ENFORCES AUTHORIZATION. EXTERNAL PORTALS PROVIDE EVIDENCE OF EXTERNAL ACTIONS. NEVER CONFUSE THEM.**

---

## Official references — verify current docs before version-sensitive work

- PostgreSQL 18: https://www.postgresql.org/docs/18/
- Constraints: https://www.postgresql.org/docs/18/ddl-constraints.html
- Isolation and locks: https://www.postgresql.org/docs/18/transaction-iso.html · https://www.postgresql.org/docs/18/explicit-locking.html
- Indexes and EXPLAIN: https://www.postgresql.org/docs/18/indexes.html · https://www.postgresql.org/docs/18/using-explain.html
- RLS: https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- Neon pooling: https://neon.com/docs/connect/connection-pooling
- Neon serverless: https://neon.com/docs/guides/serverless-connection-pooling
- Neon + Drizzle: https://neon.com/docs/guides/drizzle
- Drizzle migrations: https://orm.drizzle.team/docs/drizzle-kit-generate · https://orm.drizzle.team/docs/drizzle-kit-migrate
- Drizzle SQL/transactions: https://orm.drizzle.team/docs/sql · https://orm.drizzle.team/docs/transactions
- Agent Skills: https://agentskills.io/specification
- Comparison benchmark, NOT policy: https://www.skills.sh/supabase/agent-skills/supabase-postgres-best-practices

