import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { type Action, canAtom, type Resource } from './permissions'

// Imperative form — for disabling or branching: `const can = useCan(); can('create', 'project')`.
export const useCan = () => useAtomValue(canAtom)

// Declarative form — for showing/hiding. Renders `children` when the active-org role permits
// (action, resource), otherwise `fallback` (nothing by default).
//
//   <Can action='create' resource='invitation'>
//     <InviteButton />
//   </Can>
export const Can = ({
  action,
  resource,
  children,
  fallback = null,
}: {
  action: Action
  resource: Resource
  children: ReactNode
  fallback?: ReactNode
}) => (useCan()(action, resource) ? <>{children}</> : <>{fallback}</>)
