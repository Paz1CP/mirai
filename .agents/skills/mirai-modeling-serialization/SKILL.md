---
name: mirai-modeling-serialization
description: "Use when designing or changing Mirai TypeScript domain models, Zod 4 schemas, REST and extension message contracts, DTOs, JSON serialization, API payload mapping, AI/tool output validation, document metadata, or model-version compatibility. Enforces one canonical schema per shared boundary, explicit input/output types, safe dates/numbers and minimal mapping. Do NOT invoke for unrelated UI styling, state caching, SQL query optimization or generic refactoring."
---

# Mirai — Modeling & Serialization

**Scope:** TypeScript 7, Zod 4, typed interfaces between Next.js, Express, WXT and external services.  
**Last reviewed:** 2026-11-16.  
**Relationship:** `mirai-clean-code-architecture` owns general layering and testing policy; `mirai-neon-postgres-best-practices` owns SQL/Drizzle schema integrity; `mirai-state-management` owns caching. **DO NOT reproduce their rulebooks.**

## 1. Mission — TYPES MUST MATCH REAL DATA

**MUST make every external boundary explicit, validated and predictable.** TypeScript types provide compile-time checks; they DO NOT validate network responses, browser messages, imported documents or LLM output.

**MUST distinguish** wire representation, parsed application value, persisted representation and product fact when their meanings differ.

**NEVER** generate arbitrary class hierarchies, duplicated DTOs, serialization factories or helper files just to move JSON between two identical shapes.

## 2. Current repository truth

- `packages/contracts` is a workspace package already using **Zod 4**. Its current `healthResponseSchema` is the initial minimal example, NOT evidence that feature contracts are already implemented.
- `apps/api` uses Express and Drizzle; `apps/web` uses Next.js. WXT/extension contracts will be introduced only when that app exists.
- Root tooling uses native **TypeScript 7** for application typechecks; a TS6 alias is reserved for linter compatibility.
- **MUST inspect actual package manifests, contracts and consumed API shapes before adding types.** Use the installed Zod 4 stable APIs, not legacy Zod 3 conventions or speculative release-candidate examples.

**CANONICAL OWNERSHIP:**
- **Shared, public REST or web↔extension protocol schemas** consumed by multiple workspaces → `packages/contracts`, exported through an intentional package entry point.
- **API-only input or vendor/tool output schemas** → the owning API feature/adapter.
- **Internal domain models** → the owning feature. Keep them out of transport packages unless there is a genuine shared consumer.
- **Drizzle table/select/insert inference** → database-facing API code. Do NOT publish database rows as public transport contracts.
- **View-only presentation models** → web feature when genuinely necessary; NEVER duplicate the domain model merely to rename two fields.

**DO NOT turn `packages/contracts/src/index.ts` into a giant universal schema file.** Export small feature-specific schemas through a concise public entry point as the package grows.

## 3. Model selection — PLAIN TYPES FIRST

| Need | Preferred representation |
| --- | --- |
| Simple immutable data shape | `type` or `interface` (follow local convention) |
| Finite status or operation variants | String-literal union or Zod `z.enum` / `z.discriminatedUnion` at a runtime boundary |
| Shared, untrusted JSON contract | Zod schema + inferred TypeScript types |
| Meaningful domain invariant/identity | Focused constructor, validator or value object ONLY when it enforces real behavior |
| Two genuinely different source/target shapes | Explicit named mapper at their boundary |
| Versioned CV/application snapshot | Dedicated immutable identity/version reference, not a mutable "current" alias |

**DO NOT** create classes, `copyWith`, builders, interfaces for every service, or `DTO → Entity → ViewModel` triples by default. TypeScript structural types and object spread already handle most straightforward immutable updates.

**MUST avoid** `any`, unsafe assertions, fake branded IDs everywhere and `as` casts used as substitutes for runtime parsing. Use `unknown` until data is verified.

## 4. Zod 4 at the boundary — NEVER TRUST RAW JSON

- **MUST validate untrusted HTTP input, extension messages, model/tool output, document extraction results and persisted JSON of uncertain provenance** at their actual entry boundary.
- Prefer `schema.parse()` when a thrown validation failure is intentionally handled by an enclosing boundary; use `safeParse()` when callers must distinguish invalid data without exceptions.
- **MUST map Zod issues into stable error responses** at the API boundary without leaking payload secrets; raw Zod error objects are NOT the public API contract by default.
- Use `z.input<typeof Schema>` for values accepted BEFORE transforms/coercion and `z.output<typeof Schema>` / `z.infer<typeof Schema>` for parsed values AFTER them. **NEVER assume these types match when a schema transforms data.**
- Use `z.strictObject` for **closed security-sensitive commands** when extra fields must be rejected. `z.object` normally strips unknown object keys; choose explicitly when tolerant versioned response parsing is desired.
- Use `z.discriminatedUnion` for messages and results with a true discriminator; avoid unrelated optional fields that allow invalid combinations.
- Define data-dependent refinements ONLY for real product rules not already expressible through built-in constraints; keep predicates free of side effects.
- **DO NOT add a Zod parse to every internal function** after the object has already crossed a trusted validated boundary. Validate again only when a new trust boundary or persisted-format risk justifies it.
- Enforce payload size/array length limits at input boundaries where parsing untrusted large objects may exhaust CPU or memory. Zod validation does NOT replace body-size and transport limits.

