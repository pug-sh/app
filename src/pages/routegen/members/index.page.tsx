import type { OrgInvitation, OrgMember } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { orgsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { Check, Loader2, Plus, Trash2, Users, X } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'

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
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    if (!org) return
    setLoading(true)
    try {
      const [membersResp, invitesResp] = await Promise.all([
        orgsRPC.listMembers({ orgId: org.id }),
        orgsRPC.listInvitations({ orgId: org.id }),
      ])
      setMembers(membersResp.members)
      setInvitations(invitesResp.invitations)
    } finally {
      setLoading(false)
    }
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
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (customerId: string) => {
    if (!org) return
    await orgsRPC.removeMember({ orgId: org.id, customerId })
    fetchData()
  }

  if (!org) {
    return (
      <Page title='Members'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <Users className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select an organization first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title='Members' description={`Manage members of ${org.displayName}`}>
      {loading ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : (
        <div className='space-y-8'>
          {/* Members */}
          <section>
            <div className='flex items-center gap-2 mb-2'>
              <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Members</span>
              <div className='flex-1 h-px bg-border' />
              <span className='text-[10px] text-muted-foreground'>{members.length}</span>
            </div>

            {members.length > 0 && (
              <div className='space-y-0.5'>
                {members.map(m => {
                  const name = m.displayName || m.email.split('@')[0]
                  return (
                    <div
                      key={m.customerId}
                      className='group flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted/40'
                    >
                      <div className='w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0'>
                        <span className='text-[10px] font-medium text-muted-foreground'>{initials(name)}</span>
                      </div>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm font-medium truncate'>{name}</p>
                        <p className='text-xs text-muted-foreground font-mono truncate'>{m.email}</p>
                      </div>
                      <Badge variant={m.role === 1 ? 'default' : 'secondary'} className='text-[10px] shrink-0'>
                        {m.role === 1 ? 'Admin' : 'Member'}
                      </Badge>
                      <button
                        onClick={() => handleRemove(m.customerId)}
                        className='p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive text-muted-foreground cursor-pointer'
                      >
                        <Trash2 className='w-3.5 h-3.5' />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Inline invite */}
            {showInvite ? (
              <div className='flex items-center gap-2 mt-1 pl-2'>
                <div className='w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center shrink-0'>
                  <Plus className='w-3 h-3 text-muted-foreground' />
                </div>
                <Input
                  ref={inputRef}
                  type='email'
                  placeholder='colleague@company.com'
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleInvite()
                    if (e.key === 'Escape') {
                      setShowInvite(false)
                      setEmail('')
                    }
                  }}
                  className='flex-1'
                  disabled={inviting}
                />
                <button
                  onClick={handleInvite}
                  disabled={inviting || !email.trim()}
                  className='p-1 rounded-md hover:bg-muted text-primary disabled:opacity-50 cursor-pointer'
                >
                  {inviting ? (
                    <Loader2 className='w-3.5 h-3.5 animate-spin' />
                  ) : (
                    <Check className='w-3.5 h-3.5' />
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowInvite(false)
                    setEmail('')
                  }}
                  className='p-1 rounded-md hover:bg-muted text-muted-foreground cursor-pointer'
                >
                  <X className='w-3.5 h-3.5' />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowInvite(true)
                  setTimeout(() => inputRef.current?.focus(), 0)
                }}
                className='flex items-center gap-3 mt-1 py-2 px-2 -mx-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer'
              >
                <div className='w-7 h-7 rounded-full border border-dashed border-border flex items-center justify-center shrink-0'>
                  <Plus className='w-3 h-3' />
                </div>
                Invite member
              </button>
            )}
          </section>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <section>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                  Pending invitations
                </span>
                <div className='flex-1 h-px bg-border' />
                <span className='text-[10px] text-muted-foreground'>{invitations.length}</span>
              </div>
              <div className='space-y-0.5'>
                {invitations.map(inv => (
                  <div
                    key={inv.id}
                    className='flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted/40'
                  >
                    <div className='w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center shrink-0'>
                      <span className='text-[10px] font-medium text-muted-foreground'>
                        {initials(inv.email)}
                      </span>
                    </div>
                    <p className='flex-1 text-sm font-mono text-muted-foreground truncate'>{inv.email}</p>
                    <Badge variant={inv.status === 2 ? 'default' : 'secondary'} className='text-[10px] shrink-0'>
                      {inv.status === 2 ? 'Accepted' : 'Pending'}
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
