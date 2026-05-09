import { useAtomValue } from 'jotai'
import { Check, Loader2, Plus, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { OrgInvitation, OrgMember } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { orgsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'

const ORG_ROLE_ADMIN = 1
const INVITE_STATUS_ACCEPTED = 2

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('')

const Members = () => {
  const org = useAtomValue(activeOrgAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    if (!org) return
    setLoading(true)
    setError(null)
    const [membersResult, invitesResult] = await Promise.allSettled([
      orgsRPC.listMembers({ orgId: org.id }),
      orgsRPC.listInvitations({ orgId: org.id }),
    ])
    if (membersResult.status === 'fulfilled') {
      setMembers(membersResult.value.members)
    } else {
      console.error('Failed to load members:', membersResult.reason)
    }
    if (invitesResult.status === 'fulfilled') {
      setInvitations(invitesResult.value.invitations)
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
  }, [org, orgsRPC])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleInvite = async () => {
    if (!org || !email.trim()) return
    setInviting(true)
    try {
      await orgsRPC.inviteMember({ orgId: org.id, email })
      setEmail('')
      setShowInvite(false)
      fetchData()
    } catch (err) {
      toastRPCError(err, 'Failed to send invitation')
    } finally {
      setInviting(false)
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
                        <span className="text-[10px] font-medium text-muted-foreground">{initials(name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{m.email}</p>
                      </div>
                      <Badge
                        variant={m.role === ORG_ROLE_ADMIN ? 'default' : 'secondary'}
                        className="text-[10px] shrink-0"
                      >
                        {m.role === ORG_ROLE_ADMIN ? 'Admin' : 'Member'}
                      </Badge>
                      {confirmingRemove === m.customerId ? (
                        <button
                          onClick={() => handleRemove(m.customerId)}
                          className="text-[11px] font-medium text-destructive hover:underline underline-offset-2 cursor-pointer"
                        >
                          Remove?
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmingRemove(m.customerId)}
                          className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive text-muted-foreground cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Inline invite */}
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
                    if (e.key === 'Escape') {
                      setShowInvite(false)
                      setEmail('')
                    }
                  }}
                  className="flex-1"
                  disabled={inviting}
                />
                <button
                  onClick={handleInvite}
                  disabled={inviting || !email.trim()}
                  className="p-1 rounded-md hover:bg-muted text-primary disabled:opacity-50 cursor-pointer"
                >
                  {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => {
                    setShowInvite(false)
                    setEmail('')
                  }}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowInvite(true)
                  setTimeout(() => inputRef.current?.focus(), 0)
                }}
                className="flex items-center gap-3 mt-1 py-2 px-2 -mx-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full border border-dashed border-border flex items-center justify-center shrink-0">
                  <Plus className="w-3 h-3" />
                </div>
                Invite member
              </button>
            )}
          </section>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <section>
              <SectionHeader title="Pending invitations" count={invitations.length} />
              <div className="space-y-0.5">
                {invitations.map(inv => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted/40"
                  >
                    <div className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-medium text-muted-foreground">{initials(inv.email)}</span>
                    </div>
                    <p className="flex-1 text-sm font-mono text-muted-foreground truncate">{inv.email}</p>
                    <Badge
                      variant={inv.status === INVITE_STATUS_ACCEPTED ? 'default' : 'secondary'}
                      className="text-[10px] shrink-0"
                    >
                      {inv.status === INVITE_STATUS_ACCEPTED ? 'Accepted' : 'Pending'}
                    </Badge>
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
