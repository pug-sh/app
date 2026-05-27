import { useAtomValue } from 'jotai'
import { Loader2, User } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Profile } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { profilesRPCAtom } from '@/api/rpc'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { tsToDate } from '@/lib/timestamp'

const formatRelative = (date: Date | null) => {
  if (!date) return '—'
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

const ProfilesBlock = () => {
  const profilesRPC = useAtomValue(profilesRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!headers) return
    setLoading(true)
    setError(null)
    try {
      for await (const resp of profilesRPC.list({ pageToken: '' }, { headers })) {
        setProfiles(resp.profiles.slice(0, 10))
        break
      }
    } catch (err) {
      console.error('profiles.list failed:', err)
      setError('Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }, [headers, profilesRPC])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <h3 className="mb-3 text-sm font-semibold">Recent profiles</h3>
      {loading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : error ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : profiles.length === 0 ? (
        <p className="text-xs text-muted-foreground">No profiles yet.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {profiles.map(profile => (
            <li key={profile.id} className="group flex items-center justify-between gap-3 py-2">
              <ProjectLink
                href={`/profiles/${encodeURIComponent(profile.id)}/events`}
                className="flex min-w-0 items-center gap-2 text-xs text-primary hover:underline underline-offset-4"
              >
                <User className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono">{profile.externalId || profile.id}</span>
              </ProjectLink>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatRelative(tsToDate(profile.activity?.lastSeen))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ProfilesBlock