## 5. JSON and transport encoding — EXPLICIT, ROUND-TRIPPABLE

**JSON transport MUST use JSON-safe values.** Do not rely on TypeScript type assertions to make unsupported runtime objects serializable.

- **Dates/instants:** transmit explicit ISO 8601 timestamps with timezone/offset, preferably UTC for stored instants. Validate format and semantics at the boundary. Parse to `Date` in application code ONLY if date arithmetic genuinely needs it. A date-only field or local appointment time MUST NOT be silently converted into a UTC instant.
- **Exact decimals/money:** preserve decimal precision. Represent monetary amounts as well-defined decimal strings, with currency and period when meaningful; never round-trip PostgreSQL exact `numeric` through unsafe floating-point arithmetic.
- **64-bit values:** preserve large `bigint`/database epochs as safely encoded strings or another intentional lossless wire representation. Never rely on JavaScript `number` beyond `Number.MAX_SAFE_INTEGER`.
- **Enums:** use explicit stable wire values, NOT UI labels. Adding a result state requires coordinated contract and consumer handling.
- **Optional/nullable:** missing field, `undefined` and explicit JSON `null` can mean different things. Define the rule per field; never use `null` or empty string as an unreviewed catch-all substitute.
- **Non-JSON objects:** `Date`, `BigInt`, `Map`, `Set`, `undefined`, `NaN`, `Infinity`, and class instances require a deliberate encoding policy for ordinary JSON. Do NOT call `JSON.stringify` and assume semantic round-tripping.
- **Binary documents:** transfer files as files/object-storage uploads, not an opaque unbounded `JSON.stringify` string. Responses should carry authorized metadata or short-lived references.
- **Server Component props:** obey React/Next.js serializability rules at that boundary; do not confuse React's transport with a regular REST JSON contract.

**NEVER** silently change a wire field's meaning, precision, timezone or null semantics during mapping.

## 6. Codecs, coercion and transformation — ONLY WHERE NEEDED

- Prefer the simplest schema that directly matches the wire format.
- Use Zod 4 **codecs** for genuinely bidirectional conversions (e.g. ISO timestamp string ↔ `Date`) when both decode and encode are required.
- Use `.transform()` for intentional one-way normalization. **DO NOT assume a schema containing a one-way transform can be encoded back through Zod**; verify the operation supported by the installed Zod version.
- Use `.refine()` or domain validation for actual invariants, not arbitrary formatting preferences.
- **BE CAREFUL WITH `z.coerce.*`.** It follows JavaScript coercion rules (`"false"` may be truthy under generic boolean coercion). Accept/normalize only known input formats, not every input by convenience.
- **MUST document meaningful nontrivial conversion decisions in the owning mapper or schema**, not with verbose comments on every field.
- No automatic JSON serialization generator is needed for ordinary TypeScript types or Zod contracts. **DO NOT introduce codegen packages** without demonstrated multi-consumer need.

## 7. Shape evolution and compatibility — WEB, API, EXTENSION

- Shared protocol schema/versioning MUST be compatible with installed extension versions that may lag behind the deployed web/API.
- **MUST version or negotiate breaking wire changes**: field removal, required-field additions, changed enum meaning, discriminator change, timestamp/numeric encoding change, or different command semantics.
- Adding an optional response field can be backward compatible when the previous parser tolerates it; a `strictObject` consumer may reject it. **MUST check actual decoder behavior before declaring compatibility.**
- For actions, **unknown command types MUST fail closed**. No generic fallback that attempts a related browser action.
- For result states, **unknown values MUST NOT be coerced to `confirmed` or `failed`**. Treat unsupported states explicitly as incompatible/unknown until decoded safely.
- Versioned domain events and browser-extension messages MUST include enough identity to associate them with the intended campaign, device and controller generation when the protocol requires it.
- Keep client/server contract changes atomic across relevant packages when possible; coordinate rollout if clients can remain on older builds.
- Do not invent redundant version counters for resources already governed by a canonical version/epoch contract.

## 8. Mirai-specific semantic modeling

**MUST model these as distinct concepts; one ambiguous all-purpose `status` cannot represent them:**

