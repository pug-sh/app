import type { Campaign } from '@/api/genproto/shared/campaigns/v1/campaigns_pb'
import { campaignsRPCAtom } from '@/api/rpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Page from '@/components/layout/page'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { Bell, Check, Clock, Copy, Eye, EyeOff, Loader2, MousePointerClick, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

const CopyableCode = ({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) => {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(!masked)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const display = revealed ? value : value.slice(0, 8) + '••••••••••••'

  return (
    <div>
      <p className='text-xs font-medium text-muted-foreground mb-1'>{label}</p>
      <div className='flex items-center gap-1'>
        <code className='text-xs bg-muted px-2.5 py-1.5 rounded-md flex-1 font-mono break-all'>{display}</code>
        {masked && (
          <Button variant='ghost' size='icon-xs' onClick={() => setRevealed(!revealed)}>
            {revealed ? <EyeOff className='w-3 h-3' /> : <Eye className='w-3 h-3' />}
          </Button>
        )}
        <Button variant='ghost' size='icon-xs' onClick={handleCopy}>
          {copied ? <Check className='w-3 h-3 text-green-600' /> : <Copy className='w-3 h-3' />}
        </Button>
      </div>
    </div>
  )
}

const Overview = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const campaignsRPC = useAtomValue(campaignsRPCAtom)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await campaignsRPC.batchGet({}, { headers })
      setCampaigns(resp.campaigns)
    } catch (err) {
      console.error('fetchOverview failed:', err)
    } finally {
      setLoading(false)
    }
  }, [headers, campaignsRPC])

  useEffect(() => {
    if (project) fetchData()
  }, [project, fetchData])

  if (!project) {
    return (
      <Page title='Overview'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <Bell className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project to get started</p>
        </div>
      </Page>
    )
  }

  const scheduled = campaigns.filter(c => c.status === 'SCHEDULED').length
  const completed = campaigns.filter(c => c.status === 'COMPLETED').length
  const inProgress = campaigns.filter(c => c.status === 'IN_PROGRESS').length

  const stats = [
    { label: 'Total campaigns', value: campaigns.length, icon: Bell },
    { label: 'Scheduled', value: scheduled, icon: Clock },
    { label: 'In progress', value: inProgress, icon: Send },
    { label: 'Completed', value: completed, icon: MousePointerClick },
  ]

  return (
    <Page title='Overview' description={`Project: ${project.displayName}`}>
      {loading ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : (
        <>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8'>
            {stats.map(stat => (
              <Card key={stat.label}>
                <CardHeader className='flex flex-row items-center justify-between pb-2 space-y-0'>
                  <CardTitle className='text-sm font-medium text-muted-foreground'>{stat.label}</CardTitle>
                  <stat.icon className='w-4 h-4 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <p className='text-3xl font-semibold tracking-tight'>{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>API Keys</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <CopyableCode label='Public Key' value={project.publicApiKey} />
                <CopyableCode label='Private Key' value={project.privateApiKey} masked />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Quick Start</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className='text-sm text-muted-foreground space-y-2.5 list-decimal list-inside'>
                  <li>Add your FCM service account JSON in Settings</li>
                  <li>Integrate the Cotton SDK in your app</li>
                  <li>Register devices using the public API key</li>
                  <li>Create and schedule your first campaign</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </Page>
  )
}

export default Overview
