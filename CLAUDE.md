# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Dashboard frontend for Pug — an analytics + communication platform (similar to CleverTap). Built for growth managers. React + Vite + TypeScript. Talks to the backend via ConnectRPC (binary protobuf).

## Commands

```sh
bun run dev       # Start dev server (Vite)
bun run build     # Type-check + production build (tsc -b && vite build)
bun run generate  # Regenerate TypeScript proto types from backend protos
bun run format    # Biome formatter (format only)
bun run lint      # Biome check — format + lint + import organization (safe fixes)
```

There is no test script today.

## Proto Code Generation

Proto definitions live in `proto/` (symlink to the pug backend at `/Users/holu/workspace/go/src/github.com/fivebitsio/pug/proto`). Generated TypeScript goes to `src/api/genproto/` (gitignored). After backend proto changes, run `bun run generate`. The `--include-imports` flag is required for dependency types (buf/validate, common/v1).

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

### UI Components — shadcn/ui (default style)

Standard shadcn/ui with default Base UI primitives. Uses `render` prop for composition (not `asChild`):

```tsx
<SidebarMenuButton render={<Link href="/overview" />}>
```

Update components: `bunx shadcn@latest add <component> --overwrite`

### Design Aesthetic

Light and minimal. This is a deliberate design direction — do not add visual or interaction weight:

- **No Cards** — use section divider headers (see below) instead of wrapping content in Card components
- **No nested menus** — no DropdownMenuSub, no multi-level popover trees. Use flat inline interactions: expand/collapse in-place, inline inputs, single-level dropdowns at most
- **No modals for simple actions** — inline editing, inline create forms, confirmation via button state (not confirm dialogs)
- **No external CDN dependencies** for UI assets — bundle or self-host everything

Section divider header pattern:

```tsx
<div className='flex items-center gap-2 mb-2'>
  <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Section Title</span>
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

### Form Validation

Forms use Zod schemas (via `zodResolver` from `@hookform/resolvers/zod`) for client-side validation. Define constraints in the Zod schema — required fields, string lengths, formats — so errors surface immediately in the UI before any RPC call. The protovalidate interceptor still runs as a safety net but is not the primary validation layer for forms.

### Backend Auth Model

- JWT in `sub` claim = customerID (not email)
- Org + project auto-created on signup
- Unauthenticated sign-in: magic link (`/magic-link?token=…`) or Google (`CompleteOAuthSignIn` with GIS id_token via `@react-oauth/google`)
- Google sign-in: `GoogleLogin` → `completeOAuthSignIn({ provider: GOOGLE, credential })`; requires `VITE_GOOGLE_CLIENT_ID`; hide the button when `VITE_OAUTH_GOOGLE_ENABLED=false` or client ID is unset
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
  - Multi-value operators (`in`, `not in`, `contains`, `not contains`) support manual multi-entry via Enter/comma + Add.
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
