import { useAtomValue } from 'jotai'
import { ContactRound, Laptop, Loader2, Monitor, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import type { Profile } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { insightsRPCAtom, profilesRPCAtom } from '@/api/rpc'
import { FilterBuilder, FilterChip } from '@/components/event-filters'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import HoverSwap from '@/components/hover-swap'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { readFilterQueryParams, writeFilterQueryParams } from '@/hooks/use-filter-query-params'
import { useFilterState } from '@/hooks/use-filter-state'
import { formatRelative } from '@/hooks/use-relative-time'
import { compactNumber, isMobileOS } from '@/lib/format'
import { toastRPCError } from '@/lib/rpc-error'
import { formatDateTime, tsToDate } from '@/lib/timestamp'

const normalizeProfileId = (profileId: string) => profileId.trim()

const getInitials = (value: string) =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?'

const hashHue = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 360
  return hash
}

const placeholderTone = (value: string) => {
  const hue = hashHue(value)
  return {
    bg: `oklch(0.78 0.12 ${hue})`,
    fg: `oklch(0.28 0.06 ${hue})`,
  }
}

const formatLocation = (profile: Profile) => {
  const activity = profile.activity
  if (!activity) return { primary: '—', secondary: '' }

  const primary = [activity.city, activity.country].filter(Boolean).join(', ') || activity.country || '—'
  const secondary = activity.region || ''
  return { primary, secondary }
}

const formatSeen = (value: Profile['activity'] extends infer T ? T : never, key: 'firstSeen' | 'lastSeen') => {
  const date = tsToDate(value?.[key])
  if (!date) return '—'

  return <HoverSwap primary={formatRelative(date)} secondary={formatDateTime(date)} />
}

