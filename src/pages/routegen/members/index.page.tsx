import type { OrgInvitation, OrgMember } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { orgsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
        <div className='space-y-6'>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className='w-12' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className='text-center py-8 text-muted-foreground'>
                      <Users className='w-5 h-5 mx-auto mb-2 opacity-40' />
                      <p className='text-sm'>No members</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map(m => (
                    <TableRow key={m.customerId}>
                      <TableCell className='font-medium'>{m.displayName || m.email.split('@')[0]}</TableCell>
                      <TableCell className='text-muted-foreground text-sm'>{m.email}</TableCell>
                      <TableCell>
                        <Badge variant={m.role === 1 ? 'default' : 'secondary'}>
                          {m.role === 1 ? 'Admin' : 'Member'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant='ghost'
                          size='icon-xs'
                          onClick={() => handleRemove(m.customerId)}
                          className='hover:bg-destructive/10 hover:text-destructive'
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {invitations.length > 0 && (
            <div>
              <h2 className='text-sm font-medium mb-3 text-muted-foreground'>Pending invitations</h2>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className='font-medium'>{inv.email}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === 2 ? 'default' : 'secondary'}>
                            {inv.status === 2 ? 'Accepted' : 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs'>{inv.expiresAt}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
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
