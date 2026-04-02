import type { Campaign } from '@/api/genproto/shared/campaigns/v1/campaigns_pb'
import { campaignsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { useProjectNavigate } from '@/lib/project-path'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { useAtomValue } from 'jotai'
import { ConnectError } from '@connectrpc/connect'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import { useParams } from 'wouter'
import { encodeNotificationData, formatTime, parseNotificationData, statusVariant } from '../campaigns.atoms'

const CampaignDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useProjectNavigate()
  const headers = useAtomValue(projectHeaderAtom)
  const campaignsRPC = useAtomValue(campaignsRPCAtom)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [name, setName] = useState('')
  const [notif, setNotif] = useState({ title: '', body: '', image_url: '', deep_link: '' })
  const [notifParseError, setNotifParseError] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    campaignsRPC
      .get({ id }, { headers })
      .then(resp => {
        const c = resp.campaign
        if (!c) return
        setCampaign(c)
        setName(c.name)
        const { data, parseError } = parseNotificationData(c.notificationData)
        setNotif(data)
        setNotifParseError(parseError)
        if (c.scheduledTime) {
          setScheduledAt(new Date(Number(c.scheduledTime.seconds) * 1000).toISOString().slice(0, 16))
        }
      })
      .catch(err => {
        console.error('Failed to fetch campaign:', err)
        setFetchError(true)
      })
      .finally(() => setLoading(false))
  }, [id, headers, campaignsRPC])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    try {
      await campaignsRPC.update(
        {
          id,
          name,
          notificationData: encodeNotificationData(notif),
          scheduledTime: scheduledAt ? timestampFromDate(new Date(scheduledAt)) : undefined,
        },
        { headers }
      )
      navigate('/campaigns')
    } catch (err) {
      console.error('Campaign save failed:', err)
      toast.error(err instanceof ConnectError ? err.message : 'Failed to save campaign')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Page title='Campaign'>
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      </Page>
    )
  }

  if (!campaign) {
    return (
      <Page title='Campaign'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <p className='text-sm'>{fetchError ? 'Failed to load campaign' : 'Campaign not found'}</p>
          {fetchError && (
            <Button variant='outline' size='sm' className='mt-3' onClick={() => window.location.reload()}>
              Retry
            </Button>
          )}
        </div>
      </Page>
    )
  }

  const readOnly = campaign.status === 'COMPLETED' || campaign.status === 'IN_PROGRESS' || notifParseError

  return (
    <Page title={campaign.name} description={`Campaign ${campaign.id}`}>
      <form onSubmit={handleSave} className='space-y-6 max-w-2xl'>
        <div className='flex items-center gap-3'>
          <Badge variant={statusVariant(campaign.status)}>{campaign.status || 'DRAFT'}</Badge>
          {campaign.createTime && (
            <span className='text-xs text-muted-foreground'>Created {formatTime(campaign.createTime)}</span>
          )}
        </div>

        {notifParseError && (
          <p className='text-xs text-destructive'>
            Notification data could not be parsed. Editing is disabled to prevent data loss.
          </p>
        )}

        <div>
          <div className='flex items-center gap-2 mb-3'>
            <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Details</span>
            <div className='flex-1 h-px bg-border' />
          </div>
          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} disabled={readOnly} />
            </div>
            <div className='space-y-1.5'>
              <Label>Scheduled time</Label>
              <Input
                type='datetime-local'
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                disabled={readOnly}
              />
              <p className='text-xs text-muted-foreground'>Leave empty to save as draft</p>
            </div>
          </div>
        </div>

        <div>
          <div className='flex items-center gap-2 mb-3'>
            <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Notification</span>
            <div className='flex-1 h-px bg-border' />
          </div>
          <p className='text-xs text-muted-foreground mb-3'>The push notification content sent to devices</p>
          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <Label>Title</Label>
              <Input
                placeholder='e.g. Welcome!'
                value={notif.title}
                onChange={e => setNotif({ ...notif, title: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Body</Label>
              <Textarea
                className='min-h-[80px]'
                placeholder='Notification body text...'
                value={notif.body}
                onChange={e => setNotif({ ...notif, body: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Image URL</Label>
              <Input
                type='url'
                placeholder='https://...'
                value={notif.image_url}
                onChange={e => setNotif({ ...notif, image_url: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Deep link</Label>
              <Input
                placeholder='myapp://screen/123'
                value={notif.deep_link}
                onChange={e => setNotif({ ...notif, deep_link: e.target.value })}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        {!readOnly && (
          <div className='flex gap-2'>
            <Button type='submit' disabled={saving || !name.trim()}>
              {saving ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
              Save campaign
            </Button>
            <Button type='button' variant='outline' onClick={() => navigate('/campaigns')}>
              Cancel
            </Button>
          </div>
        )}
      </form>
    </Page>
  )
}

export default CampaignDetail
