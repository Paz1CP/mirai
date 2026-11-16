---
name: mirai-web-performance
description: "Use for performance-sensitive or explicitly slow Mirai web and browser-extension features: Core Web Vitals, startup, Next.js rendering/streaming, async waterfalls, client bundles, hydration, React render costs, large lists, media, browser main-thread work, memory, network latency and performance profiling. Enforces evidence-driven optimizations and measured verification. Do NOT invoke for ordinary feature work, visual design, general state ownership, API contracts or database tuning without a concrete performance concern."
---

# Mirai — Web Performance

**Scope:** Next.js App Router, React, TypeScript, Tailwind CSS, browser runtime, and WXT extension surfaces when implemented.  
**Last reviewed:** 2026-11-16.  
**Boundary:** Apply `mirai-clean-code-architecture` for architecture and dependencies, `mirai-state-management` for state ownership/caching, and `mirai-neon-postgres-best-practices` for SQL tuning. **DO NOT repeat their rules here.**

## 1. Mandate — PERFORMANCE IS AN OBSERVABLE OUTCOME

**MUST optimize the bottleneck that affects real users, NOT the code that merely looks expensive.**

**MUST** distinguish initial loading, interactivity, visual stability, route transition, client CPU, memory, server wait time, and network transfer BEFORE proposing a fix.

**NEVER** claim that fewer lines, more memoization, a new library, a green build, or a synthetic score alone proves a faster experience. **NEVER** add performance infrastructure or abstractions without a measurable need.

Use inexpensive structural safeguards proactively; reserve intrusive changes for demonstrated problems.

## 2. Verified repository baseline — CHECK AGAIN BEFORE ACTING

At the time of writing:
- `apps/web`: **Next.js 16 App Router, React 19, Tailwind CSS 4**, with a standalone build for Cloud Run.
- `apps/web/next.config.ts`: `output: "standalone"`, monorepo tracing root, `transpilePackages: ["@mirai/contracts"]`. **`cacheComponents` is NOT enabled.**
- Web production build script runs native TypeScript 7 checks before `next build`. **Do NOT switch compiler or bypass the package script.**
- `apps/api` is a separate Express service; the web app is NOT authorized to bypass its API boundary for performance.
- A WXT extension is planned, NOT evidence that its source, build pipeline, or runtime has been implemented.

**MUST inspect current manifests and configuration.** Do not assume React Compiler, a bundle analyzer, a metrics SDK, a service worker, or new caching features are installed/enabled.

## 3. Performance targets — USE THE CORRECT METRIC

These are **standard user-experience reference thresholds**, NOT guarantees or arbitrary per-component SLAs. Evaluate **field data at the 75th percentile**, separately for mobile and desktop when the data supports it:

| Metric | Good reference | What it measures |
| --- | --- | --- |
| **LCP** | **≤ 2.5 s** | Loading of the largest visible content element |
| **INP** | **≤ 200 ms** | Responsiveness from interaction through next paint |
| **CLS** | **≤ 0.1** | Unexpected visual movement |

**MUST NOT use FID as the current Core Web Vital for interactivity.** Use TTFB, FCP, long tasks, long animation frames, network timing, JS bytes, memory, and relevant user journeys as **diagnostic** signals, not substitutes for those outcomes.

For an already-open application, ALSO measure interaction-specific latency, route-to-usable-content time, real-time update processing, and UI responsiveness. A good homepage LCP does NOT prove a complex authenticated screen is fast.

**NEVER promise fixed millisecond gains without baseline and post-change measurements.**

## 4. Mandatory profiling workflow for performance work

