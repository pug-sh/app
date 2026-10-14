# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Dashboard frontend for Pug, a product analytics platform built for growth managers. React + Vite + TypeScript. Talks to the backend via ConnectRPC (binary protobuf).

## Commands

```sh
bun run dev        # Start dev server (Vite)
bun run build      # Type-check + production build (tsc -b && vite build)
bun run generate   # Regenerate TypeScript proto types from backend protos
bun run generate:themes # Regenerate built-in theme CSS (from src/theme/presets) + the theme JSON Schema (from src/theme/format.ts)
bun run format     # Biome formatter (format only)
bun run lint       # Biome check: format + lint + import organization (safe fixes)
bun run lint:ci    # Biome check, reporting only, never writes (what CI runs)
bun run test       # Vitest, single run
bun run test:watch # Vitest, watch mode
bun run knip       # Knip: unused files, exports and dependencies (CI gate)
```

## Area Rules

Rules that only matter in one part of the codebase live in `.claude/rules/`, one topic per file. Each file lists the paths it covers in `paths:` frontmatter, and Claude Code loads it the first time it reads or edits a matching file, so it costs nothing elsewhere. They are plain markdown: read the relevant one before changing that area by hand.

| File | Covers |
| --- | --- |
| `.claude/rules/billing.md` | Plan, free allowance, billed usage, checkout (Dodo Payments) |
| `.claude/rules/charts.md` | The vendored bklit charts and the wrappers around them |
| `.claude/rules/theme.md` | Theme engine, colour tokens, dark-mode contrast, series-colour fitting |
| `.claude/rules/typography.md` | Changing or evaluating the UI face |
| `.claude/rules/brand-icons.md` | Browser, OS and device marks |
| `.claude/rules/analytics.md` | Dogfooding through `@pug-sh/browser` |
| `.claude/rules/auth.md` | Sign-in flows and Turnstile |
| `.claude/rules/insights.md` | Per-event aggregations and filter semantics |

Every rule file needs a `paths:` list; one without it loads at launch like this file. A rule that matters before any file in its area is opened, such as what to build or which dependency to reach for, belongs here instead.

## Tests

Vitest + happy-dom + Testing Library, in `src/**/*.test.{ts,tsx}` next to the code they cover. `.github/workflows/ci.yml` runs lint, typecheck/build, and tests on every PR. `tsc -b` type-checks test files too (`tsconfig.app.json` includes all of `src`), so a broken test type fails the build.

This is a young suite covering load-order and state bugs, not a coverage regime. What's worth knowing before adding to it:

- **A regression test must be shown to fail against the unfixed code.** Break the fix, watch it go red, restore. Several of these looked right and passed against the bug; a React-timing test in particular is easy to write so that it can't observe the thing it's named after.
- **Test through the structure that produces the bug.** The default-project race only reproduces when `ProjectRedirect` renders inside a `Switch`: rendered bare it never unmounts and self-corrects, passing either way.
- **The environment has to install its own storage.** Node 25 defines inert `localStorage`/`sessionStorage` globals, and vitest won't overwrite a global that already exists, so happy-dom's real Storage never lands. `src/test/setup.ts` puts it back; don't assume the environment did.
- **Fake the RPC atoms, not the transport** (`vi.mock('@/api/rpc', …)`); a hand-held `batchGet` lets a test decide when a call resolves, which is the only way to land a response into a workspace that has moved on.

## Proto Code Generation

Proto definitions live in `proto/`, a gitignored symlink to the `proto/` directory of your pug backend checkout (recreate with `ln -sfn <backend-checkout>/proto proto`). Generated TypeScript goes to `src/api/genproto/`; these files are tracked in the repo, so commit the regenerated output. After backend proto changes, run `bun run generate` and commit the diff. The `--include-imports` flag is required for dependency types (buf/validate, common/v1).

## Knip

`knip.jsonc`, run in CI after the build, gates on unused files, unused or unlisted dependencies, and exports nothing imports. Its comments explain every ignore, entry and dependency exception; read them before changing the config.

## Architecture

### State Management: Jotai atoms for shared state

All *shared* state is Jotai atoms. No React Context for app state, no Redux. Pattern:

- **RPC clients** are atoms: `atom(get => createClient(Service, get(transportAtom)))` in `src/api/rpc.ts`
- **Async operations** use write atoms: `atom(null, async (get, set) => { ... })`
- **Persistent state** uses `atomWithStorage` (JWT token, theme preference)

State only one page reads is not shared state and stays in `useState` (see Page Decomposition below).

