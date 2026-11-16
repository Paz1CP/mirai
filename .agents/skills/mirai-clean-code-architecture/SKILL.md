---
name: mirai-clean-code-architecture
description: "Mirai's primary engineering standard for clean TypeScript, React/Next.js, Express, monorepo architecture, multi-file production changes, feature implementation, service boundaries, refactors, and maintainability reviews. MUST use for new features, cross-layer changes, unfamiliar flows, architectural decisions, shared contracts, and significant bug fixes. Do NOT invoke for isolated copy edits, trivial styling, or tiny local changes that preserve existing behavior and structure."
---

# Mirai — Clean Code & Architecture

**Priority:** PRIMARY engineering skill for Mirai.  
**Scope:** All production TypeScript in `apps/`, `packages/`, and future workspace applications.  
**Last reviewed:** 2026-11-16.

## 1. Mission

Write production software that is understandable without archaeology, safe across trust boundaries, easy to change, consistent with the actual monorepo, and simple enough to maintain.

**CLEAN CODE IS NOT MORE FILES. ARCHITECTURE IS NOT MORE LAYERS.**

**MUST:**
- Understand the existing flow BEFORE editing it.
- Reuse stable code and patterns BEFORE creating alternatives.
- Separate presentation, application orchestration, domain rules, and infrastructure wherever responsibilities actually differ.
- Preserve domain invariants, explicit failure states, and end-to-end behavior.
- Prefer the smallest complete solution over a speculative framework.
- Leave the touched area clearer than it was.

**NEVER:**
- Add abstractions, dependencies, layers, or files to look sophisticated.
- Declare success because code compiles while the requested behavior remains incomplete.
- Invent API shapes, tables, installed packages, cloud resources, or runtime capabilities.
- Replace a working flow with disconnected scaffolding or simulated success.

## 2. Authority and scope

Use this order when deciding how to implement:

1. The current user request and confirmed product decisions.
2. Runtime behavior, security requirements, actual package APIs, and verified infrastructure.
3. Current repository code, configuration, and established reusable patterns.
4. Product/architecture/design Markdown files as **REVISIONABLE working drafts**.

**MUST question possible outdated documentation or weak legacy patterns.** Documentation is context, NOT immutable law. If an improvement intentionally changes an established design, update the relevant documentation when the change is material; do not silently create contradictions.

This skill owns cross-cutting engineering judgment. Specialist skills own their details:
- Design skill: Figma fidelity, Base UI/shadcn/ui, tokens, accessibility, responsive composition.
- State skill: React local state, TanStack Query, Zustand, real-time state ownership.
- Modeling skill: Zod schemas, DTOs, parsing, serialization and transformations.
- Database skill: Neon/PostgreSQL, Drizzle, SQL, query performance, migrations.
- Performance skill: profiling, rendering, network waterfalls, bundles and latency.

**DO NOT duplicate a specialist skill's rulebook here.** Apply both when a task crosses boundaries.

## 3. Know the REAL repository

Current workspace and responsibility map:

| Location | Responsibility |
| --- | --- |
| `apps/web/src/app/` | Next.js App Router routes, layouts, loading/error boundaries |
| `apps/web/src/features/` | Feature-specific React presentation, application-facing hooks and UI composition |
| `apps/web/src/components/ui/` | Reusable UI primitives and design-system components |
| `apps/web/src/shared/` | Truly cross-feature web concerns; NOT a dumping ground |
| `apps/api/src/bootstrap/` | Express composition, middleware and HTTP server startup |
| `apps/api/src/features/` | Feature-owned API delivery, use cases, domain decisions and persistence integration |
| `apps/api/src/infrastructure/` | Neon/Drizzle, storage and concrete external service adapters |
| `apps/api/src/shared/` | Neutral backend infrastructure genuinely used across features |
| `packages/contracts/` | Shared Zod boundary schemas and their inferred public types |

The feature-based folders currently exist, but many are scaffolds. **MUST follow real repository structure rather than inventing a rigid nested directory layout.** Create subdirectories such as `domain/`, `application/`, `data/`, `presentation/` or `repositories/` ONLY when the feature's actual complexity warrants them.

