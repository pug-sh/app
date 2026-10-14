---
name: design-ui
description: Design and build UI components following Pug's light, minimal aesthetic
---

# Design UI

Pug's UI should feel like a well-made tool, not a marketing site. Every element earns its place. When in doubt, leave it out.

The rules live in CLAUDE.md under Design Aesthetic, Typography and Colour, and that is the authority. This skill is the workflow around them and restates no class strings, so it cannot drift from them.

## Before writing any component

1. Re-read Design Aesthetic, Typography and Colour in CLAUDE.md.
2. Find the nearest page with a similar surface and follow its patterns; grep for a similar component before creating one.
3. Ask "can this be simpler?" If something seems to need a Card, a modal or a nested menu, rethink the approach.

## Interactions

- Flat and inline: expand/collapse in place, inline inputs, toggle states.
- Destructive and edit actions stay hidden until row hover.
- Buttons are disabled while a form is invalid, with no error toasts for validation. Constraints live in the Zod schema (Form Validation in CLAUDE.md).

## Before finishing

- [ ] No Card components, nested menus or modals (unless explicitly requested)
- [ ] No external CDN or asset URLs
- [ ] Empty states are a faded icon and one or two lines of text
- [ ] `render` prop, not `asChild`; icons from lucide-react; plain `<table>`, not the Table component
- [ ] Nothing below `text-xs`, and no weight class on a heading or display size
- [ ] Coloured text uses `text-link` or the semantic tiers, never `text-primary`
- [ ] Event colours come from `getSeriesColor()`, breakdown colours from `getIndexedColor()`
- [ ] Follows existing patterns from nearby pages
