---
paths:
  - "src/components/charts/**"
  - "src/components/shimmering-text.tsx"
  - "src/components/components/**"
  - "src/pages/routegen/insights/charts/**"
  - "src/pages/routegen/insights/charts.tsx"
---

# Charts: the vendored bklit zone and its wrappers

`src/components/charts/` is third-party code vendored from the `@bklit` shadcn registry (declared in `components.json`). The vendored zone is that directory *plus* `src/components/shimmering-text.tsx`, which the registry drops outside it; that file is the trap, since it sits in our namespace but is not ours. The directory matches upstream byte for byte and no file in the zone is patched. Keep it that way: it is what makes re-running an add safe. After any add, follow "After any `shadcn add`" in CLAUDE.md. Both paths are excluded from Biome, so the registry's double quotes and semicolons are expected there.

Every chart renders through it: trends area, line and bar (`insights/charts/{area,line,bar}-chart.tsx`) plus the funnel (`insights/charts/funnel-chart.tsx`). The vendored funnel draws exactly one funnel, so a breakdown renders as small multiples (one taper per split) rather than grouped series; that shape difference is why the wrapper, not the chart, owns the layout.

## Wrapping

- **Customize by wrapping.** Build a wrapper next to the feature that owns it and compose the vendored chart through props / `className`. Series colours come from `getSeriesColor()` and are passed in.
- `useVendoredChartPrep` (`insights/charts/common.ts`) holds the prep all three wrappers share: keyed rows, tooltip rows, and the two date formatters (axis + tooltip). The pill always carries the day an hour bucket lands on, while the axis stays terse and adds the day only when the window crosses one (see the label-uniqueness rule below).
- **Prefer a vendored component over a local one, and re-check on every add.** The registry gained a `YAxis` after we had hand-rolled one, and adopting it deleted our file along with its whole failure mode: ours drew SVG `<text>` at negative x and depended on `displayName` surviving minification to stay outside the series reveal clip, while upstream portals HTML and sidesteps that entirely. It also tweens tick position with the y-domain. Pass `formatValue`, not upstream's `formatLargeNumbers`: that does `(v/1000).toFixed(0)`, so 1500 renders `2k` and 1.2M renders `1200k`. The wrappers pass `yTickFormatter ?? compactNumber`.
- **The shell paints its first frame finished.** Mounted with data it rests in `ready`, series drawn and reveal clip open, and starts the reveal from an effect, so every area, line and bar chart would flash its data before wiping it to animate. `useRevealGate` (`common.ts`) keeps each wrapper `invisible` until the shell's first `onPhaseChange`, which lands in the same flush as the reveal; any phase opens it, so a shell that skips the reveal still shows. `reveal-gate.test.tsx` guards both. A core remount under a mounted wrapper (plot below 10px and back) still flashes once. bklit's own loading flow (`status="loading"` → `"ready"` on one instance) never flashes, but `ComposedChart` has no `status`, so bars can't use it. Re-check on each add, and drop the gate once upstream starts the reveal before first paint.
- `AXIS_LABEL_PX_PER_CHAR` (`helpers.ts`) is calibrated to the UI face; see `.claude/rules/typography.md`.

## When something seems to need a vendored edit

Every past patch was reverted by the next add, silently in one case. Each was solved from outside instead, in one of three shapes:

1. **A broken import path: satisfy the path instead of changing it.** `chart-loading-label.tsx` ships `import … from "../components/shimmering-text"`, valid only in the registry author's `src/charts/` layout; at our target (`components/charts/`) it resolves to `components/components/`. Rather than rewrite the import, `src/components/components/shimmering-text.ts` re-exports the real module. Ugly path, but it is upstream's expectation and it never needs reapplying.
2. **Missing behaviour: re-provide the chart context.** Upstream computes x labels internally with `shortDateFmt` (`Intl.DateTimeFormat("en-US", …)`), browser-local and granularity-blind, and exposes no prop. But the labels reach both consumers (axis and tooltip) through `dateLabels` on the chart context, and `ChartStableContext` is exported, so `insights/charts/date-labels.tsx` wraps `XAxis` and `ChartTooltip` in a provider that overrides that one field. Bucket labels must render in the project's reporting zone to match the server's bucket boundaries, and vary by granularity, or every hour bucket reads `Jul 19`.
3. **An upstream bug with no seam: rewrite it in the build, not in the file, and report it upstream.** Two charts of one type on a page used to share a hardcoded reveal `<clipPath id>`, so `url(#id)` cropped the later chart to the first one's rect. A `vite.config.ts` transform swapped the literal for `useId()` at build time (files on disk untouched, so an add couldn't revert it, and it threw if the literal moved) until bklit scoped the id itself (bklit#232). `insights/charts/vendored-clip-id.test.tsx` stays as the guard: the crop is invisible whenever the two plots are the same size, and every add pulls whatever upstream ships.

## The date-label override

Four things make it work, and all are easy to break:

- The wrappers must keep `displayName = 'XAxis'` / `'ChartTooltip'`. The shell sorts children into layers by component name, and `XAxis` is in its clip-excluded set; an unrecognised name puts the labels inside the series reveal clip. Set it explicitly, since minification mangles the function name.
- Don't reach for `CHART_CLIP_PASSTHROUGH` to inject a provider. It looks like the right seam, but the shell renders the *unwrapped* child, so the wrapper is dropped.
- **An axis label is the tick's identity, so it has to be unique.** `dedupeIndicesByLabel` (vendored `x-axis.tsx`) skips any candidate tick whose label text it has already seen, so a duplicate doesn't just repeat: it costs the layout a tick, and the scorer ends up bunching what's left. A rolling 24h window floors to 25 hourly buckets whose first and last both read `16:00`, and the axis drew its only three ticks on buckets 0/1/2. `formatAxisDate` takes `withDay`, which `useVendoredChartPrep` sets via `spansMultipleDays`, so hour labels carry the day once the window crosses one; single-day windows stay terse. Don't simplify them back to a bare `HH:MM`.
- **A tooltip label gets at most two space-separated tokens.** Below 60 buckets the hover pill uses `DateTickerInner` (`tooltip/date-ticker.tsx`), which splits the label on `" "`, renders `parts[0]` as the scrolling month column and `parts[1]` as the day column, and **drops everything after**: `Jul 22, 02:00` displayed as `Jul 22,`, and a WEEK label `Jul 13 - Jul 19` as `Jul 13`. Above 60 buckets `DateTickerCompact` prints the label whole, which is why this looks fine on long hourly ranges and breaks on short ones. Two helpers in `insights/charts/helpers.ts` keep labels inside that grammar, depending on whether the label has a month to hoist: `asTickerLabel` NBSP-joins everything after the month so the two columns read `Jul` + `22, 02:00`, while `asWholeTickerLabel` NBSP-joins the whole string into one column. Ranges need the latter: they already name their own months, so hoisting the first left `Jun  21 - Jun 27`, the gap widened by the day column centring items against its widest entry.

Two files guard the override across all three charts, both stubbing `@visx/responsive` because happy-dom reports the container as 0×0, and without a size the chart renders nothing and every assertion passes vacuously: `insights/charts/vendored-date-labels.test.tsx` (axis labels land in the project reporting zone, plus the hover-pill scaling) and `insights/charts/vendored-tooltip-date.test.tsx` (the pill carries the day, not just the clock time, and every non-padding label stays within the ticker's two-column grammar; asserting the label string alone passed while the pill was visibly dropping the hour). Each surface re-provides the context independently, so each needs its own guard.
