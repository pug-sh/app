import type { Profile } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { profilesRPCAtom } from '@/api/rpc'
import LoadingSpinner from '@/components/loading-spinner'
import Page from '@/components/layout/page'
import NoProject from '@/components/no-project'
import ProjectLink from '@/components/project-link'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { useAtomValue } from 'jotai'
import { ContactRound, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

const formatTimestamp = (value: Profile['updateTime']) => {
  const date = tsToDate(value)
  return date ? formatDateTime(date) : '—'
}

const formatPropertiesSummary = (profile: Profile) => {
  const entries = Object.entries(profile.properties ?? {})
  if (entries.length === 0) return '—'

  const preview = entries
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ')

  return entries.length > 2 ? `${preview} +${entries.length - 2}` : preview
}

const normalizeProfileId = (profileId: string) => profileId.trim()

const Profiles = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const profilesRPC = useAtomValue(profilesRPCAtom)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [nextToken, setNextToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProfilesPage = useCallback(
    async (pageToken = '') => {
      if (!headers) return

      setLoading(true)
      setError(null)

      try {
        let response: { profiles: Profile[]; nextPageToken: string } | null = null

        for await (const resp of profilesRPC.list({ pageToken }, { headers })) {
          response = resp
          break
        }

        if (!response) {
          if (pageToken) {
            setNextToken('')
            return
          }
          setProfiles([])
          setNextToken('')
          return
        }

        if (pageToken) {
          setProfiles(prev => [...prev, ...response.profiles])
        } else {
          setProfiles(response.profiles)
        }
        setNextToken(response.nextPageToken)
      } catch (err) {
        const fallback = pageToken ? 'Failed to load more profiles' : 'Failed to load profiles'
        setError(fallback)
        toastRPCError(err, fallback)
      } finally {
        setLoading(false)
      }
    },
    [headers, profilesRPC]
  )

  useEffect(() => {
    if (project) fetchProfilesPage()
  }, [project, fetchProfilesPage])

  if (!project) return <NoProject title="Profiles" icon={ContactRound} />

  return (
    <Page title="Profiles" description="Browse profiles collected for this project">
      {loading && profiles.length === 0 ? (
        <LoadingSpinner />
      ) : error && profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <ContactRound className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchProfilesPage()}>
            Retry
          </Button>
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ContactRound className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">No profiles yet</p>
          <p className="text-xs">Profiles will appear here once your project starts identifying users</p>
        </div>
      ) : (
        <>
          <SectionHeader title="Profiles" count={profiles.length} />
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <th className="py-2 pr-2 text-left font-medium">Profile ID</th>
                <th className="py-2 pr-2 text-left font-medium">External ID</th>
                <th className="py-2 pr-2 text-left font-medium">Properties</th>
                <th className="py-2 pr-2 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(profile => {
                const profileId = normalizeProfileId(profile.id)

                return (
                  <tr key={profile.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                    <td className="py-2.5 pr-2 text-sm font-medium">
                      <ProjectLink
                        href={`/profiles/${encodeURIComponent(profileId)}/events`}
                        className="font-mono text-primary hover:underline underline-offset-4"
                      >
                        {profileId}
                      </ProjectLink>
                    </td>
                    <td className="py-2.5 pr-2 text-xs text-muted-foreground font-mono">{profile.externalId || '—'}</td>
                    <td className="py-2.5 pr-2 text-xs text-muted-foreground">{formatPropertiesSummary(profile)}</td>
                    <td className="py-2.5 pr-2 text-xs text-muted-foreground">{formatTimestamp(profile.updateTime)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {error && (
            <div className="mt-4 mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ContactRound className="w-3.5 h-3.5" />
              <span>{error}</span>
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => fetchProfilesPage(nextToken)}>
                Retry
              </Button>
            </div>
          )}

          {!error && nextToken && (
            <div className="mt-4 mb-8">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fetchProfilesPage(nextToken)}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Load more profiles'}
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  )
}

export default Profiles
