---
name: mirai-design-creation
description: "MUST use when creating, implementing, modifying, reviewing, or translating Mirai React/Next.js user interfaces, Figma screens, visual components, layouts, interactions, responsive behavior, or design-system styling. Enforces shadcn/ui FIRST with Base UI primitives, existing Mirai tokens, Figma fidelity, Iconsax Free, accessibility, and minimal custom UI. Do NOT invoke for backend-only work, generic business logic, or isolated trivial copy changes without a design decision."
---

# Mirai — Design Creation

**Priority:** Authoritative UI implementation skill for the Mirai web application.  
**Stack:** Next.js App Router · React · Tailwind CSS · shadcn/ui **with Base UI** · Mirai Design System · Geist Sans · Iconsax Free.  
**Last reviewed:** 2026-11-16.

## 1. Purpose — BUILD ONE COHERENT UI

**MUST implement interfaces that belong to Mirai's existing visual system, NOT generic shadcn demos and NOT an independently invented design language.**

This skill owns **visual implementation decisions**: component selection, tokens, Figma translation, composition, responsive layout, accessibility and interaction presentation.

`mirai-clean-code-architecture` owns general engineering and dependencies; `mirai-state-management` owns application state; `mirai-web-performance` owns profiling/optimization; `mirai-modeling-serialization` owns transport contracts. **DO NOT duplicate their instructions here.**

**NEVER** encode temporary product workflows, particular business rules or a fixed list of screens into this skill. Read the current feature requirements from the task and repository instead.

## 2. MANDATORY design investigation before nontrivial UI work

Before creating or redesigning a screen, meaningful section, component family or interaction:

1. **INSPECT** the relevant existing component implementations in `apps/web/src/components/ui/`, their variants, and the active styling/token API.
2. **INSPECT** a similar real screen or interaction under `apps/web/src/app/` and `apps/web/src/features/`; identify existing composition and spacing conventions.
3. **READ THE RELEVANT PART** of `docs/design/mirai_design_system.md`. Use `docs/design/mirai_ui_ux_e2e.md` and the approved Figma design for the requested surface when applicable.
4. **MATCH** the requested visual and behavior to shadcn/ui's actual Base UI component APIs and the project's already-owned components.
5. **DECIDE** the smallest composition that preserves the design, all interaction states and responsive behavior.
6. **THEN IMPLEMENT.**

For a tiny styling adjustment or copy change, inspect the touched component and its token usage; **NO ceremonial repository-wide investigation.**

The existing Design System implementation is the normal UI API. Current user decisions, verified running UI, approved Figma details and repository documentation can evolve; Markdown documents are **revisionable design references, NOT immutable laws**. Resolve a material conflict from current evidence and update the relevant design documentation when a design decision actually changes.

## 3. THE MOST IMPORTANT RULE — shadcn/ui FIRST

**SHADCN/UI MUST BE THE DEFAULT FOR THE OVERWHELMING MAJORITY OF CONVENTIONAL UI.**

Mirai's intended balance is **roughly 90% conceptual reliance on shadcn/ui and 10% truly custom components**. These figures are an ILLUSTRATION OF PRIORITY, **NOT a measurable quota, file count, dependency target or excuse to force unsuitable components**.

### Component selection hierarchy — FOLLOW IN ORDER

1. **REUSE** the existing Mirai component built from shadcn/ui.
2. **COMPOSE** existing shadcn/ui components into the required section or interaction.
3. **EXTEND** a shadcn component's supported props, variants, styles or slots when the existing primitive almost fits.
4. **USE** an appropriate official shadcn/ui component not yet used in that feature, preserving the repository's configured Base UI foundation and local styling.
5. **BUILD** a feature-local custom component ONLY if the requirement is genuinely distinctive or unsupported by reasonable shadcn composition.
6. **PROMOTE** a custom component to shared UI ONLY after concrete cross-feature reuse justifies it.

