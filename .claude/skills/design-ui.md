---
name: design-ui
description: Design and build UI components following Cotton's light, minimal aesthetic
user_invocable: true
---

# Design UI

You are designing UI for Cotton's dashboard. Read CLAUDE.md first — the Design Aesthetic section is the authority.

## Core philosophy

Cotton's UI should feel like a well-made tool, not a marketing site. Every element earns its place. When in doubt, leave it out.

## Before writing any component

1. Read the Design Aesthetic section of CLAUDE.md
2. Look at existing pages for patterns — grep for similar components before creating new ones
3. Ask: "Can this be simpler?" If something needs a Card, a modal, or a nested menu — rethink the approach

## Design rules

### Layout

- No Card wrappers — use section divider headers to separate content
- No modals for simple actions — use inline editing, inline create forms
- No nested dropdown menus (no DropdownMenuSub) — one level max, prefer inline expand/collapse
- No external CDN dependencies — bundle or self-host assets

### Interactions

- Flat and inline — expand/collapse in-place, inline inputs, toggle states
- Destructive/edit actions hidden until hover (`opacity-0 group-hover:opacity-100`)
- Buttons disabled when invalid — no error toasts for form validation
- The protovalidate interceptor handles constraint validation — don't duplicate it

### Empty states

- A faded icon (`opacity-15`) + one or two lines of text
- No illustrations, onboarding wizards, or big call-to-action buttons
- Example:

```tsx
<div className='flex flex-col items-center justify-center py-16'>
  <IconName className='w-10 h-10 mb-4 opacity-15' />
  <p className='text-sm font-medium mb-1'>Nothing here yet</p>
  <p className='text-xs text-muted-foreground'>Helpful context</p>
</div>
```

### Typography and data display

- Table headers: `text-[11px] font-medium text-muted-foreground uppercase tracking-wider`
- Table rows: `border-b border-border/50 transition-colors hover:bg-muted/40`
- IDs and codes: `font-mono`
- Times: 24-hour clock, `HoverSwap` for relative/absolute toggle
- Links: `text-primary hover:underline underline-offset-4`
- Event kinds: colored `Badge` with `kindStyle()` for consistent palette

### Section divider header pattern

```tsx
<div className='flex items-center gap-2 mb-2'>
  <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Section Title</span>
  <div className='flex-1 h-px bg-border' />
  <span className='text-[10px] text-muted-foreground'>count</span>
</div>
```

### Components

- shadcn/ui with Base UI primitives — use `render` prop, not `asChild`
- Icons: lucide-react only
- Plain `<table>` elements, not the shadcn Table component

## When reviewing your output

Before finishing, check:

- [ ] No Card components used
- [ ] No nested menus
- [ ] No modals (unless explicitly requested)
- [ ] No external CDN/asset URLs
- [ ] Empty states are minimal (icon + text only)
- [ ] Uses `render` prop, not `asChild`
- [ ] Follows existing patterns from nearby pages
