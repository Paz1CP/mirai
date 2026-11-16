---
name: mirai-state-management
description: "Use for Mirai React/Next.js state ownership, TanStack Query remote data, Zustand shared client state, local React state, cache invalidation, mutations, hydration, live event synchronization, and state-related bugs. Enforces one owner per fact and safe synchronization across account sessions. Do NOT use for ordinary static UI, backend-only domain logic, database operations, or model serialization."
---

# Mirai — State Management

**Scope:** `apps/web` on React 19 / Next.js App Router; approved TanStack Query v5 + Zustand v5.  
**Last reviewed:** 2026-11-16.  
**Relationship:** Apply `mirai-clean-code-architecture` for general architecture and critical-testing policy; `mirai-modeling-serialization` for payload contracts. **DO NOT reproduce those rules here.**

## 1. Fundamental rule — ONE OWNER PER FACT

**MUST establish the authoritative owner and lifetime BEFORE choosing a state API.** Using one global store for every kind of state is a design error.

| State | Default owner | Example |
| --- | --- | --- |
| Ephemeral UI inside one subtree | React `useState` / `useReducer` | Open dialog, draft input, selected local tab |
| URL-shareable navigation/view | Next.js route and search parameters | Dashboard filters, page, sort, selected record when navigation-relevant |
| Remote server resources | TanStack Query | Paginated resources, user-owned records, authenticated session snapshot |
| Shared client-only interaction | Zustand **only when needed** | Layout mode, cross-panel UI preferences, connection indicator |
| Connection/stream transport | Narrow client connection adapter | SSE/WebSocket subscription, browser-extension connectivity |
| Durable product state and authorization | Express + PostgreSQL | Persisted workflow state, access grants, authoritative leases, operation outcomes |
| Extension execution state | WXT extension and server acknowledgments | Managed browser tabs, local checkpoints and bridge connection |

**NEVER** put the same remote resource into TanStack Query AND Zustand as two independently mutated copies. **NEVER** use React or Zustand state as proof of authorization, a valid execution lease, an externally completed effect or server persistence.

## 2. Repository and version reality

At the time of writing, Next.js/React are installed; **TanStack Query and Zustand are approved but NOT yet listed in `apps/web/package.json`**. Inspect the live manifest and source BEFORE assuming providers or stores exist.

When the relevant feature needs them, install the **latest stable compatible releases of the approved libraries**, preserving the lockfile. **DO NOT** introduce alternative state libraries, code generators or cache wrappers. Library and dependency approval rules are owned by the clean-code skill.

Follow the actual Next.js App Router structure under `apps/web/src/`. Keep state helpers feature-owned unless multiple unrelated features genuinely share their meaning. **NO mandated `stores/`, `hooks/` or `providers/` tree without a real consumer.**

## 3. Decision tree — use the smallest state primitive

1. Does the value need to survive on the server or be visible to another device? **Use a server resource, not a client store.**
2. Is it derived from an API read? **Use TanStack Query or server-rendered read as appropriate.**
3. Is it part of navigation, a link or reloadable table state? **Consider URL parameters first.**
4. Is it confined to one component/subtree? **Use local React state.**
5. Do unrelated client components need to change the same local interaction state? **Use one narrowly scoped Zustand store.**
6. Is it only a computed view of other state? **Derive it; do not store a duplicate.**
7. Is it a connection heartbeat or transport object? **Own it in a dedicated effect/adapter, not serialized product state.**

**DO NOT promote state to Zustand because passing two props feels inconvenient. DO NOT create providers for constants.**

## 4. TanStack Query v5 — remote reads

- **MUST use stable, JSON-serializable query keys** that encode resource identity and every parameter affecting the result: account scope, IDs, search, filters, sort, pagination, and version when relevant.
- Keep feature-specific key factories or `queryOptions` close to the feature. **DO NOT add a query-key-generation library** for a few keys.
- **MUST distinguish `isPending`, `isFetching`, success, empty data and failure** in the rendered UI. A background refresh is NOT necessarily a full-screen loading state.
- Set `staleTime` from the volatility of the resource, not one global arbitrary number. Know that default `staleTime` is `0` and inactive `gcTime` is five minutes.
- Default client query retries exist; **MUST disable or narrow retry for authentication/permission errors** and bound retries for safe transient reads. Never treat repeated unauthorized responses as connectivity failures.
- Pass TanStack Query's `AbortSignal` into cancellable fetches. Cancellation of a GET request does NOT undo server writes.
- Use `enabled`/`skipToken` or equivalent supported v5 gating when essential identity or parameters are unavailable. Never query another account's resource under a placeholder key.
- Use `useInfiniteQuery` ONLY for actual cursor-based progressive lists; do not keep an unlimited client-side collection for every dashboard query.
- Avoid `useEffect` that fetches data already owned by a query. **DO NOT mirror query results into local state on every response.**
- Keep API response parsing in the contract/data boundary, not duplicated inside React render code.

