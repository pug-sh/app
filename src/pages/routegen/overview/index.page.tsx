import type { Campaign } from '@/api/genproto/shared/campaigns/v1/campaigns_pb'
import { campaignsRPCAtom } from '@/api/rpc'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import Page from '@/components/layout/page'
import NoProject from '@/components/no-project'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Bell, Check, Clock, Copy, Eye, EyeOff, Megaphone, MousePointerClick, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'wouter'

const CopyableCode = ({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) => {
  const { copied, copy } = useCopyToClipboard()
  const [revealed, setRevealed] = useState(!masked)

  const display = revealed ? value : value.slice(0, 8) + '••••••••••••'

  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap align-middle">{label}</td>
      <td className="py-2.5 pr-2 align-middle">
        <code className="text-xs font-mono break-all">{display}</code>
      </td>
      <td className="py-2.5 whitespace-nowrap align-middle">
        <span className="inline-flex gap-0.5">
          {masked && (
            <Button variant="ghost" size="icon-xs" onClick={() => setRevealed(!revealed)}>
              {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={() => copy(value)}>
            {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
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
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await campaignsRPC.batchGet({}, { headers })
      setCampaigns(resp.campaigns)
    } catch (err) {
      console.error('fetchOverview failed:', err)
      setError('Failed to load overview')
    } finally {
      setLoading(false)
    }
  }, [headers, campaignsRPC])

  useEffect(() => {
    if (project) fetchData()
  }, [project, fetchData])

  if (!project) return <NoProject title="Overview" icon={Bell} />

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
    <Page title="Overview" description={`Project: ${project.displayName}`}>
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Bell className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchData()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Stats */}
          <section>
            <SectionHeader title="Campaigns" count={`${campaigns.length} total`} />
            {campaigns.length === 0 ? (
              <div className="py-8 flex flex-col items-center text-center">
                <Megaphone className="w-8 h-8 mb-3 opacity-15" />
                <p className="text-sm text-muted-foreground">No campaigns yet</p>
                <Link
                  href={`/p/${project.id}/campaigns`}
                  className="text-sm text-primary hover:underline underline-offset-4 mt-1"
                >
                  Create your first campaign
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
                {stats.map(stat => (
                  <div key={stat.label} className="flex items-center gap-3">
                    <stat.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* API Keys */}
          <section>
            <SectionHeader title="API Keys" />
            <table className="w-full max-w-xl">
              <tbody>
                <CopyableCode label="Public Key" value={project.publicApiKey} />
                <CopyableCode label="Private Key" value={project.privateApiKey} masked />
              </tbody>
            </table>
          </section>

          {/* Quick Start */}
          <section>
            <SectionHeader title="Quick Start" />
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
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
