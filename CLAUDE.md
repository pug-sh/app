# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Dashboard frontend for Pug — an analytics + communication platform (similar to CleverTap). Built for growth managers. React + Vite + TypeScript. Talks to the backend via ConnectRPC (binary protobuf).

## Commands

```sh
bun run dev        # Start dev server (Vite)
bun run build      # Type-check + production build (tsc -b && vite build)
bun run generate   # Regenerate TypeScript proto types from backend protos
bun run format     # Biome formatter (format only)
bun run lint       # Biome check — format + lint + import organization (safe fixes)
bun run lint:ci    # Biome check, reporting only — never writes (what CI runs)
bun run test       # Vitest, single run
bun run test:watch # Vitest, watch mode
```

## Tests

Vitest + happy-dom + Testing Library, in `src/**/*.test.{ts,tsx}` next to the code they cover. `.github/workflows/ci.yml` runs lint, typecheck/build, and tests on every PR. `tsc -b` type-checks test files too (`tsconfig.app.json` includes all of `src`), so a broken test type fails the build.

This is a young suite covering load-order and state bugs, not a coverage regime. What's worth knowing before adding to it:

- **A regression test must be shown to fail against the unfixed code.** Break the fix, watch it go red, restore. Several of these looked right and passed against the bug — a React-timing test in particular is easy to write so that it can't observe the thing it's named after.
- **Test through the structure that produces the bug.** The default-project race only reproduces when `ProjectRedirect` renders inside a `Switch` — rendered bare it never unmounts and self-corrects, passing either way.
- **The environment has to install its own storage.** Node 25 defines inert `localStorage`/`sessionStorage` globals, and vitest won't overwrite a global that already exists, so happy-dom's real Storage never lands. `src/test/setup.ts` puts it back — don't assume the environment did.
- **Fake the RPC atoms, not the transport** (`vi.mock('@/api/rpc', …)`); a hand-held `batchGet` lets a test decide when a call resolves, which is the only way to land a response into a workspace that has moved on.

## Proto Code Generation

Proto definitions live in `proto/` — a gitignored symlink to the pug backend checkout at `$GOPATH/src/github.com/pug-sh/pug/proto` (recreate with `ln -sfn "$(go env GOPATH)/src/github.com/pug-sh/pug/proto" proto`). Generated TypeScript goes to `src/api/genproto/` — these files are tracked in the repo, so commit the regenerated output. After backend proto changes, run `bun run generate` and commit the diff. The `--include-imports` flag is required for dependency types (buf/validate, common/v1).

## Architecture

### State Management — Jotai atoms everywhere

All state is Jotai atoms. No React Context, no Redux. Pattern:

- **RPC clients** are atoms: `atom(get => createClient(Service, get(transportAtom)))` in `src/api/rpc.ts`
- **Async operations** use write atoms: `atom(null, async (get, set) => { ... })`
- **Persistent state** uses `atomWithStorage` (JWT token, theme preference)

### ConnectRPC Transport

`src/network/transport.ts` — single transport with two interceptors:

1. **authBearer** — reads JWT from localStorage, sets Authorization header on every request. No per-call `{ headers }` needed for auth.
2. **protovalidate** — validates outgoing messages against proto buf.validate constraints before sending.

For project-scoped endpoints (campaigns, insights), pass `{ headers }` from `projectHeaderAtom` which only contains `x-project-id`. Auth is automatic.

### File-Based Routing

Pages live in `src/pages/routegen/<name>/index.page.tsx`. Vite's `import.meta.glob` auto-discovers them at build time. No manual route registration.

- `routegen/campaigns/index.page.tsx` → `/campaigns`
- `routegen/campaigns/[id]/index.page.tsx` → `/campaigns/:id` (dynamic segments)
- Co-located files (atoms, helpers) next to `index.page.tsx` are not routed

Feature-local modules should stay with the owning feature:

- `src/pages/routegen/<feature>/` for page-specific helpers/constants/components
- `src/components/event-filters/` for event-filter-specific logic and models
- `src/lib/` only for code genuinely shared across multiple features

