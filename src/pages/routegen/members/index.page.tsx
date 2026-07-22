import { useAtomValue } from 'jotai'
import { Check, History, Loader2, Plus, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { InvitationStatus, type OrgInvitation, type OrgMember, OrgRole } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { orgsRPCAtom } from '@/api/rpc'
import { Can, useCan } from '@/auth/can'
import { customerIdAtom } from '@/auth/jwt.atoms'
import { roleLabel } from '@/auth/permissions'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'

const omitKey = <T,>(obj: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _, ...rest } = obj
  return rest
}

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('')

const Members = () => {
  const org = useAtomValue(activeOrgAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const myCustomerId = useAtomValue(customerIdAtom)
  const can = useCan()
  const canEditRole = can('update', 'member')
  const [members, setMembers] = useState<OrgMember[]>([])
  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>(OrgRole.MEMBER)
  const [inviting, setInviting] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [roleStatus, setRoleStatus] = useState<Record<string, 'saving' | 'saved'>>({})
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    if (!org) return
    setLoading(true)
    setError(null)
    // Invitations are admin-only (invitation:read) — a plain member would get
    // PermissionDenied, so skip the call entirely instead of toasting an error.
    const canReadInvites = can('read', 'invitation')
    const [membersResult, invitesResult] = await Promise.allSettled([
      orgsRPC.listMembers({ orgId: org.id }),
      canReadInvites ? orgsRPC.listInvitations({ orgId: org.id }) : Promise.resolve(undefined),
    ])
    if (membersResult.status === 'fulfilled') {
      setMembers(membersResult.value.members)
    } else {
      console.error('Failed to load members:', membersResult.reason)
    }
    if (invitesResult.status === 'fulfilled') {
      setInvitations(invitesResult.value?.invitations ?? [])
    } else {
      console.error('Failed to load invitations:', invitesResult.reason)
    }
    if (membersResult.status === 'rejected' && invitesResult.status === 'rejected') {
      setError('Failed to load members')
    } else if (membersResult.status === 'rejected') {
      setError('Failed to load members list')
    } else if (invitesResult.status === 'rejected') {
      toast.error('Failed to load invitations')
    }
    setLoading(false)
  }, [org, orgsRPC, can])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const closeInvite = () => {
    setShowInvite(false)
    setEmail('')
    setInviteRole(OrgRole.MEMBER)
  }

  const pendingInvitations = invitations.filter(inv => inv.status !== InvitationStatus.ACCEPTED)

  const handleInvite = async () => {
    if (!org || !email.trim()) return
    setInviting(true)
    try {
      await orgsRPC.inviteMember({ orgId: org.id, email, role: inviteRole })
      closeInvite()
      fetchData()
    } catch (err) {
      toastRPCError(err, 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (customerId: string, role: OrgRole) => {
    if (!org) return
    const prev = members
    setMembers(ms => ms.map(m => (m.customerId === customerId ? { ...m, role } : m)))
    setRoleStatus(s => ({ ...s, [customerId]: 'saving' }))
    try {
      await orgsRPC.updateMemberRole({ orgId: org.id, customerId, role })
      setRoleStatus(s => ({ ...s, [customerId]: 'saved' }))
      // Clear the check after a beat — but only if a newer change hasn't put this
      // row back into 'saving', so a stale timer can't wipe an in-flight save.
      setTimeout(() => setRoleStatus(s => (s[customerId] === 'saved' ? omitKey(s, customerId) : s)), 1500)
    } catch (err) {
      setMembers(prev)
      setRoleStatus(s => omitKey(s, customerId))
      toastRPCError(err, 'Failed to update role')
    }
  }

  const handleResend = async (invitationId: string) => {
    if (!org) return
    setResending(invitationId)
    try {
      await orgsRPC.resendInvite({ orgId: org.id, invitationId })
      toast.success('Invitation resent')
    } catch (err) {
      toastRPCError(err, 'Failed to resend invitation')
    } finally {
      setResending(null)
    }
  }

  const handleRemove = async (customerId: string) => {
    if (!org) return
    try {
      await orgsRPC.removeMember({ orgId: org.id, customerId })
      fetchData()
    } catch (err) {
      toastRPCError(err, 'Failed to remove member')
    }
  }

  if (!org) {
    return (
      <Page title="Members">
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Users className="w-8 h-8 mb-3 opacity-20" />
          <p className="text-sm">Select an organization first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Members" description={`Manage members of ${org.displayName}`}>
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Users className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchData()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Members */}
          <section>
            <SectionHeader title="Members" count={members.length} />

            {members.length > 0 && (
              <div className="space-y-0.5">
                {members.map(m => {
                  const name = m.displayName || m.email.split('@')[0]
                  return (
                    <div
                      key={m.customerId}
                      className="group flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted/40"
                      onMouseLeave={() => setConfirmingRemove(null)}
                    >
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-muted-foreground">{initials(name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{m.email}</p>
                      </div>
                      {canEditRole && m.customerId !== myCustomerId ? (
                        <Select value={m.role} onValueChange={v => handleRoleChange(m.customerId, v ?? m.role)}>
                          <SelectTrigger size="sm" className="shrink-0">
                            <SelectValue>{v => roleLabel(v ?? m.role)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-0 p-1">
                            <SelectItem value={OrgRole.VIEWER}>Viewer</SelectItem>
                            <SelectItem value={OrgRole.MEMBER}>Member</SelectItem>
                            <SelectItem value={OrgRole.ADMIN}>Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant={m.role === OrgRole.ADMIN ? 'default' : 'secondary'}
                          className="text-xs shrink-0"
                        >
                          {roleLabel(m.role)}
                        </Badge>
                      )}
                      {roleStatus[m.customerId] && (
                        <span className="shrink-0 w-3.5 flex items-center justify-center">
                          {roleStatus[m.customerId] === 'saving' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-positive" />
                          )}
                        </span>
                      )}
                      <Can action="delete" resource="member">
                        {confirmingRemove === m.customerId ? (
                          <button
                            onClick={() => handleRemove(m.customerId)}
                            className="text-xs font-medium text-negative hover:underline underline-offset-2"
                          >
                            Remove?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmingRemove(m.customerId)}
                            className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-negative text-muted-foreground"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </Can>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Inline invite */}
            <Can action="create" resource="invitation">
              {showInvite ? (
                <div className="flex items-center gap-2 mt-1 pl-2">
                  <div className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                    <Plus className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <Input
                    ref={inputRef}
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleInvite()
                      if (e.key === 'Escape') closeInvite()
                    }}
                    className="flex-1"
                    disabled={inviting}
                  />
                  <Select
                    value={inviteRole}
                    onValueChange={v => setInviteRole(v ?? OrgRole.MEMBER)}
                    disabled={inviting}
                  >
                    <SelectTrigger className="shrink-0">
                      <SelectValue>{v => roleLabel(v ?? OrgRole.MEMBER)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-0 p-1">
                      <SelectItem value={OrgRole.VIEWER}>Viewer</SelectItem>
                      <SelectItem value={OrgRole.MEMBER}>Member</SelectItem>
                      <SelectItem value={OrgRole.ADMIN}>Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    onClick={handleInvite}
                    disabled={inviting || !email.trim()}
                    className="p-1 rounded-md hover:bg-muted text-link disabled:opacity-50"
                  >
                    {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={closeInvite} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setShowInvite(true)
                    setTimeout(() => inputRef.current?.focus(), 0)
                  }}
                  className="flex items-center gap-3 mt-1 py-2 px-2 -mx-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full border border-dashed border-border flex items-center justify-center shrink-0">
                    <Plus className="w-3 h-3" />
                  </div>
                  Invite member
                </button>
              )}
            </Can>
          </section>

          {/* Pending invitations */}
          {pendingInvitations.length > 0 && (
            <section>
              <SectionHeader title="Pending invitations" count={pendingInvitations.length} />
              <div className="space-y-0.5">
                {pendingInvitations.map(inv => (
                  <div
                    key={inv.id}
                    className="group flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted/40"
                  >
                    <div className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-muted-foreground">{initials(inv.email)}</span>
                    </div>
                    <p className="flex-1 text-sm font-mono text-muted-foreground truncate">{inv.email}</p>
                    <Badge variant={inv.role === OrgRole.ADMIN ? 'default' : 'secondary'} className="text-xs shrink-0">
                      {roleLabel(inv.role)}
                    </Badge>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      Pending
                    </Badge>
                    <Can action="update" resource="invitation">
                      <button
                        onClick={() => handleResend(inv.id)}
                        disabled={resending === inv.id}
                        className={`p-1 rounded-md transition-opacity hover:bg-muted text-muted-foreground hover:text-foreground ${
                          resending === inv.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title="Resend invitation"
                      >
                        {resending === inv.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <History className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </Can>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Page>
  )
}

export default Members
