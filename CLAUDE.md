# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Dashboard frontend for Cotton — an analytics + communication platform (similar to CleverTap). Built for growth managers. React + Vite + TypeScript. Talks to the backend via ConnectRPC (binary protobuf).

## Commands

```sh
pnpm dev          # Start dev server (Vite)
pnpm build        # Type-check + production build (tsc -b && vite build)
pnpm generate     # Regenerate TypeScript proto types from backend protos
pnpm lint         # ESLint
```

## Proto Code Generation

Proto definitions live in `proto/` (symlink to the cotton backend at `/Users/holu/workspace/go/src/github.com/fivebitsio/cotton/proto`). Generated TypeScript goes to `src/api/genproto/` (gitignored). After backend proto changes, run `pnpm generate`. The `--include-imports` flag is required for dependency types (buf/validate, common/v1).

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

Sign-in page is outside `routegen/` since it's unauthenticated.

### UI Components — shadcn/ui (default style)

Standard shadcn/ui with default Base UI primitives. Uses `render` prop for composition (not `asChild`):

```tsx
<SidebarMenuButton render={<Link href="/overview" />}>
```

Update components: `pnpm dlx shadcn@latest add <component> --overwrite`

### Form Validation

Lightweight inline validation only — disable buttons when required fields are empty, basic format checks. The protovalidate interceptor does the heavy lifting: it validates every outgoing message against buf.validate constraints (required, string patterns, ranges, CEL expressions) before the request leaves the browser. Don't duplicate proto constraints in the UI.

### Backend Auth Model

- JWT in `sub` claim = customerID (not email)
- Org + project auto-created on signup
- Dashboard endpoints need JWT (handled by interceptor)
- Project-scoped endpoints need JWT + `x-project-id` header
- SDK endpoints (devices, events, profiles) use API key auth — not called from this frontend

### Prettier

Config in package.json: no semis, single quotes, 120 char width, trailing commas ES5.
