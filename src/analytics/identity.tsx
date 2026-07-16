import { useAtomValue } from 'jotai'
import { useEffect, useRef } from 'react'
import { isDemoSessionAtom } from '@/auth/demo'
import { jwtDataAtom } from '@/auth/jwt.atoms'
import { roleLabel } from '@/auth/permissions'
import { activeOrgAtom, activeProjectAtom, workspaceSettledAtom } from '@/data/workspace.atoms'
import { type CustomerTraits, identifyCustomer, resetIdentity } from './pug'

// Keeps the SDK's identity in step with the session. Mounted from App.tsx alongside ThemeSync,
// which is the pattern for a null-rendering effect that syncs a module to atom state.
//
// awaitWorkspace says whether WorkspaceBootstrap is mounted and therefore whether org/project are
// still on their way. It has to be told: a workspace that hasn't started and one that will never
// start look identical from the atoms (both 'idle'), and the difference is a routing fact App
// already knows. False is the shared-dashboard route — nothing is coming, so identify immediately
// with whatever traits exist (none).
//
// A prop rather than an atom WorkspaceBootstrap sets on mount, and that's not a shortcut: this
// component renders first (App.tsx), so its effect would run before any such atom was written, read
// "no bootstrap coming", and identify on the spot — the very thing the gate below exists to stop. A
// prop is known at render time; an effect-written atom isn't.
const AnalyticsIdentity = ({ awaitWorkspace }: { awaitWorkspace: boolean }) => {
  const customerId = useAtomValue(jwtDataAtom)?.customerId
  const org = useAtomValue(activeOrgAtom)
  const project = useAtomValue(activeProjectAtom)
  const isDemo = useAtomValue(isDemoSessionAtom)
  const workspaceSettled = useAtomValue(workspaceSettledAtom)

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
    // otherwise, so without this the new user inherits the previous user's session. Ahead of the
    // settle gate below on purpose: track() stamps the distinct ID at call time, so waiting for the
    // new workspace would bill the new user's first events to the account they just left.
    if (sentCustomerId.current && sentCustomerId.current !== customerId) {
      resetIdentity()
      sentCustomerId.current = null
      sentTraits.current = null
    }

    // Bootstrap resolves the org, then the project, a render apart. Each of those states is a real
    // change, so the dedup below — which only catches *repeats* — would let every one of them send.
    // Wait for the traits to stop moving and state them once.
    //
    // Nothing is lost by waiting. A device that has identified before resolves its distinct ID from
    // the stored external ID, so its events carry the customer either way; a first-time one stamps
    // the anonymous ID, which the first identify hands to the server to merge. A session that ends
    // before this fires is absorbed by the next one.
    if (awaitWorkspace && !workspaceSettled) return

    const traits: CustomerTraits = {
      ...(org && { orgId: org.id, orgName: org.displayName, role: roleLabel(org.role) }),
      ...(project && { projectId: project.id, projectName: project.displayName }),
    }

    // Renames and org/project switches still land here as genuine changes; this only skips resends
    // of traits the server already has.
    const nextTraits = JSON.stringify(traits)
    if (sentCustomerId.current === customerId && sentTraits.current === nextTraits) return
    sentCustomerId.current = customerId
    sentTraits.current = nextTraits

    identifyCustomer(customerId, traits)
  }, [customerId, org, project, isDemo, awaitWorkspace, workspaceSettled])

  return null
}

export default AnalyticsIdentity