1. **REPRODUCE** the slow route, interaction, dataset and device/browser conditions.
2. **MEASURE** a production or production-like build (`next build` + `next start` or equivalent deployment). Development mode, React Strict Mode and hot reload distort performance.
3. **CLASSIFY** the bottleneck using browser DevTools Performance/Network/Memory, React Profiler, Lighthouse or field RUM where applicable.
4. **IDENTIFY** the critical path: HTML/TTFB, server data waits, sequential requests, downloaded JS, hydration, render/paint, media decode, long tasks or memory retention.
5. **CHANGE ONE HIGH-IMPACT CAUSE** using the least invasive fix.
6. **MEASURE AGAIN** under comparable conditions, including slower representative devices/network when relevant; check for regressions.
7. **REPORT** before/after numbers with conditions. If profiling was unavailable, label conclusions as **unmeasured static analysis**.

**MUST prefer real-user measurements over a single Lighthouse run** for observed production pain; use synthetic tests to reproduce and isolate causes. Do NOT compare cold and warm server runs as though they were equivalent.

## 5. Async request waterfalls — HIGHEST PRIORITY

- **MUST distinguish dependent work from independent work.** Start independent operations concurrently; await them together (`Promise.all` or equivalent) when their failure semantics permit.
- **NEVER** introduce serial `await` chains merely because each piece of data renders in a different component.
- Defer awaiting work until a result is actually needed; execute cheap rejection conditions BEFORE expensive awaits.
- Use meaningful Suspense/streaming boundaries to reveal ready content sooner; a loading skeleton is useful ONLY if the route can actually make progress while other work loads.
- **DO NOT parallelize dependent operations blindly**, overload an API with uncontrolled fan-out, or hide errors behind `Promise.allSettled` without a recovery policy.
- Trace the full browser → Next.js → Express → provider/network chain. A React render optimization will NOT fix a slow backend operation or a cross-service request waterfall.
- Avoid duplicate HTTP requests and unnecessary client refetches when a properly scoped server-rendered response already supplies the needed data; detailed cache ownership belongs to the state skill.

## 6. Rendering strategy and server work — NEXT.JS 16

- **MUST keep client JavaScript boundaries as small as functionality allows.** Render static and non-interactive content in Server Components when appropriate; ship interactive code only where needed.
- For authenticated SSR, inspect the TTFB and client/server request sequence. **DO NOT move database calls or privileged operations into Next.js merely to eliminate an HTTP hop**; preserve Mirai's Express boundary.
- Use streaming and Suspense for independently ready regions, NOT as decoration. Prevent one slow low-priority section from blocking otherwise usable content.
- Cache only content whose identity, freshness and access scope make caching safe. **NEVER make private per-request data globally cacheable for a lower TTFB.**
- Next.js 16 `cacheComponents` and the `use cache` model are configuration-dependent. **DO NOT enable `cacheComponents`, add `use cache`, or apply older route-cache directives blindly.** Inspect `next.config.ts`, current Next.js documentation and actual cache behavior first.
- Diagnose server response time independently from browser hydration. Profile the responsible service; backend-specific query optimizations are owned by the database skill.

## 7. Client bundles and startup — SEND LESS, EXECUTE LESS

- **MUST inspect the production client bundle** when startup, hydration or first interaction is slow. Use Next.js bundle tooling compatible with the installed bundler/release; experimental analyzers require explicit justification.
- Avoid importing large browser-only modules into the critical route or shared client layout. Audit barrel exports, broad icon imports, libraries with costly side effects, and dependencies that disable tree shaking.
- Use route-level/code splitting and `next/dynamic` or supported dynamic imports for **genuinely heavy, non-critical interactive modules**. Do NOT split tiny modules or introduce waterfall-prone code splitting.
- Keep analytics, editors, visualizations and other optional features off the critical loading path when appropriate, without sacrificing required functionality.
- Preload/preconnect only assets and origins with demonstrated near-term use. **NEVER preload every route, image, module or connection.**
- Measure both **transferred** JavaScript and its **parse/compile/evaluation/hydration CPU cost**; compressed bundle size alone misses long main-thread blocking.
- Respect existing `output: "standalone"` and tracing behavior; an apparently smaller bundle that omits runtime dependencies is NOT an optimization.

