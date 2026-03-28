import type { OrgInvitation, OrgMember } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { orgsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { Loader2, Mail, Plus, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

const Members = () => {
  const org = useAtomValue(activeOrgAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org || !email.trim()) return
    setInviting(true)
    try {
      await orgsRPC.inviteMember({ orgId: org.id, email })
      setEmail('')
      setDialogOpen(false)
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
    <Page
      title='Members'
      description={`Manage members of ${org.displayName}`}
      actions={
        <Button onClick={() => setDialogOpen(true)} size='sm'>
          <Plus className='w-4 h-4' />
          Invite member
        </Button>
      }
    >
      {loading ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : (
        <div className='space-y-8'>
          {members.length > 0 ? (
            <table className='w-full'>
              <thead>
                <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
                  <th className='py-2 pr-2 text-left font-medium'>Member</th>
                  <th className='py-2 pr-2 text-left font-medium'>Email</th>
                  <th className='py-2 pr-2 text-left font-medium'>Role</th>
                  <th className='py-2 w-8' />
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.customerId} className='group border-b border-border/50 transition-colors hover:bg-muted/40'>
                    <td className='py-2.5 pr-2 text-sm font-medium'>
                      {m.displayName || m.email.split('@')[0]}
                    </td>
                    <td className='py-2.5 pr-2 text-sm text-muted-foreground font-mono'>
                      {m.email}
                    </td>
                    <td className='py-2.5 pr-2'>
                      <Badge variant={m.role === 1 ? 'default' : 'secondary'} className='text-[11px]'>
                        {m.role === 1 ? 'Admin' : 'Member'}
                      </Badge>
                    </td>
                    <td className='py-2.5'>
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        onClick={() => handleRemove(m.customerId)}
                        className='opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive'
                      >
                        <Trash2 className='w-3.5 h-3.5' />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className='flex flex-col items-center justify-center py-16'>
              <Users className='w-10 h-10 mb-4 opacity-15' />
              <p className='text-sm font-medium mb-1'>No members</p>
              <p className='text-xs text-muted-foreground'>Invite someone to get started</p>
            </div>
          )}

          {invitations.length > 0 && (
            <div>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                  Pending invitations
                </span>
                <div className='flex-1 h-px bg-border' />
                <span className='text-[10px] text-muted-foreground'>{invitations.length}</span>
              </div>
              <table className='w-full'>
                <thead>
                  <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
                    <th className='py-2 pr-2 text-left font-medium'>Email</th>
                    <th className='py-2 pr-2 text-left font-medium'>Status</th>
                    <th className='py-2 pr-2 text-left font-medium'>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map(inv => (
                    <tr key={inv.id} className='border-b border-border/50 transition-colors hover:bg-muted/40'>
                      <td className='py-2.5 pr-2 text-sm font-mono'>{inv.email}</td>
                      <td className='py-2.5 pr-2'>
                        <Badge variant={inv.status === 2 ? 'default' : 'secondary'} className='text-[11px]'>
                          {inv.status === 2 ? 'Accepted' : 'Pending'}
                        </Badge>
                      </td>
                      <td className='py-2.5 pr-2 text-xs text-muted-foreground'>{inv.expiresAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>Send an invitation to join {org.displayName}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className='space-y-4'>
            <div className='space-y-1.5'>
              <Label>Email address</Label>
              <div className='relative'>
                <Mail className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
                <Input
                  type='email'
                  className='pl-9'
                  placeholder='colleague@company.com'
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type='submit' disabled={inviting || !email.trim()}>
                {inviting && <Loader2 className='animate-spin' />}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  )
}

export default Members
