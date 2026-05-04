# Pug Web Frontend

Dashboard frontend for **Pug** — an analytics + communication platform (similar to CleverTap). Built for growth managers to manage campaigns, analyze insights, and track user events.

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS 4** with shadcn/ui components (Base UI primitives)
- **Jotai** for state management (atoms only, no Context/Redux)
- **ConnectRPC** with protobuf for backend communication
- **Wouter** for file-based routing
- **ESLint** + **Prettier** for code quality

## Commands

```sh
pnpm dev          # Start dev server (Vite) at http://localhost:5173
pnpm build        # Type-check + production build
pnpm generate     # Regenerate TypeScript proto types from backend protos
pnpm lint         # ESLint check
pnpm preview      # Preview production build
```

## Project Structure

```
src/
├── api/              # RPC clients and generated proto types
│   ├── rpc.ts        # ConnectRPC client atoms
│   └── genproto/     # Generated proto types (gitignored)
├── auth/             # Authentication logic and JWT handling
├── components/       # UI components
│   ├── layout/       # Layout components (sidebar, page wrapper)
│   ├── ui/           # shadcn/ui base components
│   └── project-link.tsx
├── data/             # Jotai atoms for workspace/org/project state
├── hooks/            # Custom React hooks
├── lib/              # Utility functions
├── network/          # Transport configuration and interceptors
├── pages/            # Page components and routing
│   ├── router.tsx    # Main router with project sync
│   ├── routes.ts     # Auto-discovered routes from routegen/
│   ├── sign-in.tsx   # Unauthenticated sign-in page
│   └── routegen/     # File-based routing pages
│       ├── overview/
│       ├── campaigns/
│       ├── insights/
│       ├── events/
│       ├── activities/
│       ├── members/
│       └── settings/
├── App.tsx           # Root component with theme/auth logic
├── main.tsx          # Entry point
└── index.css         # Tailwind + theme configuration
```

## Architecture Patterns

### State Management — Jotai Atoms

All state uses Jotai atoms. Key patterns:

```ts
// RPC clients as atoms
export const campaignsRPCAtom = atom(get => createClient(CampaignService, get(transportAtom)))

// Async operations with write atoms
export const fetchCampaignsAtom = atom(null, async (get, set) => {
  const rpc = get(campaignsRPCAtom)
  const resp = await rpc.list({})
  return resp.campaigns
})

// Persistent state with atomWithStorage
export const jwtAtom = atomWithStorage('pug:jwt', '')
```

### ConnectRPC Transport

Transport configured in `src/network/transport.ts` with two interceptors:

1. **authBearer** — Auto-attaches JWT from localStorage to all requests
2. **protovalidate** — Validates outgoing messages against proto buf.validate constraints

For project-scoped endpoints, pass `{ headers }` from `projectHeaderAtom`:

```ts
const headers = useAtomValue(projectHeaderAtom)
await campaignsRPC.get({ id }, { headers })
```

### File-Based Routing

Pages auto-discovered via `import.meta.glob('./routegen/**/index.page.tsx')`:

- `routegen/campaigns/index.page.tsx` → `/p/:projectId/campaigns`
- `routegen/campaigns/[id]/index.page.tsx` → `/p/:projectId/campaigns/:id`

Co-located files (atoms, helpers) next to `index.page.tsx` are not routed.

### UI Components — Base UI Pattern

shadcn/ui with Base UI primitives uses `render` prop (not `asChild`):

```tsx
// Correct: Base UI pattern
<SidebarMenuButton render={<Link href="/overview" />} />

// Wrong: Radix pattern (don't use)
<SidebarMenuButton asChild><Link href="/overview" /></SidebarMenuButton>
```

### Form Validation

Lightweight inline validation only. Heavy validation handled by `protovalidate` interceptor which checks against `buf.validate` constraints before sending requests.

## Proto Code Generation

Proto definitions live in `proto/` (symlink to pug backend). Generated TypeScript goes to `src/api/genproto/` (gitignored).

**After backend proto changes:**

```sh
pnpm generate
```

The `--include-imports` flag is required for dependency types (`buf/validate`, `common/v1`).

### Proto Import Paths

Generated modules follow this structure:

- `shared/activity/v1/activity_pb` — Activity events
- `shared/campaigns/v1/campaigns_pb` — Campaign management
- `dashboard/orgs/v1/orgs_pb` — Organization operations
- `dashboard/projects/v1/projects_pb` — Project operations
- `dashboard/insights/v1/insights_pb` — Analytics insights
- `public/auth/v1/auth_pb` — Authentication
- `sdk/*` — SDK types (events, devices, profiles)

## Backend Auth Model

- JWT `sub` claim = customerID (not email)
- Org + project auto-created on signup
- Dashboard endpoints need JWT (handled by interceptor)
- Project-scoped endpoints need JWT + `x-project-id` header
- SDK endpoints use API key auth (not called from frontend)

## Environment Variables

```sh
# .env.development
VITE_API_BASE_URL=http://localhost:3000

# .env.production
VITE_API_BASE_URL=<production-api-url>
```

## Code Style (Prettier)

Configured in `package.json`:

- No semicolons
- Single quotes
- 120 character width
- Trailing commas (ES5)
- JSX single quotes

## Key Files

| File                                | Purpose                                        |
| ----------------------------------- | ---------------------------------------------- |
| `src/api/rpc.ts`                    | ConnectRPC client atoms for all services       |
| `src/network/transport.ts`          | Transport with auth/protovalidate interceptors |
| `src/data/workspace.atoms.ts`       | Org/project state management                   |
| `src/auth/auth.atoms.ts`            | Sign in/up logic and auth state                |
| `src/pages/routes.ts`               | Auto-discovers pages from routegen/            |
| `src/components/layout/sidebar.tsx` | Main navigation sidebar                        |