**NEVER reimplement a Button, Input, Textarea, Checkbox, Select, Dialog, AlertDialog, Popover, Tooltip, DropdownMenu, Tabs, Accordion, Sheet, Badge, Skeleton, Sidebar or other conventional control from scratch when a suitable shadcn/ui solution exists.**

**NEVER create a wrapper component whose only job is to rename a shadcn component or hardcode one ordinary class.** Use its existing props, `className`, slot, or a genuinely reusable semantic variant.

**SHADCN/UI IS OWNED SOURCE CODE, NOT A BLACK-BOX UI PACKAGE.** Treat the installed local component implementations as the canonical behavior/styling surface. Review generated component changes before overwriting established customization. Do not fork two near-identical copies of the same primitive.

### Where custom UI IS justified

A custom component is justified for a unique composition, specialized interactive workspace, complex visualization, editor, domain-specific presentation, or layout not representable cleanly by existing parts. **EVEN THEN, its conventional controls MUST use shadcn/ui** whenever possible.

Custom does NOT mean a different visual system, separate focus implementation, alternative button library, or a CSS framework embedded inside one feature.

## 4. Base UI — ONE PRIMITIVE FOUNDATION

**BASE UI IS THE SELECTED SHADCN/UI PRIMITIVE FOUNDATION.**

- **MUST use the Base UI variant** of shadcn/ui components and follow the actual local `components.json`, component source and current official `base` documentation.
- **NEVER select or install Radix UI as a parallel default.** Do not mix Radix primitives or others into new components just because an old tutorial used them.
- **MUST import and use the repository's shadcn/UI components first**, not raw `@base-ui/react` primitives to bypass their tokens, semantics or variants.
- Raw Base UI composition is allowed ONLY when a required interaction cannot be expressed through a suitable shadcn component and the need is demonstrated.
- **NEVER blindly copy Radix-specific patterns** (`asChild`, event assumptions, prop names or package imports) into Base UI code. Verify current component signatures, composition patterns and accessibility behavior.
- Keep official shadcn components integrated with the Mirai style rather than shipping their default demo aesthetics.
- If a requested component requires adding approved code/packages, use the current official shadcn process for the **existing** Next.js workspace and review the exact dependencies. **DO NOT reinitialize or replace the application's existing UI configuration as a shortcut.**

**NO competing design library** (MUI, Chakra, Ant Design, Mantine, Bootstrap, etc.) without a separately approved architectural decision.

## 5. Visual identity and tokens — NEVER BYPASS THE SYSTEM

**MUST use the current Mirai Design System as the authority for colors, typography, spacing, surfaces, borders, radii, iconography and motion.**

The approved direction is **Dark Technical Minimalism**: dark neutral surfaces, restrained accent, clear hierarchy, precise dense-but-readable layouts, and purposeful interaction. This describes the **design language**, not permission to hardcode yesterday's color values. Refer to live semantic tokens.