### ConnectRPC Transport

`src/network/transport.ts`: a single transport with two interceptors:

1. **authBearer** reads the JWT from localStorage and sets the Authorization header on every request. No per-call `{ headers }` needed for auth.
2. **protovalidate** validates outgoing messages against proto buf.validate constraints before sending.

For project-scoped endpoints (insights, dashboards, events, profiles), pass `{ headers }` from `projectHeaderAtom`, which only contains `x-project-id`. Auth is automatic.

### Backend Auth Model

- JWT `sub` claim = customerID (not email)
- Org + project auto-created on signup
- Dashboard endpoints need the JWT (handled by the interceptor); project-scoped endpoints need the JWT + `x-project-id`
- SDK endpoints (devices, events, profiles) use API key auth and are not called from this frontend
- Sign-in flows (magic link, OIDC, SSO connections) and Turnstile: `.claude/rules/auth.md`

### File-Based Routing

Pages live in `src/pages/routegen/<name>/index.page.tsx`. Vite's `import.meta.glob` auto-discovers them at build time. No manual route registration.

- `routegen/dashboards/index.page.tsx` → `/dashboards`
- `routegen/dashboards/[dashboardId]/index.page.tsx` → `/dashboards/:dashboardId` (dynamic segments)
- Co-located files (atoms, helpers) next to `index.page.tsx` are not routed

Feature-local modules should stay with the owning feature:

- `src/pages/routegen/<feature>/` for page-specific helpers/constants/components
- `src/components/event-filters/` for event-filter-specific logic and models
- `src/lib/` only for code genuinely shared across multiple features

Do not move feature-specific helpers into `src/lib/` just because they are "pure TS".

The sign-in pages live outside `routegen/` since they're unauthenticated.

### Page Decomposition

When a page file (`index.page.tsx`) grows too large, decompose it by extracting **components** and **pure helper modules**, not by wrapping every cluster of state in a custom hook. Keep the page's own `useState`/`useMemo`/`useCallback` inline. The Insights page is the reference: its state stays inline in `index.page.tsx`, with `content.tsx` (component), `controls.tsx` (components), `helpers.ts` (pure fns) and `constants.ts` split out, and no page-local state hooks.

- **Components**: presentational chunks (`dashboard-header.tsx`, `dashboard-canvas.tsx`, `resume-banner.tsx`). Co-locate them next to `index.page.tsx`. A component may take the whole hook return as a prop, typed `ReturnType<typeof useThatHook>`, to avoid re-listing two dozen props.
- **Pure helpers**: deterministic functions and constants (`controls-helpers.ts`, `draft-state.ts`). No React.

Custom hooks (`use-*.ts`) are reserved for **reusable behavior**, not per-page state:

- Cross-feature behavior lives in `src/hooks/` (`use-mobile`, `use-relative-time`, `use-debounced-query`, `use-event-filters`).
- A feature-local hook is justified only for a genuinely cohesive, self-contained unit: a keyboard-shortcut binder (`use-editor-shortcuts.ts`) or a complex state machine (`use-dashboard-editor.ts`: edit mode, draft persistence, tile mutations). Do not split a single page into several thin state hooks (`use-page-data`, `use-page-controls`, `use-page-delete`); fold that state back into the page.

### UI Components: shadcn/ui (default style)

Standard shadcn/ui with default Base UI primitives. Uses `render` prop for composition (not `asChild`):

```tsx
<SidebarMenuButton render={<Link href="/overview" />}>
```

Update components with `bunx shadcn@latest add <component> --overwrite`, then follow "After any `shadcn add`" below.

### Charts: vendored, never edit

Every chart (trends area, line and bar, plus the funnel) renders through the `@bklit` shadcn registry, vendored in `src/components/charts/` and pulled with `bunx shadcn@latest add @bklit/<component> --overwrite`. Keeping it identical to upstream is what makes an upgrade a re-run of that command instead of a manual merge.

- **Never edit anything under `src/components/charts/`, or `src/components/shimmering-text.tsx`**, which the registry drops outside the directory. A local fix there is silently overwritten by the next add. Customize by wrapping: the wrappers live in `src/pages/routegen/insights/charts/`, and `.claude/rules/charts.md` has the three ways to solve something that looks like it needs a vendored edit.
- **recharts and `components/ui/chart.tsx` are gone; don't reintroduce either.**
- **There is no log scale or zero-baseline option.** The vendored shell hardcodes `scaleLinear` (`y-domain-utils.ts`, `time-series-chart-shell.tsx`) and tweens the y-domain itself. `VisualizationOptions.logScale` / `zeroBaseline` still exist on the proto and may sit `true` on old tiles; they are ignored. Don't re-add the checkboxes without first solving a non-linear scale in the wrapper (a data-space transform plus a matching y-tick formatter); zero-baseline needs nothing, since the domain already pins `[0, max]` for non-negative data.
- Series colours come from `getSeriesColor()` and are passed in, never hardcoded upstream.