Do not move feature-specific helpers into `src/lib/` just because they are "pure TS".

Sign-in page is outside `routegen/` since it's unauthenticated.

### Page Decomposition

When a page file (`index.page.tsx`) grows too large, decompose it by extracting **components** and **pure helper modules** — not by wrapping every cluster of state in a custom hook. Keep the page's own `useState`/`useMemo`/`useCallback` inline. The Insights page is the reference: ~430 lines with ~30 inline hooks, split into `content.tsx` (component), `controls.tsx` (components), `helpers.ts` (pure fns), `constants.ts` — and zero custom state hooks.

- **Components** — presentational chunks (`dashboard-header.tsx`, `dashboard-canvas.tsx`, `resume-banner.tsx`). Co-locate them next to `index.page.tsx`. A component may take the whole hook return as a prop, typed `ReturnType<typeof useThatHook>`, to avoid re-listing two dozen props.
- **Pure helpers** — deterministic functions and constants (`controls-helpers.ts`, `draft-state.ts`). No React.

Custom hooks (`use-*.ts`) are reserved for **reusable behavior**, not per-page state:

- Cross-feature behavior lives in `src/hooks/` (`use-mobile`, `use-relative-time`, `use-debounced-query`, `use-event-filters`).
- A feature-local hook is justified only for a genuinely cohesive, self-contained unit — a keyboard-shortcut binder (`use-editor-shortcuts.ts`) or a complex state machine (`use-dashboard-editor.ts`: edit mode, draft persistence, tile mutations). Do not split a single page into several thin state hooks (`use-page-data`, `use-page-controls`, `use-page-delete`) — fold that state back into the page.

### UI Components — shadcn/ui (default style)

Standard shadcn/ui with default Base UI primitives. Uses `render` prop for composition (not `asChild`):

```tsx
<SidebarMenuButton render={<Link href="/overview" />}>
```

Update components: `bunx shadcn@latest add <component> --overwrite`

### Charts — vendored, never edit

`src/components/charts/` is third-party code vendored from the `@bklit` shadcn registry (declared in `components.json`), pulled with `bunx shadcn@latest add @bklit/<component> --overwrite`. Keeping it identical to upstream is what makes an upgrade a re-run of that command instead of a manual merge.

Every chart renders through it — trends area, line and bar (`insights/charts/{area,line,bar}-chart.tsx`) plus the funnel (`insights/charts/funnel-chart.tsx`). **recharts is gone**, and with it `components/ui/chart.tsx`; don't reintroduce either. The vendored funnel draws exactly one funnel, so a breakdown renders as small multiples (one taper per split) rather than grouped series — that shape difference is the reason the wrapper, not the chart, owns the layout.

- **Never edit anything under `src/components/charts/` — or `src/components/shimmering-text.tsx`.** The registry drops that one dependency outside the directory, so the vendored zone is the directory *plus* that file. A local fix there is silently overwritten by the next re-add, and any drift turns an upgrade into a manual three-way merge. The directory currently matches upstream byte for byte; `git diff src/components/charts/` after an add should be empty, and anything else is either collateral to revert or a real upstream change to read.
- **Customize by wrapping.** Build a wrapper next to the feature that owns it and compose the vendored chart through props / `className`. Series colors come from `getSeriesColor()` (see Insights Color System) and are passed in — never hardcoded upstream. `useVendoredChartPrep` (`insights/charts/common.ts`) holds the prep all three wrappers share: keyed rows, tooltip rows, and the date formatter.
- Both paths are excluded from Biome (`biome.json` → `files.includes`) so the formatter can't rewrite them either. The registry's style (double quotes, semicolons) is expected there and is not a violation. `shimmering-text.tsx` is the trap — it sits in our namespace but is not ours.
- **Prefer a vendored component over a local one, and re-check on every add.** The registry gained a `YAxis` after we had hand-rolled one, and adopting it deleted our file along with its whole failure mode — ours drew SVG `<text>` at negative x and depended on `displayName` surviving minification to stay outside the series reveal clip, while upstream portals HTML and sidesteps that entirely. It also tweens tick position with the y-domain. Pass `formatValue`, not upstream's `formatLargeNumbers`: that does `(v/1000).toFixed(0)`, so 1500 renders `2k` and 1.2M renders `1200k`. The wrappers pass `yTickFormatter ?? compactNumber`.

