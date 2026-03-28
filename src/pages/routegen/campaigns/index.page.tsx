import { campaignsRPCAtom } from '@/api/rpc'
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
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import ProjectLink from '@/components/project-link'
import { useProjectNavigate } from '@/lib/project-path'
import { useAtomValue } from 'jotai'
import { useAtom } from 'jotai'
import { Loader2, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { campaignsAtom, formatTime, statusVariant } from './campaigns.atoms'

const Campaigns = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const campaignsRPC = useAtomValue(campaignsRPCAtom)
  const [campaigns, setCampaigns] = useAtom(campaignsAtom)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useProjectNavigate()

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await campaignsRPC.batchGet({}, { headers })
      setCampaigns(resp.campaigns)
    } catch (err) {
      console.error('fetchCampaigns failed:', err)
    } finally {
      setLoading(false)
    }
  }, [campaignsRPC, headers, setCampaigns])

  useEffect(() => {
    if (project) fetchCampaigns()
  }, [project, fetchCampaigns])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const resp = await campaignsRPC.create({ name: newName }, { headers })
      setNewName('')
      setDialogOpen(false)
      await fetchCampaigns()
      if (resp.campaign) navigate(`/campaigns/${resp.campaign.id}`)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await campaignsRPC.delete({ id }, { headers })
    fetchCampaigns()
  }

  if (!project) {
    return (
      <Page title='Campaigns'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <Megaphone className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page
      title='Campaigns'
      description='Manage push notification campaigns'
      actions={
        <Button onClick={() => setDialogOpen(true)} size='sm'>
          <Plus className='w-4 h-4' />
          New campaign
        </Button>
      }
    >
      {loading ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : campaigns.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-16'>
          <Megaphone className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>No campaigns yet</p>
          <p className='text-xs text-muted-foreground mb-4'>
            Create your first campaign to start sending notifications
          </p>
          <Button onClick={() => setDialogOpen(true)} size='sm'>
            <Plus className='w-4 h-4' />
            New campaign
          </Button>
        </div>
      ) : (
        <table className='w-full'>
          <thead>
            <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
              <th className='py-2 pr-2 text-left font-medium'>Name</th>
              <th className='py-2 pr-2 text-left font-medium'>Status</th>
              <th className='py-2 pr-2 text-left font-medium'>Scheduled</th>
              <th className='py-2 pr-2 text-left font-medium'>Created</th>
              <th className='py-2 w-20' />
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} className='group border-b border-border/50 transition-colors hover:bg-muted/40'>
                <td className='py-2.5 pr-2 text-sm font-medium'>
                  <ProjectLink href={`/campaigns/${c.id}`} className='text-primary hover:underline underline-offset-4'>
                    {c.name}
                  </ProjectLink>
                </td>
                <td className='py-2.5 pr-2'>
                  <Badge variant={statusVariant(c.status)} className='text-[11px]'>
                    {c.status || 'DRAFT'}
                  </Badge>
                </td>
                <td className='py-2.5 pr-2 text-xs text-muted-foreground'>{formatTime(c.scheduledTime)}</td>
                <td className='py-2.5 pr-2 text-xs text-muted-foreground'>{formatTime(c.createTime)}</td>
                <td className='py-2.5'>
                  <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                    <Button variant='ghost' size='icon-xs' render={<ProjectLink href={`/campaigns/${c.id}`} />}>
                      <Pencil className='w-3.5 h-3.5' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon-xs'
                      onClick={e => handleDelete(e, c.id)}
                      className='hover:bg-destructive/10 hover:text-destructive'
                    >
                      <Trash2 className='w-3.5 h-3.5' />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>Create a new push notification campaign</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className='space-y-4'>
            <div className='space-y-1.5'>
              <Label>Campaign name</Label>
              <Input
                placeholder='e.g. Welcome new users'
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type='submit' disabled={creating || !newName.trim()}>
                {creating && <Loader2 className='animate-spin' />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  )
}

export default Campaigns
