import { useAtomValue } from 'jotai'
import { ContactRound, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trackFeature } from '@/analytics/pug'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import type { Profile } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { insightsRPCAtom, profilesRPCAtom } from '@/api/rpc'
import { LocationLabel } from '@/components/country-flag'
import { DetailTooltip, tooltipPanelContent } from '@/components/detail-tooltip'
import { FilterBuilder, FilterChip } from '@/components/event-filters'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import HoverSwap from '@/components/hover-swap'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { PlatformStackLabel } from '@/components/platform-label'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { readFilterQueryParams, writeFilterQueryParams } from '@/hooks/use-filter-query-params'
import { useFilterState } from '@/hooks/use-filter-state'
import { formatRelative, useRelativeTime } from '@/hooks/use-relative-time'
import { compactNumber } from '@/lib/format'
import { toastRPCError } from '@/lib/rpc-error'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { ProfileAvatar } from './_avatar'
import { resolveIdentity } from './_identity'
import { PropertiesTooltip } from './_properties-tooltip'

const normalizeProfileId = (profileId: string) => profileId.trim()

const formatLocation = (profile: Profile) => {
  const activity = profile.activity
  if (!activity) return { secondary: '', city: undefined, country: undefined, region: undefined }

  const city = activity.city || undefined
  const country = activity.country || undefined
  const region = activity.region || ''
  const secondary = region && region.toLowerCase() !== (city || '').toLowerCase() ? region : ''
  return { secondary, city, country, region: region || undefined }
}

const formatSeen = (value: Profile['activity'] extends infer T ? T : never, key: 'firstSeen' | 'lastSeen') => {
  const date = tsToDate(value?.[key])
  if (!date) return '—'

  return <HoverSwap primary={formatRelative(date)} secondary={formatDateTime(date)} />
}

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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const lastUpdatedLabel = useRelativeTime(lastUpdated)
  const latestProfilesRequestRef = useRef(0)

  // Measure the sticky filter bar so the sticky table header can sit just below it.
  const filterRef = useRef<HTMLDivElement>(null)
  const [filterH, setFilterH] = useState(0)
  useEffect(() => {
    const el = filterRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFilterH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
          setLastUpdated(new Date())
          return
        }

        if (pageToken) {
          setProfiles(prev => [...prev, ...response.profiles])
        } else {
          // Only a fresh load restamps this. "Load more" appends rows below ones still fetched at the
          // original time, so bumping it there would overstate how current the list is.
          setProfiles(response.profiles)
          setLastUpdated(new Date())
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

  // Refetches page one, dropping any pages loaded via "Load more" — same reset the Retry buttons do.
  // trackFeature sits here rather than in fetchProfilesPage() because that also runs on mount and on
  // every filter change; only this handler is a deliberate click. Named explicitly since an icon-only
  // button autocaptures as tag `svg` with no text.
  const handleRefresh = () => {
    trackFeature({ featureId: 'profiles.refresh', featureName: 'Refresh profiles' })
    fetchProfilesPage()
  }

  if (!project) return <NoProject title="Profiles" icon={ContactRound} />

  return (
    <Page title="Profiles" description="Browse profiles collected for this project">
      <div
        ref={filterRef}
        className="sticky top-0 z-10 bg-background -mx-8 px-8 -mt-4 pt-1 pb-2 mb-4 space-y-2 border-b border-border/50"
      >
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
          {/* Sits in the sticky bar, not the page header, so it stays reachable once you scroll. The
              ml-4 keeps the icon off the filter controls: butted straight against them, it reads as
              one of their controls rather than an action on the table. The timestamp is the only
              confirmation a refresh returning no new rows can give — it resets to "just now" when
              nothing else on screen changes. Mirrors the freshness/reload pair on /live. */}
          <div className="ml-4 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Refresh profiles"
              className="text-muted-foreground"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
            {lastUpdated && (
              <HoverSwap primary={`Updated ${lastUpdatedLabel}`} secondary={formatDateTime(lastUpdated)} />
            )}
          </div>
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
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Profiles</span>
            <span className="text-[10px] text-muted-foreground">{profiles.length}</span>
          </div>
          <div className="overflow-x-clip">
            <table className="w-full min-w-[960px] border-collapse">
              <thead className="sticky z-9 bg-background" style={{ top: filterH }}>
                <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="py-2 pr-3 text-left font-medium">User</th>
                  <th className="py-2 pr-3 text-left font-medium">Country</th>
                  <th className="py-2 pr-3 text-left font-medium">Platform</th>
                  <th className="py-2 pr-3 text-left font-medium">Activity</th>
                  <th className="py-2 pl-6 pr-3 text-left font-medium whitespace-nowrap">Last Seen</th>
                  <th className="py-2 pl-4 text-left font-medium whitespace-nowrap">First Seen</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(profile => {
                  const profileId = normalizeProfileId(profile.id)
                  const activity = profile.activity
                  const location = formatLocation(profile)
                  const identity = resolveIdentity(profile)

                  return (
                    <tr key={profile.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                      <td className="py-3 pr-3 text-sm">
                        <DetailTooltip
                          detail={<PropertiesTooltip properties={profile.properties} />}
                          contentClassName={tooltipPanelContent}
                          className="items-center gap-3"
                        >
                          <ProfileAvatar identity={identity} className="size-7 rounded-md text-[10px]" />
                          <div className="min-w-0">
                            <ProjectLink
                              href={`/profiles/${encodeURIComponent(profileId)}`}
                              className={cn(
                                'block truncate font-medium text-foreground hover:text-link',
                                identity.isFallback && 'font-mono',
                              )}
                            >
                              {identity.name}
                            </ProjectLink>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {identity.email ? identity.email : <span className="font-mono">{profileId}</span>}
                            </div>
                          </div>
                        </DetailTooltip>
                      </td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground">
                        <div className="min-w-0">
                          {location.city || location.country ? (
                            <LocationLabel
                              city={location.city}
                              region={location.region}
                              country={location.country}
                              flagSize={20}
                            />
                          ) : (
                            '—'
                          )}
                          {location.secondary && (
                            <div className="truncate text-[11px] text-muted-foreground">{location.secondary}</div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground">
                        <PlatformStackLabel
                          browser={activity?.browser}
                          browserVersion={activity?.browserVersion}
                          os={activity?.os}
                          osVersion={activity?.osVersion}
                          device={activity?.device}
                          iconSize={16}
                        />
                      </td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground whitespace-nowrap">
                        <span className="tabular-nums text-foreground">{compactNumber(activity?.pageviews ?? 0)}</span>{' '}
                        views
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        <span className="tabular-nums text-foreground">
                          {compactNumber(activity?.totalEvents ?? 0)}
                        </span>{' '}
                        events
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        <span className="tabular-nums text-foreground">{compactNumber(activity?.sessions ?? 0)}</span>{' '}
                        sessions
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