const PlaceholderBadge = ({ value, className = 'rounded-md' }: { value: string; className?: string }) => {
  const tone = placeholderTone(value)
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center text-[9px] font-semibold ${className}`}
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {getInitials(value)}
    </span>
  )
}

const MetaCell = ({ icon, value, fallback = '—' }: { icon?: React.ReactNode; value?: string; fallback?: string }) => (
  <div className="flex items-center gap-2 min-w-0">
    {icon}
    <span className="truncate">{value || fallback}</span>
  </div>
)

const ALLOWED_PROFILE_AUTO_PROPERTIES = new Set([
  '$browser',
  '$browserVersion',
  '$os',
  '$osVersion',
  '$device',
  '$country',
  '$region',
  '$city',
])

const Profiles = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const profilesRPC = useAtomValue(profilesRPCAtom)
  const initialFilterState = useMemo(() => readFilterQueryParams(), [])
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState(initialFilterState.propFilters)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [nextToken, setNextToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schema, setSchema] = useState<GetFilterSchemaResponse | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const latestProfilesRequestRef = useRef(0)

  useEffect(() => {
    if (initialFilterState.parseWarning) {
      toast.warning(initialFilterState.parseWarning, { id: 'profiles-filter-parse-warning' })
    }
  }, []) // Fire on mount; explicit toast id dedupes the StrictMode double-call in dev.

  useEffect(() => {
    writeFilterQueryParams([], propFilters)
  }, [propFilters])

  useEffect(() => {
    if (!project || !headers) {
      setSchema(null)
      setSchemaError(null)
      return
    }

    let cancelled = false
    setSchema(null)
    setSchemaError(null)

    const loadSchema = async () => {
      try {
        const resp = await insightsRPC.getFilterSchema({ eventKind: '' }, { headers })
        if (cancelled) return
        setSchema(resp)
      } catch (err) {
        if (cancelled) return
        console.error('fetchFilterSchema for profiles failed:', err)
        setSchema(null)
        setSchemaError(err instanceof Error ? err.message : 'Failed to load filter schema')
      }
    }

    void loadSchema()
    return () => {
      cancelled = true
    }
  }, [project, headers, insightsRPC])

  const profileSchema = useMemo<GetFilterSchemaResponse | null>(() => {
    if (!schema) return null
    return {
      ...schema,
      events: [],
      autoPropertyKeys: schema.autoPropertyKeys.filter(pk => ALLOWED_PROFILE_AUTO_PROPERTIES.has(pk.name)),
      customPropertyKeys: [],
      profilePropertyKeys: schema.profilePropertyKeys,
    }
  }, [schema])

  const fetchProfilesPage = useCallback(
    async (pageToken = '') => {
      if (!headers) return

      const requestId = ++latestProfilesRequestRef.current
      setLoading(true)
      setError(null)

      try {
        let response: { profiles: Profile[]; nextPageToken: string } | null = null
        const filterGroups =
          propFilters.length > 0 ? [{ filters: toProtoFilters(propFilters), operator: LogicalOperator.AND }] : []

        for await (const resp of profilesRPC.list(
          {
            pageToken,
            filterGroups,
            filterGroupsOperator: LogicalOperator.AND,
          },
          { headers },
        )) {
          response = resp
          break
        }

        if (requestId !== latestProfilesRequestRef.current) return

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
        if (requestId !== latestProfilesRequestRef.current) return
        const fallback = pageToken ? 'Failed to load more profiles' : 'Failed to load profiles'
        setError(fallback)
        toastRPCError(err, fallback)
      } finally {
        if (requestId === latestProfilesRequestRef.current) {
          setLoading(false)
        }
      }
    },
    [headers, profilesRPC, propFilters],
  )

  useEffect(() => {
    if (project) fetchProfilesPage()
  }, [project, fetchProfilesPage])

  if (!project) return <NoProject title="Profiles" icon={ContactRound} />

  return (
    <Page title="Profiles" description="Browse profiles collected for this project">
      <div className="sticky top-0 z-10 bg-background -mx-8 px-8 -mt-4 pt-1 pb-2 mb-4 space-y-2 border-b border-border/50">
        <div className="flex items-center gap-2 flex-wrap">
          {propFilters.map((filter, idx) => (
            <FilterChip
              key={`${filter.property}-${filter.operator}-${idx}`}
              filter={filter}
              onUpdate={next => updateFilter(idx, next)}
              onRemove={() => removeFilter(idx)}
            />
          ))}
          <FilterBuilder schema={profileSchema} schemaError={schemaError} onAdd={addFilter} />
        </div>
      </div>

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
          <div className="mt-4 mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profiles</span>
            <span className="text-[10px] text-muted-foreground">{profiles.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead>
                <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="py-2 pr-3 text-left font-medium">User</th>
                  <th className="py-2 pr-3 text-left font-medium">Country</th>
                  <th className="py-2 pr-3 text-left font-medium">Browser</th>
                  <th className="py-2 pr-3 text-left font-medium">OS</th>
                  <th className="py-2 pr-3 text-left font-medium">Device</th>
                  <th className="py-2 pr-3 text-right font-medium">Pageviews</th>
                  <th className="py-2 pr-3 text-right font-medium">Events</th>
                  <th className="py-2 pr-3 text-right font-medium">Sessions</th>
                  <th className="py-2 pl-6 pr-3 text-left font-medium whitespace-nowrap">Last Seen</th>
                  <th className="py-2 pl-4 text-left font-medium whitespace-nowrap">First Seen</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(profile => {
                  const profileId = normalizeProfileId(profile.id)
                  const activity = profile.activity
                  const location = formatLocation(profile)
                  const userLabel = profile.externalId || profileId
                  const browserLabel = [activity?.browser, activity?.browserVersion].filter(Boolean).join(' ') || '—'
                  const osLabel = [activity?.os, activity?.osVersion].filter(Boolean).join(' ') || '—'
                  const isMobile =
                    isMobileOS(activity?.os) || activity?.device?.toLowerCase().includes('mobile') === true

                  return (
                    <tr key={profile.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                      <td className="py-3 pr-3 text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlaceholderBadge value={userLabel} className="rounded-full" />
                          <div className="min-w-0">
                            <ProjectLink
                              href={`/profiles/${encodeURIComponent(profileId)}/events`}
                              className="block truncate font-medium text-foreground hover:text-primary"
                            >
                              {userLabel}
                            </ProjectLink>
                            <div className="truncate text-[11px] text-muted-foreground font-mono">{profileId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlaceholderBadge value={activity?.country || location.primary} />
                          <div className="min-w-0">
                            <div className="truncate">{location.primary}</div>
                            {location.secondary && (
                              <div className="truncate text-[11px] text-muted-foreground">{location.secondary}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-sm">
                        <MetaCell
                          icon={<PlaceholderBadge value={activity?.browser || 'Browser'} className="rounded-full" />}
                          value={browserLabel}
                        />
                      </td>
                      <td className="py-3 pr-3 text-sm">
                        <MetaCell
                          icon={
                            isMobile ? (
                              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                                <Smartphone className="h-3 w-3" />
                              </span>
                            ) : (
                              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                                <Laptop className="h-3 w-3" />
                              </span>
                            )
                          }
                          value={osLabel}
                        />
                      </td>
                      <td className="py-3 pr-3 text-sm">
                        <MetaCell
                          icon={
                            isMobile ? (
                              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                                <Smartphone className="h-3 w-3" />
                              </span>
                            ) : (
                              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                                <Monitor className="h-3 w-3" />
                              </span>
                            )
                          }
                          value={activity?.device || (isMobile ? 'Mobile' : 'Desktop')}
                        />
                      </td>
                      <td className="py-3 pr-3 text-right text-sm tabular-nums">
                        {compactNumber(activity?.pageviews ?? 0)}
                      </td>
                      <td className="py-3 pr-3 text-right text-sm tabular-nums">
                        {compactNumber(activity?.totalEvents ?? 0)}
                      </td>
                      <td className="py-3 pr-3 text-right text-sm tabular-nums">
                        {compactNumber(activity?.sessions ?? 0)}
                      </td>
                      <td className="py-3 pl-6 pr-3 text-sm text-muted-foreground whitespace-nowrap">
                        {formatSeen(activity, 'lastSeen')}
                      </td>
                      <td className="py-3 pl-4 text-sm text-muted-foreground whitespace-nowrap">
                        {formatSeen(activity, 'firstSeen')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

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