### After any `shadcn add`

`src/components/charts/` and `src/components/ui/` are registry-managed. After an add, `git diff` the whole tree, not just the component's directory. `git diff src/components/charts/` should be empty; anything else there is either collateral to revert or a real upstream change to read. These always need a manual revert:

- `src/index.css` gets re-broken the same two ways every time: three `--chart-line-primary: var(----chart-line-primary)` mappings with a doubled prefix that silently kill every utility built on them, and a `.dark` block re-pinning `--chart-background`/`--chart-grid`/`--chart-label` to bklit's own darks (dead CSS, since the generated `:root.dark` block outranks a bare `.dark`). Both hunks are pure regressions; revert the file.
- `src/lib/utils.ts` gets rewritten. `bun run lint` repairs the quote style, but `cn` turning from an arrow into a `function` declaration needs reverting by hand.
- The add also rewrites files its registry entry never lists (`composed-chart` rewrote `line-chart.tsx`) and adds dependencies (`@visx/pattern`). Check `package.json` too.

### Design Aesthetic

Light and minimal. This is a deliberate design direction; do not add visual or interaction weight:

- **No Cards**: use section divider headers (below) instead of wrapping content in Card components
- **No nested menus**: no DropdownMenuSub, no multi-level popover trees. Use flat inline interactions: expand/collapse in place, inline inputs, single-level dropdowns at most
- **No modals for simple actions**: inline editing, inline create forms, confirmation via button state (not confirm dialogs)
- **No external CDN dependencies** for UI assets: bundle or self-host everything. Turnstile's `api.js` is the one exception (`.claude/rules/auth.md`). Brand marks (browser, OS, device) are self-hosted under `public/brands/`; don't add an icon package for them
- **12px is the type floor.** `text-xs` is the smallest size in the UI; there is no `text-[11px]`, `text-[10px]` or `text-[9px]`. It matches the vendored charts, which label axes at `text-xs`. Micro-labels get their emphasis from `uppercase tracking-wider text-muted-foreground`, not from shrinking.
- **Corners stay soft**: `--radius: 0.625rem`, ramp at 8/10/12/16px. Tightening them was tried and reverted. If you do retune them, the `--radius-sm/md/lg/xl` ramp is hardcoded, not derived from `--radius` (see the comment in `index.css`), so changing `--radius` alone will look like it did nothing.
- **Elevation has to be painted, not implied.** Shadows are invisible on a dark ground, so anything that is conceptually a tile uses `bg-card`, not `bg-background` with a border.

Section divider header pattern:

```tsx
<div className='flex items-center gap-2 mb-2'>
  <span className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>Section Title</span>
  <div className='flex-1 h-px bg-border' />
  <span className='text-xs text-muted-foreground'>count</span>
</div>
```

Tables use plain `<table>` elements (not the Table component), with:

- Headers: `text-xs font-medium text-muted-foreground uppercase tracking-wider`
- Rows: `border-b border-border/50 transition-colors hover:bg-muted/40`
- Destructive/edit actions hidden until row hover (`opacity-0 group-hover:opacity-100`)

Empty states are minimal: a faded icon (`opacity-15`) and one or two lines of text. No illustrations, no big CTAs, no onboarding wizards.

Event kinds use a coloured `Badge` with `getSeriesColor()` from `src/lib/event-colors.ts` (consistent palette across pages). IDs and codes use `font-mono`. Times use the 24-hour clock, with `HoverSwap` to toggle between relative and absolute. Links use `text-link hover:underline underline-offset-4`.

### Typography

UI sans is **Figtree** (`@fontsource-variable/figtree`, `wght` 300–900), mono is **Geist Mono** (`@fontsource-variable/geist-mono`). Both are npm packages imported at the top of `src/index.css` and bundled; nothing comes from a CDN or `public/`.

