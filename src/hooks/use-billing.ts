import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { billingAtom, loadBillingAtom } from '@/data/billing.atoms'
import { activeOrgAtom } from '@/data/workspace.atoms'

// Keyed on the org: a switch has to re-ask, and the sidebar meter never unmounts to notice.
export const useBilling = () => {
  const orgId = useAtomValue(activeOrgAtom)?.id
  const load = useSetAtom(loadBillingAtom)

  useEffect(() => {
    if (!orgId) return
    load()
    // Returning from the portal is a tab switch, not a mount. Forced, or the 60s cache swallows the
    // one round trip this exists for.
    const refresh = () => load({ force: true })
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [orgId, load])

  return useAtomValue(billingAtom)
}
