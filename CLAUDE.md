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

**Log scale and zero-baseline are gone.** The vendored shell hardcodes `scaleLinear` (`y-domain-utils.ts`, `time-series-chart-shell.tsx`) and tweens the y-domain itself, so both tile options were dropped from the format panel and the render path. `VisualizationOptions.logScale` / `zeroBaseline` still exist on the proto and may sit `true` on tiles saved before the migration — they are vestigial and silently ignored. Don't re-add the checkboxes without first solving a non-linear scale in the wrapper (a data-space transform plus a matching y-tick formatter); zero-baseline needs nothing, since the domain already pins `[0, max]` for non-negative data.

- **Never edit anything under `src/components/charts/` — or `src/components/shimmering-text.tsx`.** The registry drops that one dependency outside the directory, so the vendored zone is the directory *plus* that file. A local fix there is silently overwritten by the next re-add, and any drift turns an upgrade into a manual three-way merge. The directory currently matches upstream byte for byte; `git diff src/components/charts/` after an add should be empty, and anything else is either collateral to revert or a real upstream change to read.
- **Customize by wrapping.** Build a wrapper next to the feature that owns it and compose the vendored chart through props / `className`. Series colors come from `getSeriesColor()` (see Insights Color System) and are passed in — never hardcoded upstream. `useVendoredChartPrep` (`insights/charts/common.ts`) holds the prep all three wrappers share: keyed rows, tooltip rows, and the two date formatters (axis + tooltip; the pill always carries the day an hour bucket lands on, while the axis stays terse and adds the day only when the window crosses one — see the label-uniqueness rule below).
- Both paths are excluded from Biome (`biome.json` → `files.includes`) so the formatter can't rewrite them either. The registry's style (double quotes, semicolons) is expected there and is not a violation. `shimmering-text.tsx` is the trap — it sits in our namespace but is not ours.
- **Prefer a vendored component over a local one, and re-check on every add.** The registry gained a `YAxis` after we had hand-rolled one, and adopting it deleted our file along with its whole failure mode — ours drew SVG `<text>` at negative x and depended on `displayName` surviving minification to stay outside the series reveal clip, while upstream portals HTML and sidesteps that entirely. It also tweens tick position with the y-domain. Pass `formatValue`, not upstream's `formatLargeNumbers`: that does `(v/1000).toFixed(0)`, so 1500 renders `2k` and 1.2M renders `1200k`. The wrappers pass `yTickFormatter ?? compactNumber`.

**No file in the vendored zone is patched. Keep it that way.** There used to be two patches, and every `add` reverted them — silently, in the case of the date labels. Both are now solved from outside, so re-running an add is safe. If you hit something that looks like it needs a vendored edit, these are the three shapes of answer that worked:

1. **A broken import path → satisfy the path instead of changing it.** `chart-loading-label.tsx` ships `import … from "../components/shimmering-text"`, valid only in the registry author's `src/charts/` layout; at our target (`components/charts/`) it resolves to `components/components/`. Rather than rewrite the import, `src/components/components/shimmering-text.ts` re-exports the real module. Ugly path, but it is upstream's expectation and it never needs reapplying.
2. **Missing behaviour → re-provide the chart context.** Upstream computes x labels internally with `shortDateFmt` (`Intl.DateTimeFormat("en-US", …)`) — browser-local and granularity-blind — and exposes no prop. But the labels reach both consumers (axis and tooltip) through `dateLabels` on the chart context, and `ChartStableContext` is exported, so `insights/charts/date-labels.tsx` wraps `XAxis` and `ChartTooltip` in a provider that overrides that one field. Bucket labels must render in the project's reporting zone to match the server's bucket boundaries, and vary by granularity or every hour bucket reads `Jul 19`.
3. **An upstream bug with no seam → rewrite it in the build, not in the file.** `line-chart.tsx`, `area-chart.tsx` and `composed-chart.tsx` each pass a hardcoded `clipPathId` for their reveal clip, so two charts of one type on a page emit duplicate `<clipPath id>` — and `url(#id)` resolves to the first in document order, leaving the later chart clipped by the first one's rect and cropped to it. Neither side of the id is reachable from outside, so `scopeChartClipIds` in `vite.config.ts` swaps the literal for `useId()` at transform time. The files on disk stay byte-identical, an add can't revert it, and the plugin **throws** if either rewrite misses — though it can only fire for a file it matches, so a chart upstream renames, or a fourth one with the same bug, needs adding to the map by hand. Guarded by `insights/charts/vendored-clip-id.test.tsx`; reported upstream with a repro ([poluruprvn/bklit-ui-duplicate-clippath-repro](https://github.com/poluruprvn/bklit-ui-duplicate-clippath-repro)), so delete both once it lands.

Four things make the date-label override work, and all are easy to break:

- The wrappers must keep `displayName = 'XAxis'` / `'ChartTooltip'`. The shell sorts children into layers by component name, and `XAxis` is in its clip-excluded set — an unrecognised name puts the labels inside the series reveal clip. Set it explicitly; minification mangles the function name.
- Don't reach for `CHART_CLIP_PASSTHROUGH` to inject a provider. It looks like the right seam, but the shell renders the *unwrapped* child, so the wrapper is dropped.
- **An axis label is the tick's identity, so it has to be unique.** `dedupeIndicesByLabel` (vendored `x-axis.tsx`) skips any candidate tick whose label text it has already seen, so a duplicate doesn't just repeat — it costs the layout a tick, and the scorer ends up bunching what's left. A rolling 24h window floors to 25 hourly buckets whose first and last both read `16:00`, and the axis drew its only three ticks on buckets 0/1/2, one bucket apart. `formatAxisDate` takes `withDay`, which `useVendoredChartPrep` sets via `spansMultipleDays`, so hour labels carry the day once the window crosses one; single-day windows stay terse. Don't simplify them back to a bare `HH:MM`.
- **A tooltip label gets at most two space-separated tokens.** Below 60 buckets the hover pill uses `DateTickerInner` (`tooltip/date-ticker.tsx`), which splits the label on `" "`, renders `parts[0]` as the scrolling month column and `parts[1]` as the day column, and **drops everything after** — `Jul 22, 02:00` displayed as `Jul 22,`, and a WEEK label `Jul 13 - Jul 19` as `Jul 13`. Above 60 buckets `DateTickerCompact` prints the label whole, which is why this looks fine on long hourly ranges and breaks on short ones. Two helpers in `insights/charts/helpers.ts` keep labels inside that grammar, and which one you want depends on whether the label has a month to hoist: `asTickerLabel` NBSP-joins everything after the month so the two columns read `Jul` + `22, 02:00`, while `asWholeTickerLabel` NBSP-joins the whole string into one column. Ranges need the latter — they already name their own months, so hoisting the first left `Jun  21 - Jun 27`, the gap widened by the day column centring items against its widest entry.

Two files guard the override across all three charts, both stubbing `@visx/responsive` because happy-dom reports the container as 0×0 and without a size the chart renders nothing and every assertion passes vacuously: `insights/charts/vendored-date-labels.test.tsx` (axis labels land in the project reporting zone, plus the hover-pill scaling) and `insights/charts/vendored-tooltip-date.test.tsx` (the pill carries the day, not just the clock time, and every non-padding label stays within the ticker's two-column grammar — the first version of that test asserted the label string only, which passed while the pill was visibly dropping the hour). Each surface re-provides the context independently, so each needs its own guard.

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
- **12px is the type floor.** `text-xs` is the smallest size in the UI — there is no `text-[11px]`, `text-[10px]`, or `text-[9px]` (all 121 uses were retired). It matches the vendored charts, which label axes at `text-xs` and set tooltip values at `text-sm`. Micro-labels get their emphasis from `uppercase tracking-wider text-muted-foreground`, not from shrinking.
- **Corners stay soft** — `--radius: 0.625rem`, ramp at 8/10/12/16px. A tightening to 6px was tried and reverted; the soft corners are the intended look. The trap if you do retune them: the `--radius-sm/md/lg/xl` ramp in `@theme inline` is **hardcoded, not derived from `--radius`**, and `rounded-md`/`rounded-lg` (115 uses between them) read from the ramp. Only `rounded-2xl/3xl/4xl` derive. Changing `--radius` alone will look like it did nothing.

### Typography

UI sans is **Figtree** (`@fontsource-variable/figtree`, the `wght` axis at 300–900), mono is **JetBrains Mono** (`@fontsource/jetbrains-mono`, static 400/500). Both are npm packages imported at the top of `src/index.css` and bundled — no CDN, nothing in `public/`. It replaced Apfel Grotezk, which was self-hosted from `public/fonts/`.

- **`font-medium` renders at 400, not 500.** `--font-weight-medium: 400` in `@theme inline` overrides Tailwind's default. Apfel shipped no 500 cut, so the 213 `font-medium` sites had always fallen back to regular; Figtree has a real 500, and adopting it silently made the whole UI heavier. The override keeps the established weight. `font-semibold` (3 uses) and `font-bold` (2) are untouched and now come off Figtree's variable axis.
- **`tabular-nums` does something now.** Apfel had no `tnum` feature and its digits spanned a 2.19× width range, so numeric columns sat ragged and live values reflowed as they updated — the 58 `tabular-nums` sites were inert. Figtree ships real tabular figures at a 1.55× natural spread. Fixing this was the reason for the swap; keep `tabular-nums` on numeric columns and live-updating values.
- **The share-card renderer embeds the font separately and will not error if you forget it.** `capture-tile.ts` loads the SVG through an `<img>`, which cannot see the page's `@font-face`, so it fetches the woff2 via a Vite `?url` import and inlines it as a base64 `@font-face` built in a template string. Changing `--font-sans` means also updating `FONT_FAMILY`, the import path, **and the `font-weight` range** in that string (Figtree is `300 900`; most other variable faces are `100 900`). Get it wrong and exported tiles fall back to system sans or render off-weight — silently, and only in the export.

Face selection was benched against the real surfaces rather than specimens — x-height, stem, counter, advance and digit spread taken off the outlines with fontTools. Figtree sat closest to Apfel's optical space (identical 0.500 x-height) while fixing the numerals. If you reopen this, measure; don't eyeball.

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
  <span className='text-xs text-muted-foreground'>count</span>
</div>
```

Tables use plain `<table>` elements (not the Table component), with:

- Headers: `text-xs font-medium text-muted-foreground uppercase tracking-wider`
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

Color tokens live in `src/index.css` (`:root` = light, `.dark` = dark). Both modes are tuned to the **same** ratios now, so a divergence between them is a bug on its face — check the pair before theorising. Temperature is unified the same way: every neutral sits at hue `265` — faint cool tint on surfaces (C ≤ .012), near-neutral ink (C ≤ .008) — in both modes. A token that reads bluer or grayer than its neighbours is a regression, not a style choice (light mode used to run achromatic surfaces under C .015–.02 ink, the inverse of dark, and the modes read as different materials).

**Ink sits at 9:1 body / 7.5:1 large / ~5.4:1 muted in both modes**, walked down from 16:1 body over two passes because near-black-on-near-white and near-white-on-charcoal both read as glare. AA's floor is 4.5:1 — headroom above ~9:1 buys fatigue, not legibility, on a dashboard people stare at for hours. When you change a ground, re-solve the ink against it rather than nudging by eye; `--sidebar-foreground` is a hair darker than `--foreground` in both modes purely because the sidebar ground is. `--faint` (`text-faint`, 3.2:1 both modes) is the fourth ink tier — timestamps, counts, hint text, resting icon affordances. Don't fade *text* with `text-muted-foreground/NN`: alpha composites differently per mode (2.1:1 light vs 2.4:1 dark at `/50`), which is why that ladder was retired down to ~11 deliberately decorative sites (separator glyphs, ghosted sparklines, spinners).

- Dark `--primary` (`0.54/0.16`) and `--destructive` (`0.54/0.18`) are deep + saturated so **white button text clears AA**, matching the light-mode CTA character. These are **fills** and did not move with the ink pass. Do **not** raise `--muted-foreground` (`0.49` light / `0.67` dark) back toward the body colour to "fix" contrast; the ~1.65× separation between them is what carries hierarchy now that the top of the ramp has come down.
- **Chip ink (`--accent`/`--secondary`/`--sidebar-accent-foreground`) must stay softer than `--foreground`.** Solving it for a flat target ratio pushes it *past* body ink, because the chip grounds are lighter than the canvas — cap it below body instead of solving it independently.
- **Dark chip/hover grounds are compressed toward light's register.** `--secondary`/`--muted`/`--accent` land 1.19/1.22/1.28 against the canvas where light steps 1.10; the floor is `--accent` staying visibly above `--popover` (menu-item hovers render on popovers). Don't lift them back toward the old 1.25–1.37 — that made every chip and hover a louder event in dark than in light. Card and popover deliberately keep their extra dark-mode lift: shadows are invisible on dark, so elevation there is fill-carried.
- **A filled button and colored body text pull lightness in opposite directions** — the fill wants to stay dark (white text on it), colored text wants to be light (to read on the dark canvas); no single token satisfies both at AA. So **colored text is decoupled from the fill:** `--link` (`0.714/0.15` dark, `0.456/0.18` light — ≈ 6.4:1 in both modes, ~0.7× body emphasis) is the blue used *as text* (links, primary-tinted icons) via the `text-link` utility, while `--primary` stays the dark **fill** (`bg-primary`). Do **not** point links at `text-primary` or lighten `--primary` to fix them — use `text-link`; lightening `--primary` re-breaks the buttons.
- Still deferred — **deliberate, not a bug:** `text-destructive` *text* (≈ 3.2:1) on the dark canvas is sub-AA (the same fill-vs-text conflict). The fix is the same pattern (a `--destructive`-text token mirroring `--link`); not yet done because error text is rare. Don't lighten `--destructive` itself.

The palette is re-based on the `@bklit` chart registry's own theme: dark canvas `0.239`, tonal range in the ink rather than a lifted ground, and a translucent `--border` (`0.62 0.02 265 / 0.2`) so one token works on canvas, card and popover. `--input` cannot be translucent: every form control styles itself `dark:bg-input/30` (some `/50`, `/80`), and Tailwind's `/NN` modifier *multiplies* alpha, so the fill disappears — it stays opaque.

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