- **Two weights. Every heading and every display size is 400; `font-medium` (500) marks a label or a control**: table headers, buttons, section captions, chips. Size, ink tier and tracking make something a heading. `font-semibold`/`font-bold` are unused in app code.
- **It is enforced in `@layer base`, not per call site.** `h1/h2/h3`, `.text-xl/2xl/3xl/4xl/5xl` and `.markdown-body :is(h1,h2,h3)` all set `font-weight: 400`, and `<strong>`/`<b>` are pinned to 500 (snarkdown turns `**x**` into `<strong>` in markdown tiles). **Utilities beat `@layer base`**, so a weight class on a heading or a display size silently opts out. Two greps should stay empty: `grep -E 'text-(xl|2xl|3xl|4xl|5xl)' src --include=*.tsx | grep font-` and the same over `<h1|h2|h3` lines.
- **Don't pin `--font-weight-medium` back to 400.** It was tried and undone: table headers and section captions lose their only difference from body text.
- **Large type is tracked in, but only just**: `h1/h2/h3` at `-0.014em`, `.text-3xl/4xl/5xl` at `-0.018em`, both in `@layer base`. A call-site `tracking-tight` still wins.
- **`tabular-nums` is load-bearing.** Figtree's digits otherwise span a 1.55× width range; keep it on numeric columns and live-updating values or they reflow as they tick.
- Changing the face touches more than `index.css`: see `.claude/rules/typography.md`.

### Colour

Colours are data: every token value lives in a theme preset (`src/theme/presets/`), generated into CSS by `bun run generate:themes`. `.claude/rules/theme.md` has the engine, the contrast model and the fitting bands. These rules apply everywhere:

- **Coloured text is decoupled from fills.** `text-link` is the blue used as text (links, primary-tinted icons), and `--positive`/`--caution`/`--negative` are the semantic text tier. `bg-primary` and `bg-destructive` are fills tuned to carry white text. Never point links at `text-primary`, never use `text-destructive` for text, and never lighten a fill to fix coloured text.
- **Event and series colours come from `getSeriesColor(name, fallbackIndex)`** (`src/lib/event-colors.ts`, a lookup over `src/theme/data-palette.ts`): name-based and deterministic, with related events grouped under one hue. Never index-based, never hardcoded. An event keeps one colour everywhere it appears: event row markers (A/B/C), selected event chips, dropdown dots, summary stat dots, chart series and tooltip indicators. Retention heatmap cells stay value-intensity based, but cohort label markers use the series colour.
- **Breakdowns are the exception: splits by a dimension (`$os`, `$utmSource`, …) are coloured by index with `getIndexedColor(i)`**, in trends, funnel and top-K alike. A breakdown value carries no semantic identity, and name-based colouring fails it two ways: an `event · value` series label inherits the event's hue, and bare values hash-collide in the 12-colour fallback (`github` / `newsletter` / `twitter`).
- **Anything that caches a colour keys on `themeRevisionAtom`**, never `resolvedThemeAtom`, which two dark themes share. Inline `getSeriesColor()` calls re-colour for free; a component that memoizes a derived palette must list `themeRevisionAtom` in its deps (see `seriesColors` in `insights/index.page.tsx` and `dashboards/insight-tile-view.tsx`).
- **A data surface painted with alpha uses the data band (`--chart-1`), not `--primary`**, which stays deep in dark to carry white button text.

### Emoji: Twemoji only

