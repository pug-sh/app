import type { Campaign } from '@/api/genproto/shared/campaigns/v1/campaigns_pb'
import { campaignsRPCAtom } from '@/api/rpc'
import LoadingSpinner from '@/components/loading-spinner'
import Page from '@/components/layout/page'
import NoProject from '@/components/no-project'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import ProjectLink from '@/components/project-link'
import { useProjectNavigate } from '@/lib/project-path'
import { useAtomValue } from 'jotai'
import { ConnectError } from '@connectrpc/connect'
import { Check, Loader2, Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { formatTime, statusVariant } from './campaigns.atoms'

const Campaigns = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const campaignsRPC = useAtomValue(campaignsRPCAtom)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [creatingInline, setCreatingInline] = useState(false)
  const navigate = useProjectNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await campaignsRPC.batchGet({}, { headers })
      setCampaigns(resp.campaigns)
    } catch (err) {
      console.error('fetchCampaigns failed:', err)
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [campaignsRPC, headers])

  useEffect(() => {
    if (project) fetchCampaigns()
  }, [project, fetchCampaigns])

  useEffect(() => {
    if (creatingInline) {
      inputRef.current?.focus()
    }
  }, [creatingInline])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const resp = await campaignsRPC.create({ name: newName }, { headers })
      setNewName('')
      setCreatingInline(false)
      await fetchCampaigns()
      if (resp.campaign) navigate(`/campaigns/${resp.campaign.id}`)
    } catch (err) {
      console.error('Campaign create failed:', err)
      toast.error(err instanceof ConnectError ? err.message : 'Failed to create campaign')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await campaignsRPC.delete({ id }, { headers })
      await fetchCampaigns()
    } catch (err) {
      console.error('Campaign delete failed:', err)
      toast.error(err instanceof ConnectError ? err.message : 'Failed to delete campaign')
    }
  }

  if (!project) return <NoProject title='Campaigns' icon={Megaphone} />

  return (
    <Page
      title='Campaigns'
      description='Manage push notification campaigns'
      actions={
        !creatingInline && (
          <Button onClick={() => setCreatingInline(true)} size='sm'>
            <Plus className='w-4 h-4' />
            New campaign
          </Button>
        )
      }
    >
      {creatingInline && (
        <div className='flex items-center gap-2 mb-4'>
          <Input
            ref={inputRef}
            placeholder='Campaign name, e.g. Welcome new users'
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') {
                setCreatingInline(false)
                setNewName('')
              }
            }}
            disabled={creating}
            className='max-w-sm'
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className='p-1.5 rounded-md hover:bg-muted text-primary disabled:opacity-50 cursor-pointer'
          >
            {creating ? <Loader2 className='w-4 h-4 animate-spin' /> : <Check className='w-4 h-4' />}
          </button>
          <button
            onClick={() => {
              setCreatingInline(false)
              setNewName('')
            }}
            disabled={creating}
            className='p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-50 cursor-pointer'
          >
            <X className='w-4 h-4' />
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className='flex flex-col items-center justify-center py-16'>
          <Megaphone className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>{error}</p>
          <Button variant='outline' size='sm' className='mt-2' onClick={() => fetchCampaigns()}>
            Retry
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-16'>
          <Megaphone className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>No campaigns yet</p>
          <p className='text-xs text-muted-foreground mb-4'>
            Create your first campaign to start sending notifications
          </p>
          {!creatingInline && (
            <Button onClick={() => setCreatingInline(true)} size='sm'>
              <Plus className='w-4 h-4' />
              New campaign
            </Button>
          )}
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
    </Page>
  )
}

export default Campaigns