Planned but NOT necessarily installed or implemented:
- `apps/extension/`: WXT + WebExtensions; create only when the relevant implementation task requires it.
- TanStack Query, Zustand, shadcn/ui with Base UI: approved choices, not proof they are already in `package.json`.
- `ModelPort` / Vertex AI and Neon Auth: intended boundaries, not proof that adapters already work.
- A possible `packages/db/`: a design option, NOT permission to reorganize the existing API database layer prematurely.

**TypeScript:** Use the repository's **native TypeScript 7 compiler** for production checks/builds. The root `typescript` alias targeting TS6 exists ONLY for linter ecosystem compatibility. **NEVER silently switch application compilation back to TS6.** Respect the existing package scripts and lockfile.

## 4. MANDATORY pre-code investigation

For new features, multi-file changes, architectural decisions, unfamiliar flows, cross-package work, or consequential bug fixes:

1. Identify the user-visible behavior, success condition, domain rules, and affected packages.
2. Locate the actual entry point and trace the call path through its dependent code.
3. Inspect the closest existing implementation, feature folders, public contracts, reusable components, and infrastructure integrations relevant to the change.
4. Determine who owns each piece of state, each side effect, each validation rule, and each persistence operation.
5. Check the applicable package versions and official documentation when API behavior or compatibility matters.
6. Make a minimal, internally consistent change plan; implement the complete affected flow.

**DO NOT explore the entire repository blindly.** Use repository search, symbols, dependency navigation, or an available codebase-memory tool to find the right files first. A memory/indexing tool is useful, **NOT mandatory if unavailable**; concrete source code remains authoritative.

For a clearly isolated one-file change, inspect that file and its immediate contract. **DO NOT perform ceremonial architecture investigations.**

When database shapes or cloud resources matter, verify the actual schema/configuration using available Neon tools or a safe connection before making assumptions. **DO NOT confuse code declarations with provisioned infrastructure. NEVER expose secrets or production data while investigating.**

## 5. Architectural boundaries

### Web: presentation and client interaction

- React components **MUST render view state and dispatch user intents**; they MUST NOT contain SQL, storage SDKs, model-provider calls, domain scoring, authorization policy, or multi-step remote mutations.
- Use Next.js Server Components by default where appropriate. Add `"use client"` ONLY at the boundary that needs browser APIs, interactive state or effects; do not turn an entire route tree into client components without cause.
- Keep React render logic pure. **NEVER perform external writes or imperative side effects during render.** Follow the Rules of Hooks.
- Feature hooks/controllers may coordinate UI intents and remote operations; they MUST NOT become hidden business engines.
- Access the Express API through a consistent, typed feature API client or service boundary. **DO NOT scatter raw `fetch` calls and response mapping across components.**
- **Express is Mirai's authoritative backend.** Next.js server execution is NOT permission to bypass API authorization, directly access Neon, or duplicate business workflows in Server Actions.
- Keep browser-extension communication behind an explicit, narrowly typed bridge. The visual browser panel is NOT the execution authority.

### API: modular monolith

- Express route handlers **MUST** handle HTTP-level concerns: input validation, identity/context extraction, invoking the feature use case, and returning appropriate responses.
- Domain/application services **MUST** own authorization-sensitive decisions, business invariants, workflows, and commands.
- Repositories/infrastructure adapters **MUST** own database queries, storage operations, and provider-specific integrations.
- A route MUST NOT become an all-in-one controller containing SQL, AI prompts, policy rules, and external effects.
- Cross-feature collaboration **MUST** use intentional module entry points or small, stable contracts; **NEVER** reach into another feature's private implementation folders to reuse one helper.
- Keep dependency flow understandable. **NO circular imports**, implicit singletons hiding mutable business state, or service-locator frameworks for basic wiring.
- Use Express 5's supported async/error handling; preserve error context and centralize HTTP error translation where it reduces duplication.
- Keep Cloud Run handlers stateless with respect to durable campaign execution. **NEVER rely on a single process, timer, memory map, or background task for authoritative state or long-running browser execution.**


## 6. Separation of concerns without architecture theater

Use the smallest owner that can correctly express the behavior:

| Concern | Correct owner |
| --- | --- |
| Rendering, accessibility, ephemeral visual interaction | React component |
| Multi-step presentation-only dialog/sheet flow | Feature-local UI helper/coordinator **only if needed** |
| Local ephemeral state | React state |
| Remote data cache and synchronization | TanStack Query when installed |
| Shared client-only interaction/view state | Zustand when installed and justified |
| Business rule / campaign decision | Feature domain or application use case |
| Orchestration across repositories/providers | Feature application service |
| HTTP parsing, auth context, response translation | Express route/middleware |
| JSON/protocol validation at trust boundary | `packages/contracts` or server-owned input schema |
| DB read/write | Repository or infrastructure implementation |
| Browser-specific API/DOM action | Extension adapter |
| Vendor-specific model invocation | Server-side model adapter behind `ModelPort` |

**MUST NOT:**
- Create `controller -> service -> manager -> repository` chains where each layer forwards one call.
- Create interfaces for every class. Extract a port/interface ONLY for a real boundary, real substitution, meaningful test seam, or expected multi-provider implementation.
- Move domain rules into React hooks, Zustand stores, SQL helpers, request middleware, or model prompts.
- Use general-purpose `utils`, `helpers`, `common`, `base`, `manager`, or `service` files as junk drawers.
- Build microservices, event buses, worker queues, generic plugin registries, or shared packages merely because the product may grow.

## 7. Design principles with enforceable judgment

**KISS — FIRST.** The simplest correct implementation wins. Prefer clear functions and composition over elaborate class hierarchies.

**YAGNI — ALWAYS.** Write only the capability being delivered. **NO** imaginary future settings, idle extension points, unused flags, placeholder services or invented configuration.

**DRY — WITH SEMANTICS.** Centralize repeated behavior when consumers share the SAME meaning and divergent copies risk inconsistency. Two similar-looking flows with different domain rules SHOULD remain separate. Do not wait for arbitrary copy-count thresholds when duplication threatens a canonical rule.

**AHA — ABSTRACT AFTER UNDERSTANDING.** Abstract a stable concept, not a coincidental shape. A second real consumer is often enough; a first occurrence may justify a shared owner when the concept is inherently cross-feature.

**SOLID — (S=Single Responsibility, O=Open/Closed Principle, L=Liskov Substitution Principle, I=Interface Segregation Principle, D=Dependency Inversion).** Isolate reasons to change and invert only meaningful external dependencies. **NEVER** create five classes to wrap one trivial operation.

**COMPOSITION OVER INHERITANCE.** Prefer straightforward functions and small collaborators. Use inheritance only for a demonstrably shared behavioral contract that composition handles poorly.

**DOMAIN LANGUAGE — REQUIRED.** Use `Campaign`, `Application`, `SubmissionAttempt`, `ExecutionLease`, `CvVersion` and similarly meaningful concepts rather than generic technical nouns.

## 8. File, function, and naming discipline

- **One file, one coherent responsibility.** A file may export related types/functions; it MUST NOT mix unrelated route wiring, React UI, database logic and business orchestration.
- Keep source organization **feature-first**. A shared abstraction MUST live under its real neutral owner, not inside the first feature that happened to need it.
- **MUST use descriptive, short, stable names.** Usually 2–4 meaningful words. Reject names such as `GenericDataManager`, `EnhancedAdaptiveApplicationProcessor`, `CommonHelper`, `ThingUtils`, `HandlerV2`.
- Function names MUST make side effects apparent. A `get`/`format`/`parse` function MUST NOT secretly submit, navigate, persist or mutate shared state.
- Split functions by **independent responsibilities**, NOT an arbitrary line-count limit or the desire for tiny functions.
- Avoid deep nesting: use guards, small named steps, explicit transitions or well-placed extracted functions.
- A complex parameter object is justified only when the arguments form a genuine concept or materially improve readability.
- Do not create a React component for every `<div>`, `<span>`, or one-off visual fragment. **NO wrapper-only components**, trivial custom-hook factories, private helper soup, or gratuitous callback extraction.
- Keep shared design primitives reusable through properties/variants. Use semantic design tokens; detailed UI policy belongs to the design skill.
- Use ES modules consistent with each package's configuration, including NodeNext-compatible import paths where applicable.
- **ALL new code comments MUST be in English.** Comment WHY: constraints, concurrency assumptions, vendor quirks and non-obvious decisions. **DO NOT explain obvious statements.**
- If a temporary workaround is unavoidable, name the reason and a concrete removal condition. **NEVER** leave unbounded speculative TODOs.