## 8. React responsiveness — FIX WORK BEFORE MEMOIZING

- Inspect slow interactions in React DevTools Profiler and the browser main-thread flame chart. Identify whether the cost is render, commit, synchronous event handlers, style/layout, paint or unrelated JavaScript.
- Keep expensive sorting, filtering, parsing, formatting and data reshaping OFF hot render paths when their real cost matters. Prefer precomputation or an appropriately cached derived value.
- **DO NOT blanket-apply** `memo`, `useMemo`, `useCallback`, context splitting or hand-written equality checks. Use them only for observed expensive work or demonstrably unstable dependencies.
- React Compiler can perform memoization, but **MUST verify it is actually enabled** before depending on it. Do NOT install or enable compiler tooling as a speculative fix.
- Use `startTransition` / `useDeferredValue` when a real non-urgent React update blocks urgent input; these scheduling tools **DO NOT make CPU-heavy work intrinsically cheaper**.
- Keep event handlers short. For sustained CPU-heavy transforms, consider chunked main-thread work or a Web Worker only after measurement; prefer browser-native and existing APIs.
- **NEVER** remove required behavior, skip essential state transitions or introduce stale UI results in the name of lower render counts.

## 9. Large lists, tables and scrolling

- **MUST bound rendering cost** for genuinely large datasets: API pagination, incremental loading, row/window virtualization, or a combination chosen by measurement.
- Use virtualization ONLY when DOM size, rendering cost or memory justify it. **NEVER install a virtualization package for a small list by default.**
- Keep row identities/keys stable. Avoid unnecessary remeasurement, expensive per-row transformations and whole-table recomputation for small local changes.
- Consider CSS `content-visibility` for suitable large offscreen sections, but verify accessibility, intrinsic sizing, scroll position and layout stability. It is NOT a universal replacement for virtualized rows.
- When a list contains media or interactive widgets, profile real scrolling on representative hardware; fast desktop rendering does not prove smooth mid-range/mobile behavior.
- Keep visible interactions accessible; performance optimization MUST NOT break keyboard navigation, screen-reader semantics or focus retention.

## 10. Images, fonts, scripts and layout stability

- Use `next/image` or an existing equivalent when it materially improves resizing, responsive sources, modern formats and lazy loading. Do NOT send full-resolution media for a tiny display.
- In Next.js 16, `preload` is the explicit option for justified critical images; the legacy `priority` property is deprecated. **NEVER make every image eager.**
- **MUST reserve image/video/container dimensions or aspect ratios** and avoid late content insertion that causes CLS. Loading states should match the eventual layout where practical.
- Use the existing `next/font` setup and avoid redundant font variants/loads; keep fallback behavior predictable. Do not add additional fonts for performance fixes.
- Defer nonessential third-party scripts and audit their main-thread cost. A small transfer can still execute expensive code.
- Investigate heavy blur, backdrop filters, large shadows, repeated forced synchronous layout, expensive animations and paints **only when profiling points to rendering cost**.
- Prefer compositor-friendly transforms/opacity for smooth animations when suitable; do not rely on `will-change` everywhere or force GPU layers without evidence.

## 11. Network, real-time UI and memory

- **MUST measure** response payload size, server processing time, network wait, number of requests and repeat traffic when a data-heavy view feels slow.
- Prefer bounded payloads, compression where supported, and sensible batching over more client-side processing. Avoid polling or refetch storms that overload the browser/API.
- When frequent live events cause lag, coalesce presentation updates at an appropriate rate while preserving authoritative event semantics. **NEVER silently discard information required for correctness.**
- Keep long-running subscriptions, observers, workers, event handlers, timers and browser resources bounded and properly disposed. Investigate detached DOM nodes, retained objects and cache growth for memory leaks.
- Avoid decoding huge JSON, images or documents synchronously on the main thread when observable input latency suffers.
- Do not maintain duplicate large in-memory representations solely for UI convenience; use focused data ownership from the state-management skill.
- **DO NOT use retries, caching or request coalescing to alter externally visible semantics.** Optimize transport only within the existing operation contract.