**There are no patches. Keep it that way.** There used to be two, and every `add` reverted them — silently, in the case of the date labels. Both are now solved from outside the vendored zone, so re-running an add is safe. If you hit something that looks like it needs a vendored edit, these are the two shapes of answer that worked:

1. **A broken import path → satisfy the path instead of changing it.** `chart-loading-label.tsx` ships `import … from "../components/shimmering-text"`, valid only in the registry author's `src/charts/` layout; at our target (`components/charts/`) it resolves to `components/components/`. Rather than rewrite the import, `src/components/components/shimmering-text.ts` re-exports the real module. Ugly path, but it is upstream's expectation and it never needs reapplying.
2. **Missing behaviour → re-provide the chart context.** Upstream computes x labels internally with `shortDateFmt` (`Intl.DateTimeFormat("en-US", …)`) — browser-local and granularity-blind — and exposes no prop. But the labels reach both consumers (axis and tooltip) through `dateLabels` on the chart context, and `ChartStableContext` is exported, so `insights/charts/date-labels.tsx` wraps `XAxis` and `ChartTooltip` in a provider that overrides that one field. Bucket labels must render in the project's reporting zone to match the server's bucket boundaries, and vary by granularity or every hour bucket reads `Jul 19`.

Two things make the override work, and both are easy to break:

- The wrappers must keep `displayName = 'XAxis'` / `'ChartTooltip'`. The shell sorts children into layers by component name, and `XAxis` is in its clip-excluded set — an unrecognised name puts the labels inside the series reveal clip. Set it explicitly; minification mangles the function name.
- Don't reach for `CHART_CLIP_PASSTHROUGH` to inject a provider. It looks like the right seam, but the shell renders the *unwrapped* child, so the wrapper is dropped.

`insights/charts/vendored-date-labels.test.tsx` covers all three charts and is the guard — it stubs `@visx/responsive` because happy-dom reports the container as 0×0, and without a size the chart renders nothing and every assertion passes vacuously.

**Collateral still needs a manual revert after any add** — this part is not solved. `git diff` the whole tree, not just the component's directory:

- `src/index.css` gets re-broken the same two ways every time: three `--chart-line-primary: var(----chart-line-primary)` mappings with a doubled prefix that silently kill every utility built on them, and a `.dark` block re-pinning `--chart-background`/`--chart-grid`/`--chart-label` to the registry's own darks. Those are deliberately aliased in `:root` so they track the theme; the registry's values were authored against a much darker canvas and leave the grid darker than the surface it's drawn on. Both hunks are pure regressions — revert the file.
- `src/lib/utils.ts` gets rewritten (quote style, and `cn` from an arrow to a `function` declaration). `bun run lint` repairs the formatting; the arrow needs reverting by hand.
- The add also rewrites files its registry entry never lists — `composed-chart` rewrote `line-chart.tsx` — and adds dependencies (`@visx/pattern`). Check `package.json` too.

### Design Aesthetic

Light and minimal. This is a deliberate design direction — do not add visual or interaction weight:

- **No Cards** — use section divider headers (see below) instead of wrapping content in Card components
- **No nested menus** — no DropdownMenuSub, no multi-level popover trees. Use flat inline interactions: expand/collapse in-place, inline inputs, single-level dropdowns at most
- **No modals for simple actions** — inline editing, inline create forms, confirmation via button state (not confirm dialogs)
- **No external CDN dependencies** for UI assets — bundle or self-host everything

### Emoji — Twemoji only

