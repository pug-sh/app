import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { billingAtom, loadBillingAtom } from '@/data/billing.atoms'
import { activeOrgAtom } from '@/data/workspace.atoms'

// Keyed on the org rather than fetched once on mount: switching org has to re-ask, and the sidebar
// meter never unmounts to notice on its own.
export const useBilling = () => {
  const orgId = useAtomValue(activeOrgAtom)?.id
  const load = useSetAtom(loadBillingAtom)

  useEffect(() => {
    if (!orgId) return
    load()
    // Coming back from the provider's portal — where the plan can be cancelled — is a tab switch,
    // not a mount. The load dedupes on age, so alt-tabbing costs nothing.
    const refresh = () => load()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [orgId, load])

  return useAtomValue(billingAtom)
}