## 5. Mutations — consequential commands require explicit outcomes

- Use TanStack `useMutation` for user-triggered API writes when it provides meaningful loading/error/success coordination.
- **MUST invalidate the affected query keys after successful mutation**, or update the exact cached resource from a complete authoritative server response. Do NOT globally invalidate everything by reflex.
- Use `onSuccess`/`onError`/`onSettled` on mutations as supported in v5; **DO NOT use removed per-query `useQuery` callbacks**.
- Default mutation retries are disabled. **MUST NOT enable automatic retries** for non-idempotent writes, irreversible external effects, authorization changes, control transfers or commands whose outcome may be ambiguous.
- On an ambiguous network response from a consequential command, show **unknown/pending reconciliation**, NOT success and NOT an automatic replay.
- **NO optimistic confirmation of external effects:** a locally updated counter cannot prove that a remote system accepted an operation.
- Optimistic UI is acceptable for reversible, low-risk client interactions only. If changing remote cache optimistically, MUST cancel affected reads, snapshot, roll back on error, and reconcile with the server. Prefer a mutation-pending UI rather than complex cache surgery when only one component needs feedback.
- Disable duplicate button activation while a critical mutation is pending as UX protection; backend idempotency remains the authority.

## 6. Zustand v5 — shared CLIENT state only

- **MUST keep stores narrow** and feature-specific: panel emphasis, temporary cross-panel selection, a non-sensitive UI preference or presentation-only connection indicator.
- Use direct selectors that return stable values. **NEVER subscribe a large screen to the entire store** when it needs one field. In Zustand v5, selectors returning freshly allocated objects/arrays can cause unnecessary updates or render loops; derive outside or use supported shallow comparison when genuinely needed.
- Expose explicit, small state actions; do not let arbitrary components mutate internal store objects or encode business workflows in setters.
- **NEVER put mirrored API response collections, sensitive records, credentials, authoritative permissions or durable workflow state into Zustand.**
- **NEVER create a mutable module-global Zustand store that is read or written during Next.js server requests.** In SSR-sensitive cases use request-scoped store factories and matching hydration; React Server Components MUST NOT access a mutable store.
- A browser-only store can be used in a client boundary without pretending it is shared across server requests. **MUST prevent hydration mismatch** for browser-derived initial values.
- Use Zustand `persist` **ONLY** for harmless, explicitly selected preferences (e.g. a layout preference). Apply `partialize`, versioning/migration only if persistence needs evolution, and a deliberate hydration strategy.
- **NEVER persist sensitive records, authorization state, lease generations, session secrets or private message contents into `localStorage` simply for convenience.**
- Do not install equality/middleware packages or auto-selector generators unless their concrete value and compatibility justify them.

## 7. Next.js App Router — hydration and cache ownership

- **Server Components MUST NOT read or write Zustand stores or instantiate global mutable account state.**
- For authenticated server prefetching, **MUST create a request-isolated QueryClient** and dehydrate only data permitted to reach that user's browser. Browser QueryClient MUST remain stable across ordinary renders.
- Use `HydrationBoundary` when server prefetch + interactive client querying provides real value. **DO NOT dehydrate the entire private cache** into HTML by default.
- Keep query keys, freshness rules and serialized payload shape compatible between prefetch and client consumption; avoid immediate duplicate requests caused by accidental mismatches.
- Next.js server rendering/fetch cache and TanStack Query client cache are **DIFFERENT caches**. Define which one owns freshness for a given view; when both participate, coordinate invalidation instead of assuming one invalidates the other.
- **MUST clear/cancel/remove account-specific cached queries** on sign-out, account change or session invalidation. A query key containing `accountId` is NOT itself an access-control boundary.
- **DO NOT cache personalized rendered responses publicly** or leak request-specific data through module singletons.

