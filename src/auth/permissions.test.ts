import { create } from '@bufbuild/protobuf'
import { createStore } from 'jotai'
import { describe, expect, it } from 'vitest'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { canAtom } from './permissions'

const can = (role: OrgRole) => {
  const store = createStore()
  store.set(activeOrgAtom, create(OrgSchema, { id: 'org-a', displayName: 'A', role }))
  return store.get(canAtom)
}

describe('billing grants', () => {
  // Whoever notices the quota banner is rarely the admin, so the read sits on the viewer floor —
  // and the surfaces gate on it, so a wrong answer here hides the meter from everyone.
  it.each([OrgRole.VIEWER, OrgRole.MEMBER, OrgRole.ADMIN])('lets role %s read billing', role => {
    expect(can(role)('read', 'billing')).toBe(true)
  })

  // Checkout spends money and the portal reaches invoices.
  it('lets only an admin start one', () => {
    expect(can(OrgRole.ADMIN)('create', 'billing')).toBe(true)
    expect(can(OrgRole.MEMBER)('create', 'billing')).toBe(false)
    expect(can(OrgRole.VIEWER)('create', 'billing')).toBe(false)
  })

  // An entitlement is written by `pug billing`, never over the wire.
  it('grants no update or delete to anyone', () => {
    for (const role of [OrgRole.VIEWER, OrgRole.MEMBER, OrgRole.ADMIN]) {
      expect(can(role)('update', 'billing')).toBe(false)
      expect(can(role)('delete', 'billing')).toBe(false)
    }
  })

  // Deny-by-default: a role off the wire this build does not know must not read billing.
  it('grants nothing before a role is known', () => {
    expect(can(OrgRole.UNSPECIFIED)('read', 'billing')).toBe(false)
  })
})
