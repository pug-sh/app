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
    // Returning from the portal, where the plan can be cancelled, is a tab switch and not a mount.
    const refresh = () => load()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [orgId, load])

  return useAtomValue(billingAtom)
}