## 9. Type safety, contracts, and data integrity

- **MUST preserve strict TypeScript settings** and use actual types inferred from Zod, function signatures or Drizzle schema when available.
- **NEVER** use `any` to bypass a contract, unsafe double assertions, broad non-null assertions or `@ts-ignore` to silence an unknown boundary. Use `unknown` and narrow it, or correct the source type.
- **MUST validate external inputs at the trust boundary**: browser/extension messages, HTTP requests, model/tool outputs, third-party site content and untrusted persisted JSON.
- Shared HTTP and extension contracts belong in `packages/contracts` when genuinely consumed by multiple packages. **DO NOT duplicate schema definitions** across web, API and extension.
- Internal domain objects SHOULD remain plain TypeScript structures unless stronger invariants justify a dedicated constructor/value object. **DO NOT manufacture DTO + entity + mapper triplets for identical shapes.**
- Keep backend null/default normalization near the data boundary. **DO NOT scatter fallback logic throughout UI.** Do not silently convert unknown/invalid business facts into plausible invented values.
- **NEVER** expose raw database rows, ORM objects, storage credentials or provider responses as accidental public API contracts.



## 10. Error handling and observability

- Errors MUST be explicit at the correct boundary. **NEVER** swallow exceptions, return fabricated successful results, or leave indefinite loading states.
- Distinguish validation, authentication, authorization, conflict/stale control, transient infrastructure failure and uncertain external outcome when behavior depends on the distinction.
- Translate internal errors into safe, actionable UI states. Do not expose stack traces, tokens, SQL, personal CV contents, recruiter messages or raw model inputs in user-facing errors.
- Use structured, contextual server logs; retain relevant operation, request or attempt identifiers. **NEVER log secrets or unnecessary personal data.**
- Retry only operations proven safe to repeat. **NO blanket retry for mutations, submissions, messages or browser actions.**
- Ensure resources are closed/cancelled appropriately: connections, streams, subscriptions, browser listeners and abortable operations.

## 11. Performance hygiene — WITHOUT premature optimization

- Avoid unnecessary client bundles, wide `"use client"` boundaries, fetch waterfalls, expensive render calculations and eager rendering of large result tables.
- Prefer stable state ownership and bounded updates over memoization everywhere.
- Do not recompute large sorting/filtering/mapping operations during every React render.
- Keep Cloud Run service work bounded and recoverable; never assume warm instances or persistent process memory.
- For actual performance work, **MEASURE before optimizing** with appropriate browser, server or database tools. **NEVER** claim latency/memory improvements without measurements.
- Defer detailed optimizations to the dedicated performance skill rather than copying its entire playbook.

## 12. Dependencies and design patterns

### Dependencies

- **MUST check native language/platform APIs and installed packages FIRST.**
- MAY install a dependency already approved in Mirai's stack when it solves a real, current need. **MUST verify the latest available stable release, peer compatibility, platform support and lockfile integrity at installation time.**
- **MUST obtain approval** before introducing an unapproved library, framework, hosted service or architectural technology.
- **NEVER** add a package for a trivial utility already available natively or through existing dependencies.
- **NEVER** upgrade unrelated packages during a focused feature change, or introduce prereleases merely because they are numerically newer.

### Patterns: solve real problems, NEVER just collect patterns

Accept a pattern ONLY when it makes a real boundary or repeated behavior simpler:

- **Adapter:** for example, toisolate Chromium/Firefox, storage, portal and AI-provider differences.
- **Strategy:** interchange model providers or genuinely different evaluation algorithms behind a stable contract.
- **Facade/application use case:** expose one coherent domain operation when several steps would otherwise leak to the caller.
- **State machine:** make campaign, attempt and execution transitions explicit when simple conditionals no longer enforce invariants reliably.
- **Decorator:** add cross-cutting metrics or instrumentation around a stable operation only when truly reusable.
- **Coordinator:** extract a multi-step *presentation-only* flow from an oversized React component; NEVER turn it into a second business service.