- **MUST use semantic Tailwind utilities / CSS variables** defined by the project: e.g. `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `ring-ring`, or the applicable Mirai semantic surface/status token.
- **NEVER hardcode arbitrary hex colors, raw brand values, one-off opacity blends, duplicate CSS palettes or unsupported Tailwind color utilities** when a project token represents the intent.
- **MUST preserve foreground/background contrast pairs**, particularly for primary, destructive, selected, disabled and focus states.
- **MUST use existing tokens, constants, localization/content resources, and named variables for reusable UI values. NEVER hardcode hex/RGB/HSL colors, arbitrary typography, spacing, radii, shadows, motion durations, breakpoints, z-index values, or repeated semantic strings/status labels when the Design System or a shared source already defines them.**
- **MUST source user-facing labels, validation messages, and repeated interface copy from the established content/localization API when one exists.** Keep dynamic content data-driven; NEVER duplicate the same meaningful label or status wording across components as unrelated string literals.
- **DO NOT create a new constant, token, localization framework, or indirection for every one-off literal.** Genuine one-time copy, numeric values required by a protocol, and CSS values that are intrinsic to a specific layout are acceptable when no existing semantic abstraction applies.
- **MUST follow the existing spacing, radius, surface and typography scales.** The spacing rhythm is structured, not a license to generate twenty arbitrary numbers.
- Prefer neutral separation, subtle borders and controlled elevation over decorative cards, gradients, glows, shadows or saturated backgrounds. Add such effects ONLY when justified by the requested approved design.
- **MUST distinguish semantic roles from one-off artwork.** An intentionally document-like or otherwise special surface can have its own established token scope without redefining the global app theme.
- Use existing component variants and semantic status colors. **NEVER convey a status through color alone.**
- When a genuinely reusable visual role is missing, extend the appropriate existing token/variant deliberately and document the meaningful change; **DO NOT scatter per-screen overrides**.

**NO arbitrary palette mutations to make a screenshot look closer at the cost of breaking the rest of the product.**

## 6. Typography and icons — CONSISTENT BY DEFAULT

- **GEIST SANS IS THE UI FONT** across text, numbers, controls and dense data. Use existing semantic typography styles/classes and the established font loading. **NEVER** introduce Geist Mono, an unrelated monospace face or a new font simply because an example contains it.
- Follow existing text scale, weights, line heights, muted text roles and tabular numerals for aligned numeric data. Adjust only where legibility or approved design requires it.
- **ICONSAX FREE IS THE PRIMARY ICON FAMILY.** Prefer the repository's existing icon wrapper/import convention. Choose the appropriate outline/filled weight according to the design's meaning, not personal preference.
- **NEVER mix icon families casually.** shadcn examples may ship with Lucide icons; adapt conventional visible product icons to the designated icon set where equivalent without breaking component functionality.
- Use accessible labels for icon-only controls. Do NOT rely on a tooltip as the only semantic accessible name.
- Do not acquire paid icon packs or introduce icon libraries to solve one missing glyph; reuse an available icon or a minimal justified SVG.

## 7. Composition — NO LAYOUT ALGEBRA

**MUST express ordinary UI with normal CSS layout primitives, NOT spreadsheet-like calculations hidden in JSX.**

**PREFER:**
- Flexbox and Grid with `gap`, `minmax()`, `min-w-0`, `max-w-*`, `flex-1`, logical sizing and existing layout helpers.
- Existing shadcn/ui structures for sidebars, tables, menus, dialogs and scroll regions.
- A clear component tree and simple breakpoint/container decisions.

**REJECT:**
- Cascades of calculated item widths, offsets, spacing variables, breakpoint multipliers and manual column formulas for layouts CSS Grid/Flex already solve.
- Repeated `calc()` expressions or JS `window.innerWidth` arithmetic when CSS handles the layout.
- Nested wrappers, absolute positioning and `z-index` escalation used to conceal a flawed structure.
- One-off components for every `<div>`, icon, label or horizontal alignment.
- Verbose, theatrical component names and private JSX helper soup.

A named component MUST represent a meaningful visual/interaction concept, an actual repeated pattern, or a substantial piece that makes its parent easier to read. **DO NOT turn three simple elements into five exported wrappers.**

**PREFER CSS FOR PRESENTATION; USE JAVASCRIPT ONLY WHEN BEHAVIOR REQUIRES IT.**

## 8. Figma and visual fidelity — IMPLEMENT THE ACTUAL DESIGN

When the user supplies a Figma frame, approved mockup, screenshot or design reference:

1. **INSPECT THE EXACT TARGET**, including proportions, typography, spacing, hierarchy, controls, states and layout relationships. Do not implement from memory or substitute a guessed generic shadcn page.
2. **MAP** every conventional control to an existing Mirai/shadcn component; map unusual sections to compositions and justify any new custom component.
3. **MATCH** the approved structural composition and visual priorities, using system tokens as the implementation vocabulary.
4. **RECONCILE** Figma visual intent with real DOM, Base UI behavior, keyboard access and responsive constraints.
5. **VERIFY VISUALLY** against the target when browser/screenshots are available, checking the rendered route rather than static JSX alone.

A screen that uses the right colors but wrong proportions, hierarchy, density, alignment or interaction states is **NOT faithful**. Likewise, a pixel-perfect screenshot achieved through brittle absolute positioning is **NOT a correct implementation**.

The approved Figma asset is a design reference, NOT automatically a working production state machine. Do not infer unshown business behavior from its example text. User can judge design and change it, minimal or substantial, you MUST NOT get into conflict with the user over design intent.

**DO NOT generate or replace images/assets unless the user explicitly requests them.**

## 9. Responsive behavior — DESKTOP FIRST 

The existing visual direction is **desktop-first**, with normal target designs around 1440–1600 px and smaller desktop layouts such as 1366 × 768. **DO NOT substitute a mobile-first visual composition for an approved desktop design.**

- **MUST preserve the main reading/action hierarchy as width and height change.** Use the Design System's current breakpoints and existing layout patterns.
- Choose media queries for viewport-level shell decisions and container queries when a reusable section depends on its own available space.
- For narrow viewports, adapt navigation, tables, multi-panel content and dialogs through meaningful stacking, alternate views or intentional bounded scrolling; **NEVER just shrink everything until unusable**.
- For dense tables, prefer accessible horizontal overflow or an explicit smaller-screen layout rather than truncating essential information silently.
- **MUST account for vertical constraints, browser zoom, long translated strings and user font enlargement**, not only a single desktop screenshot.
- Keep document-like surfaces, editor workspaces and data-heavy panels legible without inventing a second unrelated visual design.
- **NEVER duplicate an entire feature implementation for each breakpoint** when one composed layout with a few meaningful variants is sufficient.

## 10. Component API and state presentation

- **MUST use semantic component variants and props** (`variant`, `size`, `disabled`, slots, controlled/uncontrolled APIs as supported). Avoid duplicating visual variants through copy-pasted class strings.
- Prefer composition for complex panels: a semantic section may combine `Card`, `Badge`, `Separator`, `ScrollArea`, `Button` and feature content without manufacturing a new universal card abstraction.
- Use Tailwind utilities directly for ordinary layout; use a component variant utility **only when multiple real, named variants must be maintained**.
- Match the actual public Base UI/shadcn APIs for popovers, dialog closing, select interaction, event handlers and focus management. **DO NOT suppress their built-in accessibility to simplify styling.**
- **MUST implement real visual states when applicable:** default, hover, focus-visible, active/selected, disabled, loading, empty, error, success and pending.
- Loading feedback MUST reflect the real underlying state; **NEVER** animate a success indicator before the operation is confirmed.
- Use clear primary action hierarchy. Do not fill available space with decorative badges, cards or unrelated calls to action.
- Use the existing application state mechanisms; UI components should render an explicit state rather than invent an independent business-state machine. Implementation details belong to the state skill.

## 11. Accessibility — REQUIRED, NOT OPTIONAL

**MUST target WCAG 2.2 AA for Mirai's own interactive UI.**

- Use real semantic elements: `button`, `a`, headings, labels, tables/lists and dialog roles as appropriate. **NEVER** make a clickable `div` imitate a button when a semantic control exists.
- **MUST preserve keyboard operation:** Tab/Shift+Tab, Enter/Space, Escape, arrow-key interactions, roving focus and trapping/restoration where the selected component requires them.
- **MUST preserve visible `:focus-visible` states** using system focus tokens. Never remove outlines without an equally accessible alternative.
- Give icon-only buttons accessible names; pair inputs with labels, errors with the appropriate field relationship and transient status with suitable announcements.
- Meet required contrast for text and interactive state distinctions; do not encode success/error/selection solely by color.
- Preserve touch target usability, reduced-motion preference, accessible disclosure/overlay behavior and logical tab order.
- **MUST NOT assume shadcn/Base UI guarantees accessibility after heavy customization.** Verify disabled states, portals, nested overlays, scroll locking, screen-reader names and keyboard interaction.

## 12. Motion and interaction polish — CONTROLLED, PURPOSEFUL

- Follow the existing Mirai motion tokens and established transition patterns. **NO new global animation language.**
- Motion MUST clarify cause, continuity, focus or feedback. **NEVER** animate solely to make a component appear impressive.
- Prefer short, unobtrusive transitions; respect `prefers-reduced-motion` and prevent long animation from blocking tasks.
- Avoid shimmer saturation, constant pulsing, cinematic entrance sequences, gratuitous background movement or multiple competing spinners.
- Do not import heavyweight motion libraries for ordinary transitions that CSS and existing primitives already handle.
- **NEVER override Base UI focus, dismissal, portal or keyboard semantics** with a custom motion wrapper.

## 13. Verification — CHECK THE RENDERED INTERFACE

For meaningful UI changes, **MUST review**:
1. **Component reuse:** Was shadcn/ui chosen whenever suitable? Were custom components actually necessary?
2. **Design fidelity:** Does the rendered route match the requested Figma/design reference in composition, hierarchy, density, typography and alignment?
3. **Tokens:** Are semantic colors, spacing, radii, icons, text and status treatments consistent?
4. **Interaction states:** Do controls operate and display appropriate loading, disabled, error, focus, empty and success states?
5. **Responsive layout:** Does the target desktop width work, plus smaller desktop, narrow width, long content and relevant browser zoom?
6. **Accessibility:** Are focus, keyboard, labels, dialogs, menus and status feedback usable?
7. **Code clarity:** Are there unnecessary wrappers, manual layout calculations or duplicate shadcn-like controls?

**MUST validate actual rendering and interaction** with available browser tooling when meaningful. Run affected TypeScript/lint/build checks as required by the main engineering skill. Do not manufacture cosmetic tests or screenshot suites for every small change.

When reporting, briefly identify the major shadcn components reused, any custom component justified, and what was actually visually verified. **NEVER claim a Figma match or browser QA that was not performed.**

## 14. Reject these UI anti-patterns

**NEVER SHIP:**
- A custom generic button, modal, form input, menu, tooltip or sidebar that duplicates a suitable shadcn component.
- Radix UI, another headless primitive kit or a second UI library introduced without explicit approval.
- Raw hardcoded colors/typography/surface styles where Mirai semantic tokens exist.
- Lucide or mixed icon styles introduced by default in product UI instead of the chosen Iconsax family.
- Arbitrary responsive layout math, many one-off pixel widths, or deeply nested wrappers for ordinary CSS layout.
- Twenty tiny private/exported components wrapping tiny JSX fragments.
- Visually accurate but inaccessible interactions, invisible focus or broken keyboard navigation.
- An inaccessible one-line mobile shrink of a multi-panel desktop design.
- A "success" state based only on a button click or optimistic local display.
- A new one-off visual language for a feature that should belong to the same product.

**FINAL RULE: SHADCN/UI FIRST. BASE UI UNDERNEATH. MIRAI DESIGN TOKENS EVERYWHERE. CUSTOM COMPONENTS ONLY WHEN JUSTIFIED. FAITHFUL, ACCESSIBLE, SIMPLE UI — NEVER A PARALLEL DESIGN SYSTEM.**

---

### Primary design sources

- Mirai Design System: `docs/design/mirai_design_system.md`
- Mirai approved UI/UX and frame index: `docs/design/mirai_ui_ux_e2e.md`
- Approved Figma file: https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai
- Current locally owned UI components and styles: `apps/web/src/components/ui/`, `apps/web/src/styles/`

### Official API references — check when implementation details matter

- shadcn/ui components: https://ui.shadcn.com/docs/components
- shadcn/ui Base UI component variants: https://ui.shadcn.com/docs/components/base
- shadcn/ui theming and tokens: https://ui.shadcn.com/docs/theming
- shadcn/ui configuration: https://ui.shadcn.com/docs/components-json
- shadcn/ui Next.js monorepo integration: https://ui.shadcn.com/docs/installation/next
- Base UI composition and accessibility: https://base-ui.com/react/overview/about
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Agent Skills: https://agentskills.io/specification

