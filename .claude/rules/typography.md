---
paths:
  - "src/index.css"
  - "src/lib/capture-chart.ts"
---

# Changing or evaluating the UI face

The everyday type rules (two weights, tracking, `tabular-nums`, the 12px floor) are in CLAUDE.md under Typography. This file is what a face change touches.

- **The brief is "airy", and that is a measurable property: bench it, don't eyeball it.** Rasterise a sample at a *fixed cap height* (not a fixed px size, or a face that is small on the body wins by cheating) and count covered subpixels: ink per area is the texture weight, advance per cap is the letterfit. The bench narrows the field, it does not pick the winner: it correctly found Work Sans the airiest, which was then rejected on looks. Two traps: `canvas.measureText` silently falls back for a face the browser has not loaded, and an unused `@font-face` is never fetched, so `await document.fonts.load(...)` every candidate first or every row comes back identical.
- **Check the numerals separately**: `font-variant-numeric: tabular-nums` really collapsing to one advance, `0` distinguishable from `O`, `1` from `I`. An airy face that fails those is unusable on a data surface.
- **Check the real 500 at 12–14px.** `font-medium` carries every label and table header, and a face's 500 can read heavy at those sizes.
- **The share-card renderer embeds the font separately and will not error if you forget it.** `lib/capture-chart.ts` loads the SVG through an `<img>`, which cannot see the page's `@font-face`, so it fetches the woff2 via a Vite `?url` import and inlines it as a base64 `@font-face` built in a template string. Changing `--font-sans` means also updating `FONT_FAMILY`, the import path, **and the `font-weight` range** in that string. Each variable face declares its own axis (Figtree's starts at 300, not the `100 900` most variable faces ship), so a copied-over range renders the export off-weight. Get it wrong and exported tiles fall back to system sans or render off-weight, silently and only in the export.
- **Re-measure `AXIS_LABEL_PX_PER_CHAR`** (`insights/charts/helpers.ts`) on every face change. It is the face's *widest* realistic label (Figtree: an all-digit clock at 7.0px/char, vs ~4.9 for a spaced label), not its average: fitting to the average overprints exactly the labels that are hardest to read.