All emoji shown in the UI must use [Twemoji](https://github.com/twitter/twemoji) (currently v14.0.2), self-hosted under `public/twemoji/`. Do not render native Unicode emoji in JSX and do not load Twemoji from a CDN.

- **Tile icons:** `TwemojiIcon` (`src/components/twemoji-icon.tsx`); the editable palette is `TILE_ICON_EMOJIS` in `src/lib/twemoji.ts` (wrapped with a "no icon" entry in `src/pages/routegen/dashboards/tile-icons.ts`), SVGs in `public/twemoji/`
- **Country flags:** `CountryFlag` / `LocationLabel` (`src/components/country-flag.tsx`), SVGs in `public/twemoji/flags/`, resolved via `twemojiFlagSrc()` in `src/lib/twemoji.ts`
- **Adding emoji:** download the SVG from the Twemoji repo and name it after the emoji's lowercase, hyphen-joined Unicode codepoint(s), matching `twemoji.convert.toCodePoint` (e.g. `1f4c8.svg` for a tile or `1f1ee-1f1f3.svg` for a flag); place it in `public/twemoji/` (or `public/twemoji/flags/` for ISO flags), add the character to `TILE_ICON_EMOJIS` in `src/lib/twemoji.ts`, and render through the shared components. A mis-named file 404s silently, since the `<img>` is `aria-hidden`.

Filter operator symbols (`=`, `≠`, `✓`, etc.) are typography, not Twemoji; leave those as plain text unless explicitly moving them to the emoji system.

### Insights Granularity & Time Range

The backend enforces a max time-range span per granularity (buf.validate CEL constraints on `QueryRequest` in `proto/shared/insights/v1/insights.proto`), e.g. `GRANULARITY_HOUR requires a time range of at most 14 days`. The frontend must keep granularity and time range compatible so these never reach the server.

- Single source of truth: `src/lib/granularity.ts` (mirrors the proto caps; keep them in sync). The cap map is total over `Granularity`, so a new enum member without a cap is a compile error.
- Any page with both a time-range picker and a granularity picker must use these helpers; do not re-derive or duplicate the ladder per page:
  - `granularityDisabledReason(granularity, range)` → pass as `OptionChip`'s `isOptionDisabled` so over-cap granularities render disabled with a tooltip.
  - `clampRange(range)` and `clampGranularity(granularity, range)` → call both from the time-range `onChange`: `clampRange` caps a range too wide for *any* granularity to the supported max, then `clampGranularity` keeps a still-valid pick as-is, leaves `UNSPECIFIED` ("Auto") untouched, and bumps a now-disabled pick to the **smallest/finest** granularity that still fits.
  - `autoGranularity(range)` → resolve `UNSPECIFIED` ("Auto") to a concrete value at the consumption point (including before passing a granularity down to dashboard tiles). This is the only place the auto ladder lives. Note: `autoGranularity` (coarser-biased default) and `clampGranularity` (finest-that-still-fits) deliberately use **different** ladders, so they can return different granularities for the same range.
- Behavior must be identical across Insights, Overview, and Dashboard (the three current consumers): same disabled options, same clamp-to-finest-valid on range change, same `autoGranularity` resolution of "Auto".

### Form Validation

Forms use Zod schemas (via `zodResolver` from `@hookform/resolvers/zod`) for client-side validation. Define constraints (required fields, string lengths, formats) in the Zod schema so errors surface immediately in the UI before any RPC call. The protovalidate interceptor still runs as a safety net but is not the primary validation layer for forms.

### Dogfooding

The dashboard reports its own usage into Pug through `@pug-sh/browser` (`src/analytics/`; the rest is in `.claude/rules/analytics.md`). These rules apply anywhere in the app:

- **`data-pug-no-capture` on `<main>` (`App.tsx`) is load-bearing; don't remove it.** Click and dead-click autocapture send the clicked element's `innerText`, and everything under `<main>` is customer data. The marker resolves via `closest()`, so one boundary covers every page mounted there. **A data surface rendered outside `<main>` needs its own marker** (`shared-dashboard.tsx` has one). Structural fields (`tag`/`id`/`class`/coords) are still sent, so keep PII out of `id`/`class` too.
- **An event property is a category (`scope: Private`, `insightType: trends`), a count, or one of our own resource IDs (`apiKeyId`, `dashboardId`)**: never a secret, customer PII, free customer text or a copied value.
- **Track features with `trackFeature(featureId, featureName)`, on the atom rather than the button**, so every entry point counts. The calls are required: the `<main>` marker blanks button labels, and icon-only buttons autocapture as `tag: svg` with empty text.
- **Keep the page `<title>` static.** `$pageTitle` is not sanitized, so a per-page title carrying customer data would leak.

### TypeScript Style

Prefer implicit types; don't annotate what TypeScript can infer:

- **No return types on functions** unless the inferred type would be wrong or the function is exported from a shared library with a complex return shape
- **No explicit variable types** when the RHS makes it obvious (`const x = 'hello'` not `const x: string = 'hello'`)
- **No redundant generics** on `useState`/`useRef` when the initial value already has the right type (`useState(false)` not `useState<boolean>(false)`)
- **Keep generics** when removal would change the type: `useState<T[]>([])` (infers `never[]` without it), `useState<T | null>(null)` (infers `null`), `atom<T[]>([])`, `useRef<HTMLElement>(null)`
- Prefer `if`/`else` or small helpers over ternary operators that span multiple lines
- When a file still needs to coordinate several concerns, separate major sections with blank lines and short section comments instead of letting logic blur together

### Biome

Config in `biome.json`: 2-space indent, no semis, single quotes, 120 char width, trailing commas, and import organization enabled. `src/components/charts/` and `src/components/shimmering-text.tsx` are excluded (`files.includes`), so the registry's double quotes and semicolons there are expected.