## 12. Browser-extension performance — WHEN PRESENT

For an actual WXT browser-extension task:
- **MUST profile extension costs separately**: background/service-worker startup, content-script injection, message transport, DOM observation, and execution within target pages.
- Keep content-script bundles small and inject/activate them only for necessary sites/contexts under the permissions model.
- Prefer targeted DOM observation and bounded batches to broad repeated full-document scans; disconnect observers when no longer needed.
- Treat extension/service-worker lifecycles as interruptible. **NEVER assume a persistent background process for performance or correctness.**
- Keep messages small and avoid repeated serialization of huge DOM snapshots or media payloads; profile transfer/processing costs before introducing worker complexity.
- **NEVER trade permission scope, correctness, host-page stability or browser compatibility for hypothetical speed.**
- Do NOT invent an extension performance bottleneck before the extension exists.

## 13. Tool selection and performance evidence

Use the smallest tool set that answers the question:

| Symptom | Primary evidence |
| --- | --- |
| Slow initial render/LCP | Production Chrome Performance + Network + field LCP attribution |
| Poor INP | Chrome Performance interaction track, long tasks, React Profiler |
| CLS | Layout-shift track, image/font sizing, field CLS attribution |
| Large client JS | Production bundle analysis, coverage and CPU evaluation |
| Slow page navigation | Network waterfall + Next.js route/stream timing |
| Slow large list | DOM nodes, commit duration, memory and scroll trace |
| Memory growth | Heap snapshots, retained nodes, listener/subscription counts |
| Slow network path | Request/response timings and server-side tracing |
| Slow extension | Extension-specific profiler, message timings and DOM observer workload |

**MUST keep measurements comparable**: browser version, viewport, device class, throttling, cache state, data volume, route and interaction. Do NOT invent numeric savings or imply a single lab score is a field percentile.

**ONLY add ongoing telemetry when the product needs it** and existing instrumentation cannot answer the question. Do not collect raw private payloads in traces.

## 14. Implementation and validation contract

When the performance skill is triggered:

1. **STATE THE SYMPTOM** and the suspected measured subsystem.
2. **PROFILE** with real conditions when available; classify bottleneck before changing code.
3. **FIX THE CRITICAL PATH FIRST**: unnecessary waits, excessive shipped JS, blocking CPU, unbounded rendering or media costs.
4. **RECHECK** functionality, accessibility, typecheck/build and key interactions; run targeted regression checks only when justified by the primary engineering skill.
5. **COMPARE** before/after measurements; if unavailable, explicitly distinguish a plausible structural improvement from a proven speedup.
6. **REPORT BRIEFLY** the bottleneck, touched files, observed gains, regression checks and remaining material uncertainty.

**FINAL RULE: REMOVE REAL WORK, NOT NECESSARY FEATURES. MEASURE BEFORE COMPLEXITY. NEVER CLAIM A PERFORMANCE WIN WITHOUT EVIDENCE.**

---

### Official reference priorities

- Core Web Vitals and field percentiles: https://web.dev/articles/vitals
- LCP/INP/CLS targets: https://web.dev/articles/defining-core-web-vitals-thresholds
- INP and long tasks: https://web.dev/articles/optimize-inp · https://web.dev/articles/optimize-long-tasks
- Next.js 16 production performance: https://nextjs.org/docs/app/guides/production-checklist
- Next.js bundling: https://nextjs.org/docs/app/guides/package-bundling
- Next.js caching: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
- Next.js images: https://nextjs.org/docs/app/api-reference/components/image
- React memoization: https://react.dev/reference/react/useMemo
- React Compiler: https://react.dev/learn/react-compiler/introduction
- Benchmark agent skill (NOT Mirai policy): https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md
- Agent Skills specification: https://agentskills.io/specification