All emoji shown in the UI must use [Twemoji](https://github.com/twitter/twemoji) (currently v14.0.2), self-hosted under `public/twemoji/`. Do not render native Unicode emoji in JSX and do not load Twemoji from a CDN.

- **Tile icons:** `TwemojiIcon` (`src/components/twemoji-icon.tsx`); the editable palette is `TILE_ICON_EMOJIS` in `src/lib/twemoji.ts` (wrapped with a "no icon" entry in `src/pages/routegen/dashboards/tile-icons.ts`), SVGs in `public/twemoji/`
- **Country flags:** `CountryFlag` / `LocationLabel` (`src/components/country-flag.tsx`), SVGs in `public/twemoji/flags/`, resolved via `twemojiFlagSrc()` in `src/lib/twemoji.ts`
- **Adding emoji:** download the SVG from the Twemoji repo and name it after the emoji's lowercase, hyphen-joined Unicode codepoint(s) — matching `twemoji.convert.toCodePoint` — e.g. `1f4c8.svg` for a tile or `1f1ee-1f1f3.svg` for a flag; place it in `public/twemoji/` (or `public/twemoji/flags/` for ISO flags), add the character to `TILE_ICON_EMOJIS` in `src/lib/twemoji.ts`, and render through the shared components. A mis-named file 404s silently, since the `<img>` is `aria-hidden`.

Filter operator symbols (`=`, `≠`, `✓`, etc.) are typography, not Twemoji — leave those as plain text unless explicitly moving them to the emoji system.

### Platform icons — Devicon

Browser, OS, and device labels on profiles and events use colored `-original` SVGs from [Devicon](https://github.com/devicons/devicon) (npm `devicon`).

- **Assets:** `src/lib/devicon-assets.ts` — Vite `?url` imports from `devicon/icons/` for most platforms. Edge, iOS, and macOS use self-hosted SVGs in `public/devicon/` (not in devicon)
- **Mapping:** `src/lib/devicon-map.ts` — string heuristics for `$browser`, `$os`, `$device` auto-properties
- **Components:** `Devicon` (`src/components/devicon.tsx`), `BrowserLabel` / `OsLabel` / `DeviceLabel` / `PlatformLabel` (`src/components/platform-label.tsx`)
- **No CDN** — SVGs are bundled from `node_modules/devicon/icons/`

Section divider header pattern:

```tsx
<div className='flex items-center gap-2 mb-2'>
  <span className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>Section Title</span>
  <div className='flex-1 h-px bg-border' />
  <span className='text-[10px] text-muted-foreground'>count</span>
</div>
```

Tables use plain `<table>` elements (not the Table component), with:

- Headers: `text-[11px] font-medium text-muted-foreground uppercase tracking-wider`
- Rows: `border-b border-border/50 transition-colors hover:bg-muted/40`
- Destructive/edit actions hidden until row hover (`opacity-0 group-hover:opacity-100`)

Empty states are minimal — a faded icon + one or two lines of text. No illustrations, no big CTAs, no onboarding wizards.

Event kinds use colored `Badge` with `getSeriesColor()` from `src/lib/event-colors.ts` (consistent palette across pages). IDs and codes use `font-mono`. Times use 24-hour clock, with `HoverSwap` to toggle between relative and absolute. Links use `text-primary hover:underline underline-offset-4`.

### Insights Color System

For Insights (event filters + charts), do **not** use index-based colors or `kindStyle()` colors.

- Single source of truth: `src/lib/event-colors.ts`
- Use `getSeriesColor(name, fallbackIndex)` to resolve colors
- Color assignment is name-based and deterministic — events in the semantic map get their assigned color, unmapped events get a stable hash-based fallback. Related events are manually grouped under the same hue.
- **Breakdowns are the exception:** splits by a dimension (`$os`, `$utmSource`, …) are colored **by index** via `getIndexedColor(i)`, not by value name — applies to trends, funnel, and top-K series. Breakdown values carry no semantic identity, and name-based coloring fails them two ways: an `event · value` series label inherits the event's family hue (every `page_view`-by-`$os` split came out blue), and bare values hash-collide in the 12-color fallback (e.g. `github` / `newsletter` / `twitter`). Index assignment guarantees distinct, in-order palette hues.
- Keep colors consistent across:
  - event row markers (A/B/C)
  - selected event chips
  - event dropdown dots
  - summary stat dots
  - line/area/bar/funnel series
  - chart tooltip indicators
- Retention cohort:
  - Heatmap cell colors stay value-intensity based
  - Cohort label markers should still use the shared series/family color mapping
- Theme adaptation: the base hexes are mid-tones that don't all read against either canvas (darkest vanish on dark, palest vanish on white), so `getSeriesColor` adapts them on the fly per theme — lift toward light on dark (`L' = 0.62 + 0.30·L`, chroma capped at `0.16`), cap lightness *and* chroma on light (`L' = min(L, 0.52)`, `C' = min(C, 0.14)` — pale hues darken to the 0.52 ceiling, the most vivid hues desaturate to the 0.14 ceiling so they don't shout against the near-grayscale UI, hues already under both caps pass through unchanged; the light chroma cap sits below the dark `0.16` because mid-lightness colors on white read as more saturated than lifted pastels on dark); hue is preserved (so semantic families and the failure-red / success-green crossovers stay meaningful). Tune the bands in `event-colors.ts` (`toDarkHex` / `toLightHex`); do **not** add per-mode hexes. JS-driven because these are inline styles / SVG fills, not CSS vars: `resolvedThemeAtom` (`src/data/theme.atoms.ts`) is pushed via `setSeriesColorScheme` from `App.tsx`'s render, so badges + charts re-color on theme toggle. Inline `getSeriesColor()` calls re-color for free, but any component that **memoizes** a derived palette (`useMemo`) must also read `resolvedThemeAtom` and list it in the memo deps — otherwise the cached colors go stale on toggle (the module mutation can't invalidate a `useMemo`). See `seriesColors` in `insights/index.page.tsx` and `dashboards/insight-tile-view.tsx`.

### Dark Mode Contrast

Color tokens live in `src/index.css` (`:root` = light, `.dark` = dark). When auditing dark mode, baseline against light mode (which is tuned and trusted) and fix only what diverged — e.g. the faint hairline borders read identically in both modes and are intentional ("borders barely there"), not a contrast bug.

- Dark `--primary` (`0.54/0.16`) and `--destructive` (`0.54/0.18`) are deep + saturated so **white button text clears AA**, matching the light-mode CTA character (`white` on the fill ≈ 4.6:1). Dark `--foreground` (`0.91`, body ≈ 12:1) and `--muted-foreground` (`0.76`, ≈ 7:1) are lifted for low-brightness legibility — muted is used heavily, so it carries extra headroom.
- **A filled button and colored body text pull lightness in opposite directions** — the fill wants to stay dark (white text on it), colored text wants to be light (to read on the dark canvas); no single token satisfies both at AA. So **colored text is decoupled from the fill:** `--link` (`0.70/0.16`, ≈ 5.5:1) is the blue used *as text* (links, primary-tinted icons) via the `text-link` utility, while `--primary` stays the dark **fill** (`bg-primary`). Do **not** point links at `text-primary` or lighten `--primary` to fix them — use `text-link`; lightening `--primary` re-breaks the buttons.
- Still deferred — **deliberate, not a bug:** `text-destructive` *text* (~2.8:1) on the dark canvas is sub-AA (the same fill-vs-text conflict). The fix is the same pattern (a `--destructive`-text token mirroring `--link`); not yet done because error text is rare. Don't lighten `--destructive` itself.

### Insights Aggregations

Trends event rows support per-event aggregation selection:

- `Total events`
- `Unique users`
- `Avg per user`
- `Sum`
- `Average`
- `Min`
- `Max`

Rules:

- Aggregation is event-row scoped, not global.
- `Sum` / `Average` / `Min` / `Max` require an `aggregationProperty`.
- The aggregation-property picker must only show numeric properties (`INTEGER` / `FLOAT` from schema `valueType`).
- For non-numeric aggregations, clear/ignore `aggregationProperty`.
- Funnel and retention ignore per-event aggregation and should continue using total counts.
- Summary stats should adapt to aggregation type instead of always presenting totals.

### Insights Granularity & Time Range

The backend enforces a max time-range span per granularity (buf.validate CEL constraints on `QueryRequest` in `proto/shared/insights/v1/insights.proto`) — e.g. `GRANULARITY_HOUR requires a time range of at most 14 days`. The frontend must keep granularity and time range compatible so these never reach the server.

- Single source of truth: `src/lib/granularity.ts` (mirrors the proto caps — keep them in sync). The cap map is total over `Granularity`, so a new enum member without a cap is a compile error.
- Any page with both a time-range picker and a granularity picker must use these helpers — do not re-derive or duplicate the ladder per page:
  - `granularityDisabledReason(granularity, range)` → pass as `OptionChip`'s `isOptionDisabled` so over-cap granularities render disabled with a tooltip.
  - `clampRange(range)` and `clampGranularity(granularity, range)` → call both from the time-range `onChange`: `clampRange` caps a range too wide for *any* granularity to the supported max, then `clampGranularity` keeps a still-valid pick as-is, leaves `UNSPECIFIED` ("Auto") untouched, and bumps a now-disabled pick to the **smallest/finest** granularity that still fits.
  - `autoGranularity(range)` → resolve `UNSPECIFIED` ("Auto") to a concrete value at the consumption point (including before passing a granularity down to dashboard tiles). This is the only place the auto ladder lives. Note: `autoGranularity` (coarser-biased default) and `clampGranularity` (finest-that-still-fits) deliberately use **different** ladders — they can return different granularities for the same range.
- Behavior must be identical across Insights, Overview, and Dashboard (the three current consumers): same disabled options, same clamp-to-finest-valid on range change, same `autoGranularity` resolution of "Auto".

### Form Validation

Forms use Zod schemas (via `zodResolver` from `@hookform/resolvers/zod`) for client-side validation. Define constraints in the Zod schema — required fields, string lengths, formats — so errors surface immediately in the UI before any RPC call. The protovalidate interceptor still runs as a safety net but is not the primary validation layer for forms.

### Dogfooding (`src/analytics/`)

The dashboard reports its own usage into Pug through `@pug-sh/browser`, the same public-key ingest path customers use. Off unless `VITE_PUG_PROJECT_ID` + `VITE_PUG_PUBLIC_KEY` are both set, so dev sends nothing by default. `initAnalytics()` runs at module scope in `main.tsx` (not an effect — StrictMode would double-fire the first `page_view`). `pug.sh` (repo `../pug-site`) is instrumented the same way and **must stay on the same project + public key**: `crossSubdomainTracking` shares identity through a cookie keyed by project ID, so a mismatch splits every visitor into two profiles and the signup funnel stops resolving.

Two invariants worth knowing before you touch this:

- **`data-pug-no-capture` on `<main>` (App.tsx) is load-bearing — don't remove it.** Click and dead-click autocapture send the clicked element's `innerText`, and everything under `<main>` is *customer* data (their end-users' emails and distinct IDs, their property values). The marker resolves via `closest()`, so one boundary covers every page mounted there, present and future. **A data surface rendered outside `<main>` needs its own marker** — `shared-dashboard.tsx` does, since it renders standalone. Structural fields (`tag`/`id`/`class`/coords) are still sent, so keep PII out of `id`/`class` too.
- **`sanitizeUrl` (`analytics/sanitize-url.ts`) drops the whole query string**, not a denylist. `ef`/`pf` carry property-filter *values*, `/magic-link` carries a live token, and forgetting to add a new param to a denylist fails silently and permanently. Path IDs are masked (`:profileId`, `:sessionId`, `:dashboardId`, `:shareId`) because a profileId is another company's end-user and a shareId is a bearer credential. This costs no UTM attribution — the SDK parses `$utm*` from `window.location.search` directly and never routes it through the sanitizer. Note `$pageTitle` is **not** sanitized; it's safe only because `index.html` sets a static `<title>Pug</title>` and nothing mutates it. Per-page titles carrying customer data would leak.

Answering "what are users clicking" is `trackFeature(featureId, featureName)` → the well-known `feature_used` event, so a single `featureId` breakdown reports it. Manual calls are required, not optional: the `<main>` marker blanks button labels, and icon-only buttons (every hover-revealed row action) autocapture as `tag: svg` with empty text. Put the call on the **atom**, not the button, so every entry point counts. Never pass customer text (dashboard names, key names) as props — the `featureId` already says what happened. Demo sessions deliberately are not `identify()`d (`analytics/identity.tsx`): the demo signs everyone in as the shared `snoop@pug.sh` viewer, so identifying it would fuse every demo visitor into one profile and absorb their anonymous histories.

**Event props carry labels and our own resource IDs — never secrets, never customer PII, never a copied value.** The rule that keeps this honest: an event property is a *category* (`scope: Private`, `insightType: trends`, `context: sdk_snippet:web`), a count, or one of our own object IDs (`apiKeyId`, `dashboardId`) — never a key value, a filter value, an end-user email, or free customer text. `useCopyToClipboard`'s `copy(text, context?)` is opt-in by this rule: it tracks a `copied` event **only** when a call site passes a stable `context` label, and the copied `text` is never sent (it's frequently a credential). Secret-copy sites (the once-shown private key) pass **no** context, so they stay silent — the minting event (`api_key_created`, `scope: Private`) is the signal, not the copy.

Current manual events beyond `feature_used`: `signin` (`method`), `signout`, `api_key_created`/`api_key_revoked`, `insight_queried` (shape only — type + counts, no filter values; fired inside the debounced query fn, one per settled query), `dashboard_viewed` (`dashboardId`, deduped by ref), `copied` (`context` label).

### Backend Auth Model

- JWT in `sub` claim = customerID (not email)
- Org + project auto-created on signup
- Unauthenticated sign-in: magic link (`/magic-link?token=…`) or Google (`CompleteOAuthSignIn` with GIS id_token via `@react-oauth/google`)
- Google sign-in: `GoogleLogin` → `completeOAuthSignIn({ provider: GOOGLE, credential })`; requires `VITE_GOOGLE_CLIENT_ID`; hide the button when the client ID is unset
- Dashboard endpoints need JWT (handled by interceptor)
- Project-scoped endpoints need JWT + `x-project-id` header
- SDK endpoints (devices, events, profiles) use API key auth — not called from this frontend

### Filters & Query Semantics

- Shared insights proto now uses grouped global filters:
  - `QueryRequest.filter_groups` + `filter_groups_operator`
  - `SegmentUsersRequest.filter_groups` + `filter_groups_operator`
  - Do not send legacy top-level `filters` in these requests.
- Current frontend behavior for global filters:
  - If no event kinds are selected, use the base/unscoped schema.
  - If event kinds are selected, show only property keys common to all selected kinds (intersection for auto/custom keys).
  - Keep profile keys available in global filters.
- Event-row filters are event-scoped (`kindFilter`) and should only show properties for that event kind.
- Value input UX:
  - Always allow free text for values (suggestions are optional, not required).
  - Multi-value operators (`in`, `not in`) support manual multi-entry via Enter/comma + Add. `contains` / `not contains` are single-value (substring match) — the backend's `PropertyFilter` CEL constraints require a non-empty `value` and forbid `values` for them, so they are not list-arity.
  - Presence operators (`is set`, `is not set`) are no-value operators and should commit immediately.

### TypeScript Style

Prefer implicit types — don't annotate what TypeScript can infer:

- **No return types on functions** unless the inferred type would be wrong or the function is exported from a shared library with a complex return shape
- **No explicit variable types** when the RHS makes it obvious (`const x = 'hello'` not `const x: string = 'hello'`)
- **No redundant generics** on `useState`/`useRef` when the initial value already has the right type (`useState(false)` not `useState<boolean>(false)`)
- **Keep generics** when removal would change the type: `useState<T[]>([])` (infers `never[]` without it), `useState<T | null>(null)` (infers `null`), `atom<T[]>([])`, `useRef<HTMLElement>(null)`
- Prefer `if`/`else` or small helpers over ternary operators that span multiple lines
- When a file still needs to coordinate several concerns, separate major sections with blank lines and short section comments instead of letting logic blur together

### Biome

Config in `biome.json`: 2-space indent, no semis, single quotes, 120 char width, trailing commas, and import organization enabled.