- **Campaign lifecycle:** whether the delegated mandate is running, paused, completed or needs intervention.
- **Application outcome:** `confirmed`, `unconfirmed`, `pending_review`, `failed`, `skipped` as applicable; a pressed submit button does NOT mean confirmed.
- **Submission attempt:** intent key, phase, evidence and receipt are different from the application outcome.
- **Control authority:** instance ID, controller tab/device and generation/epoch are typed protocol fields, NOT a local React boolean.
- **CV documents:** original document identity, editable variant identity, version identity and historical submitted snapshot MUST remain distinguishable.
- **Professional facts:** value, source/provenance and user confirmation; an LLM proposal is NOT a confirmed biography.
- **Campaign constraints:** mandatory requirements and flexible preferences are distinct, even when both originate in natural-language instructions.
- **External communications:** channel intent/outcome metadata is NOT an internally replicated Gmail/portal message thread.

**USE structured discriminated payloads** for agent commands, activity events and typed UI components (`CampaignSummary`, `ExecutionLog`, `Intervention`, `DocumentReview`, `CompactReport`) when implemented. **NEVER parse agent text to infer a side effect or render arbitrary model-produced code as a component.**

**VALIDATION DOES NOT ESTABLISH TRUTH OR AUTHORIZATION.** A syntactically valid invented certification remains false; a well-formed submit command remains unauthorized until policy checks pass.

## 9. Nullability, defaults, and mapping discipline

- Use required fields for domain-required facts. **NEVER make every property optional just because external data can be messy.**
- Distinguish `optional`, `nullable`, `nullish` and default semantics in Zod deliberately. A missing required professional fact SHOULD produce validation/error or a pending-resolution state, not a plausible fabricated value.
- Normalize external names, enums and dates at ONE named boundary mapper where necessary. Do not repeat ad hoc renaming across frontend components and API controllers.
- Keep mappers small and directionally named. A mapper MUST NOT make HTTP calls, mutate storage, or perform invisible domain side effects.
- Split DTO and entity ONLY when wire/DB shape genuinely diverges from domain invariants or different sources map to a common domain.
- **MUST preserve immutable source and historical version fields**, even when constructing a modified CV representation.
- Return explicitly defined failure or missing-data conditions; do not turn parse failure into an empty successful dataset.

## 10. Error behavior and provenance

- Distinguish malformed client request, incompatible server response, failed third-party parse, unknown tool output and conflicting domain data; each has different recovery semantics.
- For document/LLM extraction, keep source provenance and uncertainty in the proposed data, allowing user confirmation. **NEVER silently fill absent education, employment dates, certifications or credentials.**
- Treat unknown externally supplied values as data to inspect, NEVER instructions to execute.
- Sanitize errors and logs: schema issue path and technical identifiers are useful; user CV text, recruiter messages and tokens are NOT.
- When a response format changes, update the canonical schema and all actual consumers; **NEVER leave contradictory handwritten TypeScript interfaces beside a changed Zod schema**.

## 11. Verification — TARGETED, NOT AUTOMATIC TEST EXPANSION

**MUST verify** schema/type inference and actual parsing on touched boundaries; use native TypeScript 7 package checks and relevant runtime validation.

Write **focused tests ONLY** when a model change protects a critical invariant: rejection of untrusted browser commands, status/result integrity, account/epoch protocol fields, lossless money/ID/time conversions, historical CV references, or high-impact regression cases.

**DO NOT** write tests for every primitive Zod field, trivial DTO or rename. Use real representative payloads for critical encode/decode round trips. Avoid mocks that simply return a declared type.

When a shared contract changes, verify the relevant web/API/extension consumers if they exist. Distinguish static checks from actual runtime interoperability.

## 12. Final decision checklist

1. What is the exact trust/transport boundary?
2. Which schema/type is canonical and where is it owned?
3. Is its input representation identical to its parsed output?
4. Are dates, numbers, nulls, versions and enums lossless and unambiguous?
5. Is a mapper genuinely needed, or does the same shape already suffice?
6. Will old web/extension consumers reject the new payload?
7. Does this change preserve historical facts, unknown outcomes and provenance?
8. Have the relevant real boundary checks been performed?

**FINAL RULE: ONE CANONICAL CONTRACT PER SHARED BOUNDARY. EXPLICIT SERIALIZATION. NO FABRICATED FACTS. NO UNJUSTIFIED MODEL LAYERS.**

### Official references — consult current stable APIs when changing contracts

- Zod 4 schemas and strict objects: https://zod.dev/api
- Zod parsing and input/output inference: https://zod.dev/basics
- Zod codecs and bidirectional conversion: https://zod.dev/codecs
- Zod 4 migration differences: https://zod.dev/v4/changelog
- Drizzle PostgreSQL data types: https://orm.drizzle.team/docs/column-types
- React Server/Client serializable props: https://nextjs.org/docs/app/getting-started/server-and-client-components
- TypeScript handbook: https://www.typescriptlang.org/docs/
- Agent Skills format: https://agentskills.io/specification