## 8. Real-time resources, SSE/WebSocket, and external events

- A stream is **a delivery mechanism, NOT the database of record**. Durable resource and authorization state must be recoverable from authoritative API reads.
- Use a single owner for each actual connection/subscription; MUST attach and dispose listeners with component/session lifecycle, not recreate streams on unrelated renders.
- On reconnect, session/controller change, or page reload, **MUST obtain an authoritative snapshot or replay events from a server-supported cursor** before declaring the UI current.
- Apply event updates only after validating the event contract and checking resource identity and monotonic sequence/version where provided. **NEVER apply stale events over a newer confirmed resource.**
- Deduplicate repeated event IDs, and invalidate/refetch queries after gaps or ambiguous ordering. Do not build a generic event-sourcing framework merely to refresh a dashboard.
- Disconnection, loss of execution authority or control transfer MUST be handled by the actual server/transport authority mechanism. **A Zustand `isConnected` flag is never authorization to execute.**
- A presentation-only layout switch MUST NOT trigger unrelated durable operations, duplicate listeners or reset authoritative data.
- A locally pending operation and an externally confirmed outcome are distinct states. **MUST preserve every server-defined pending, unknown, failed or confirmed outcome without inventing transitions.**

## 9. Derived state, effects and lifecycle

- Derive counts, labels, filtered local options and component presentation from their owner instead of storing computed duplicates.
- React render MUST remain pure. Effects are for external synchronization; avoid effects used solely to copy props into state or to calculate render values.
- Use `useReducer` for a genuinely complex local interaction with distinct transitions before promoting it to global state.
- Use memoization/selectors only where they reduce real work or prevent unstable subscriptions. **DO NOT add `useMemo`/`useCallback` to every function by reflex.**
- For form drafts, preserve unsaved edits separately from remote query data. A background refetch MUST NOT silently overwrite the user's active edits.
- Use refs for imperative handles when appropriate, not as hidden durable state.
- Cancel/cleanup obsolete requests, listeners, timers and long-running UI-side subscriptions. **NEVER** let a stale closure apply a result to the wrong resource, session or account.

## 10. Failure and retry behavior

| Situation | Required UI/state response |
| --- | --- |
| Initial safe read loading | Loading state appropriate to the view |
| Background revalidation | Keep verified data visible, indicate refresh only if useful |
| Unauthorized/expired session | Stop private reads, clear account cache, use auth recovery |
| Permission or version conflict | Preserve user intent, refresh authoritative data, require valid next action |
| External mutation outcome unknown | Display unresolved state, reconcile; **NO automatic replay** |
| Real-time connection lost | Stop claiming live synchronization; render actual server/transport status |
| Data unavailable | Explicit error with safe retry for idempotent reads |

**NEVER** interpret a network timeout or missing WebSocket message as proven success/failure, or replay an irreversible effect blindly.

## 11. Verification — focused and real

For state work, verify the ownership of each value and the affected transitions:
- Correct query keys, retry behavior, invalidation and cleanup.
- No state leak between authenticated users or server requests.
- SSR/client hydration matches and client boundaries are correct.
- Reconnect and stale event handling preserve authoritative state.
- Critical mutations cannot retry or duplicate consequential effects accidentally.

Run relevant typecheck/lint/build checks. Add focused tests ONLY when a critical invariant or high-impact regression requires them under `mirai-clean-code-architecture`. **NO generic tests for every selector, toggle or query wrapper.**

## 12. Final rule

**SERVER DATA BELONGS TO TANSTACK QUERY OR SERVER RENDERING. SHARED CLIENT INTERACTION BELONGS TO ZUSTAND ONLY WHEN NEEDED. LOCAL UI BELONGS TO REACT. DURABLE AUTHORITY BELONGS TO THE SERVER. NEVER DUPLICATE THE SOURCE OF TRUTH.**

### Official references — use latest stable API documentation

- TanStack Query v5 defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- Query keys: https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- Mutations and invalidation: https://tanstack.com/query/latest/docs/framework/react/guides/mutations · https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations
- Optimistic updates and cancellation: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates · https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
- Next.js SSR: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
- Zustand Next.js: https://zustand.docs.pmnd.rs/learn/guides/nextjs
- Zustand v5 changes: https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5
- React: https://react.dev/reference/rules
- Comparison reference, NOT policy: https://www.skills.sh/voku/agent-skills/state-management

