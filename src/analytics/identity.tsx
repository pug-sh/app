import { useAtomValue } from 'jotai'
import { useEffect, useRef } from 'react'
import { isDemoSessionAtom } from '@/auth/demo'
import { jwtDataAtom } from '@/auth/jwt.atoms'
import { roleLabel } from '@/auth/permissions'
import { activeOrgAtom, activeProjectAtom } from '@/data/workspace.atoms'
import { type CustomerTraits, identifyCustomer, resetIdentity } from './pug'

// Keeps the SDK's identity in step with the session. Mounted from App.tsx alongside ThemeSync,
// which is the pattern for a null-rendering effect that syncs a module to atom state.
const AnalyticsIdentity = () => {
  const customerId = useAtomValue(jwtDataAtom)?.customerId
  const org = useAtomValue(activeOrgAtom)
  const project = useAtomValue(activeProjectAtom)
  const isDemo = useAtomValue(isDemoSessionAtom)

  // What we last sent. customerId is tracked apart from the traits so the three transitions that
  // matter can be told apart: signed-out boot vs sign-out, a trait refresh vs an account switch.
  const sentCustomerId = useRef<string | null>(null)
  const sentTraits = useRef<string | null>(null)

  useEffect(() => {
    if (!customerId) {
      // Only a real sign-out resets. Without the guard, a signed-out boot would clear the
      // anonymous ID of a visitor who just arrived from pug.sh — that ID is the cross-subdomain
      // link between the marketing site and this app, so dropping it would break the funnel for
      // exactly the people it exists to measure.
      if (sentCustomerId.current === null) return
      sentCustomerId.current = null
      sentTraits.current = null
      resetIdentity()
      return
    }

    // The demo signs everyone in as the same shared viewer account (snoop@pug.sh). Identifying it
    // would fuse every demo visitor into one profile AND merge each of their anonymous histories
    // into it — identify() sends the anonymous ID on its first call precisely so it can be
    // absorbed. Demo traffic stays anonymous instead, which is also the honest shape: these are
    // prospects, not one very busy user. Someone already identified keeps their identity through
    // the demo, so "a real customer went and poked at the demo" still shows up.
    if (isDemo) return

    // An account switch with no sign-out in between — applySessionAtom explicitly supports this
    // (a magic link for another account while signed in). The SDK holds identity until told
    // otherwise, so without this the new user inherits the previous user's session.
    if (sentCustomerId.current && sentCustomerId.current !== customerId) {
      resetIdentity()
      sentTraits.current = null
    }

    const traits: CustomerTraits = {
      ...(org && { orgId: org.id, orgName: org.displayName, role: roleLabel(org.role) }),
      ...(project && { projectId: project.id, projectName: project.displayName }),
    }

    // Traits arrive in waves (bootstrap resolves the org, then the project), and each wave
    // re-renders this. Only send when something actually changed, or every workspace load costs a
    // handful of redundant identify round-trips.
    const nextTraits = JSON.stringify(traits)
    if (sentCustomerId.current === customerId && sentTraits.current === nextTraits) return
    sentCustomerId.current = customerId
    sentTraits.current = nextTraits

    identifyCustomer(customerId, traits)
  }, [customerId, org, project, isDemo])

  return null
}

export default AnalyticsIdentity
