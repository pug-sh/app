import type { Campaign } from '@/api/genproto/shared/campaigns/v1/campaigns_pb'
import { campaignsRPCAtom } from '@/api/rpc'
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
    <tr className='border-b border-border/50'>
      <td className='py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap align-middle'>{label}</td>
      <td className='py-2.5 pr-2 align-middle'>
        <code className='text-xs font-mono break-all'>{display}</code>
      </td>
      <td className='py-2.5 whitespace-nowrap align-middle'>
        <span className='inline-flex gap-0.5'>
          {masked && (
            <Button variant='ghost' size='icon-xs' onClick={() => setRevealed(!revealed)}>
              {revealed ? <EyeOff className='w-3 h-3' /> : <Eye className='w-3 h-3' />}
            </Button>
          )}
          <Button variant='ghost' size='icon-xs' onClick={handleCopy}>
            {copied ? <Check className='w-3 h-3 text-green-600' /> : <Copy className='w-3 h-3' />}
          </Button>
        </span>
      </td>
    </tr>
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
        <div className='space-y-8'>
          {/* Stats */}
          <section>
            <div className='flex items-center gap-2 mb-4'>
              <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Campaigns</span>
              <div className='flex-1 h-px bg-border' />
              <span className='text-[10px] text-muted-foreground'>{campaigns.length} total</span>
            </div>
            <div className='grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4'>
              {stats.map(stat => (
                <div key={stat.label} className='flex items-center gap-3'>
                  <stat.icon className='w-4 h-4 text-muted-foreground shrink-0' />
                  <div>
                    <p className='text-2xl font-semibold tabular-nums'>{stat.value}</p>
                    <p className='text-[10px] text-muted-foreground'>{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* API Keys */}
          <section>
            <div className='flex items-center gap-2 mb-2'>
              <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>API Keys</span>
              <div className='flex-1 h-px bg-border' />
            </div>
            <table className='w-full max-w-xl'>
              <tbody>
                <CopyableCode label='Public Key' value={project.publicApiKey} />
                <CopyableCode label='Private Key' value={project.privateApiKey} masked />
              </tbody>
            </table>
          </section>

          {/* Quick Start */}
          <section>
            <div className='flex items-center gap-2 mb-3'>
              <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Quick Start</span>
              <div className='flex-1 h-px bg-border' />
            </div>
            <ol className='text-sm text-muted-foreground space-y-2 list-decimal list-inside'>
              <li>Add your FCM service account JSON in Settings</li>
              <li>Integrate the Cotton SDK in your app</li>
              <li>Register devices using the public API key</li>
              <li>Create and schedule your first campaign</li>
            </ol>
          </section>
        </div>
      )}
    </Page>
  )
}

export default Overview