**DO NOT force GoF patterns, inheritance, event sourcing, CQRS, generic repositories or message buses into straightforward feature code.**

## 14. Testing policy — CRITICAL LOGIC ONLY

**DO NOT WRITE TESTS FOR EVERYTHING.**

**MUST create or update focused tests** when implementing or materially changing critical behavior such as:
- Authentication, authorization, account ownership or control transfer.
- Lease/epoch fencing, concurrency, idempotency or prevention of duplicate external actions.
- Campaign constraints, submission limits, lifecycle transitions and uncertain-result reconciliation.
- Security boundaries, malicious/untrusted input handling and consent revocation.
- Non-trivial transactions, irreversible operations, historical CV-version integrity or important regression fixes in these areas.

**DO NOT create routine tests** for copy changes, cosmetic UI work, trivial presentational components, boilerplate wrappers, straightforward wiring or mechanical refactors without a meaningful behavior risk. **NO coverage quotas, snapshot inflation or testing theater.**

Use the existing Vitest setup when suitable. Choose the smallest test that proves the critical invariant; isolate external providers with controlled fakes. An E2E test is justified ONLY when a critical interaction cannot be proven at a cheaper boundary.

**NEVER replace real production behavior with mocks** or claim a mocked green test proves a live browser portal, cloud service or authorization flow works.

## 15. Change execution and verification

For non-trivial work, follow this sequence:

1. **TRACE** the live flow and identify the real owner of the change.
2. **DECIDE** the minimal change and which existing code/components to reuse.
3. **IMPLEMENT** the complete requested behavior, including failure and recovery states that matter.
4. **VERIFY** the affected package with available typecheck, lint and build commands. Run focused tests ONLY when this skill's critical-testing rule applies or the user explicitly requests tests.
5. **CHECK** cross-package contracts and unintended changes. Confirm that no source-of-truth or feature was silently duplicated.
6. **REPORT** changed files, behavioral result, validation actually performed and any material unverified integration.

Prefer focused package scripts; use root `pnpm check` or `pnpm build` when cross-workspace changes warrant them. **MUST NOT claim commands ran if they were not executed.**

**NEVER** substitute a passing static check for proof of an external side effect. When connected infrastructure cannot be inspected, explicitly separate *implemented in code*, *provisioned*, and *verified working*.

Keep final implementation reports SHORT. **NO** ceremonial explanations, repeated checklists or unrelated refactor suggestions.

## 16. Final rejection checklist

Reject a change before delivery if ANY of these are true:

- It duplicates an existing feature, contract, component or source of truth.
- It creates extra indirection without removing real complexity.
- It mixes UI with SQL/provider/browser execution logic.
- It bypasses server authorization or trusts unvalidated external input.
- It hides irreversible side effects inside helpers, getters, renders or automatic retries.
- It treats a potentially sent application as definitely failed or safely retryable.
- It invents data, silently drops errors or reports simulated work as real.
- It adds unapproved or unnecessary dependencies.
- It creates gratuitous tests rather than protecting a critical invariant.
- It leaves the requested functional flow incomplete or claims unrun verification.

**FINAL RULE: MIRAI CODE MUST BE SIMPLE, EXPLICIT, TYPE-SAFE, FEATURE-OWNED, SECURITY-AWARE AND CORRECT UNDER FAILURE. WRITE LESS CODE WHEN LESS CODE IS ENOUGH.**

---

### Reference hierarchy

Use live official documentation when an API, release or compatibility question matters:
- Agent Skills specification: https://agentskills.io/specification
- Next.js Server/Client Components and data security: https://nextjs.org/docs/app/getting-started/server-and-client-components and https://nextjs.org/docs/app/guides/data-security
- React rules: https://react.dev/reference/rules
- TypeScript: https://www.typescriptlang.org/docs/
- Express: https://expressjs.com/
- Zod: https://zod.dev/
- Drizzle: https://orm.drizzle.team/docs/overview
- WXT: https://wxt.dev/
- Vercel engineering skill index for comparison, NOT as an automatic dependency: https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
