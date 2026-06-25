import { atom } from 'jotai'
import { OrgRole } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { activeOrgAtom } from '@/data/workspace.atoms'

// Client-side mirror of the backend Casbin policy (pug: internal/core/authz/policy.go +
// resources.go). The server is the real enforcer — every guarded RPC re-checks the caller's
// role fresh from the DB — so this map only drives show/hide in the UI. Keep it in sync with
// policy.go; any drift is cosmetic-only (a hidden action that would have worked, or a visible
// one that returns PermissionDenied), never a security hole.
//
// Extending:
//  - New role: add it to the OrgRole proto enum + regenerate, then give it grants below. The
//    `Record<OrgRole, …>` on ROLE_GRANTS makes a missing role a compile error (deny-by-default
//    would otherwise silently hide everything for it). Wire inheritance in INHERITS.
//  - New resource/action: add it to the unions below, then grant it per role.
//  - Outgrowing a static mirror (dynamic/per-resource rules): swap the body of `grantsForRole`
//    for a Set hydrated from the backend (e.g. an implicit-permissions RPC). The
//    `can(action, resource)` interface and every call site stay identical.

// Mirror of authz.Resource (resources.go).
export type Resource =
  | 'org'
  | 'member'
  | 'invitation'
  | 'email_provider'
  | 'project'
  | 'dashboard'
  | 'insight'
  | 'activity'
  | 'profile'

// Mirror of authz.Action (resources.go).
const ACTIONS = ['create', 'read', 'update', 'delete'] as const
export type Action = (typeof ACTIONS)[number]

// A role's DIRECT grants: resource → permitted actions (`'all'` = full CRUD). Inherited
// grants are not repeated here — they come from INHERITS, mirroring Casbin's `g` rules.
type Grants = Partial<Record<Resource, readonly Action[] | 'all'>>

// Role hierarchy, mirroring the `g` grouping in policy.go (admin inherits member). Extend
// with e.g. `[OrgRole.OWNER]: OrgRole.ADMIN` when richer roles land.
const INHERITS: Partial<Record<OrgRole, OrgRole>> = {
  [OrgRole.ADMIN]: OrgRole.MEMBER,
}

// Direct grants per role. Total over OrgRole, so a newly added enum member fails to compile
// until its grants are declared.
const ROLE_GRANTS: Record<OrgRole, Grants> = {
  [OrgRole.UNSPECIFIED]: {},
  [OrgRole.MEMBER]: {
    org: ['read'],
    member: ['read'],
    project: ['read'],
    dashboard: 'all',
    insight: 'all',
    activity: 'all',
    profile: 'all',
  },
  [OrgRole.ADMIN]: {
    org: 'all',
    member: 'all',
    invitation: 'all',
    email_provider: 'all',
    project: 'all',
  },
}

const grantKey = (action: Action, resource: Resource) => `${resource}:${action}`

// Flatten a role's direct + inherited grants into a set of "resource:action" keys. Roles are
// static, so resolve once per role and memoize. `current` must be `OrgRole | undefined` —
// INHERITS lookups end the walk with undefined.
const resolvedCache = new Map<OrgRole, ReadonlySet<string>>()

const resolveGrants = (role: OrgRole) => {
  const keys = new Set<string>()
  let current: OrgRole | undefined = role
  while (current !== undefined) {
    const grants = ROLE_GRANTS[current]
    for (const resource of Object.keys(grants) as Resource[]) {
      const actions = grants[resource]
      const list = actions === 'all' ? ACTIONS : (actions ?? [])
      for (const action of list) keys.add(grantKey(action, resource))
    }
    current = INHERITS[current]
  }
  return keys
}

const grantsForRole = (role: OrgRole) => {
  let cached = resolvedCache.get(role)
  if (!cached) {
    cached = resolveGrants(role)
    resolvedCache.set(role, cached)
  }
  return cached
}

// The signed-in user's role in the active org. The role rides on the Org message
// (OrgsService.List/Get) and is already in activeOrgAtom — there is no role in the JWT.
// Falls back to UNSPECIFIED (no grants) before an org is loaded.
export const currentRoleAtom = atom(get => get(activeOrgAtom)?.role ?? OrgRole.UNSPECIFIED)

// can(action, resource) — the single authorization predicate the UI gates on. Re-derives
// when the active org changes; stable across unrelated re-renders.
export const canAtom = atom(get => {
  const grants = grantsForRole(get(currentRoleAtom))
  return (action: Action, resource: Resource) => grants.has(grantKey(action, resource))
})
