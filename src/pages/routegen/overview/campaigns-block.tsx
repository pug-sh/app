import { useAtomValue } from 'jotai'
import { Bell, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Campaign } from '@/api/genproto/shared/campaigns/v1/campaigns_pb'
import { campaignsRPCAtom } from '@/api/rpc'
import ProjectLink from '@/components/project-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { tsToDate } from '@/lib/timestamp'

const CampaignsBlock = () => {
  const campaignsRPC = useAtomValue(campaignsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!headers) return
    setLoading(true)
    setError(null)
    try {
      const resp = await campaignsRPC.batchGet({}, { headers })
      setCampaigns(resp.campaigns)
    } catch (err) {
      console.error('campaigns.batchGet failed:', err)
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [campaignsRPC, headers])

  useEffect(() => {
    load()
  }, [load])

  const recent = useMemo(
    () =>
      [...campaigns]
        .sort((a, b) => {
          const at = tsToDate(a.createTime)?.getTime() ?? 0
          const bt = tsToDate(b.createTime)?.getTime() ?? 0
          return bt - at
        })
        .slice(0, 5),
    [campaigns],
  )

  return (
    <div className="rounded-lg bg-background p-4">
      <h3 className="mb-3 text-sm font-semibold">Recent campaigns</h3>
      {loading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : error ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : recent.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <Bell className="mb-2 size-6 opacity-15" />
          <p className="text-xs text-muted-foreground">No campaigns yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {recent.map(campaign => (
            <li key={campaign.id} className="flex items-center justify-between gap-3 py-2">
              <ProjectLink
                href={`/campaigns/${campaign.id}`}
                className="min-w-0 truncate text-sm text-primary hover:underline underline-offset-4"
              >
                {campaign.name || campaign.id}
              </ProjectLink>
              <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wider">
                {campaign.status.toLowerCase()}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default CampaignsBlock
