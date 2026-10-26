import { Code, ConnectError } from '@connectrpc/connect'
import { useAtomValue } from 'jotai'
import { ContactRound, Loader2, RefreshCw } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trackFeature } from '@/analytics/pug'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import { type Profile, ProfileListSort } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { insightsRPCAtom, profilesRPCAtom } from '@/api/rpc'
import { LocationLabel } from '@/components/country-flag'
import { DetailTooltip, tooltipPanelContent } from '@/components/detail-tooltip'
import { FilterBuilder, FilterChip } from '@/components/event-filters'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import HoverSwap from '@/components/hover-swap'
import IncludeBotsToggle from '@/components/include-bots-toggle'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { PlatformStackLabel } from '@/components/platform-label'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import {
  readFilterQueryParams,
  replaceUrlIfChanged,
  setOrDelete,
  writeFilterQueryParams,
} from '@/hooks/use-filter-query-params'
import { useFilterState } from '@/hooks/use-filter-state'
import { useIncludeBots } from '@/hooks/use-include-bots'
import { formatRelative, useRelativeTime } from '@/hooks/use-relative-time'
import { compactNumber } from '@/lib/format'
import { toastRPCError } from '@/lib/rpc-error'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { ProfileAvatar } from './_avatar'
import { resolveIdentity } from './_identity'
import { PropertiesTooltip } from './_properties-tooltip'
import StatusDot from './_status-dot'

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

// grid-cols-1 is minmax(0, 1fr): no min-content width, so truncated text can't widen the table past the clipping
// wrapper. min-w-32 keeps squeezed columns readable; the inner div keeps tooltip triggers from stretching.
const ShrinkableCell = ({ children }: { children: ReactNode }) => (
  <div className="grid min-w-32 grid-cols-1">
    <div>{children}</div>
  </div>
)

// The server sorts: the list is paged on its sort key, so ordering the loaded rows here would only
// reorder one page. A button, not a clickable <th>, so the sort is reachable from the keyboard.
const SortHeader = ({
  label,
  active,
  onSelect,
  className,
}: {
  label: string
  active: boolean
  onSelect: () => void
  className: string
}) => (
  <th
    aria-sort={active ? 'descending' : undefined}
    className={cn('py-2 text-left font-medium whitespace-nowrap', className)}
  >
    {/* uppercase again: the UA stylesheet resets text-transform on buttons, and preflight doesn't undo it. */}
    <button
      type="button"
      onClick={onSelect}
      className={cn('uppercase cursor-pointer hover:text-foreground', active && 'text-foreground')}
    >
      {label}
      {/* aria-sort already announces the direction; in the name the arrow is only noise. */}
      {active && (
        <span aria-hidden="true" className="ml-1">
          ↓
        </span>
      )}
    </button>
  </th>
)

// Only a non-default sort is written, like the bots toggle's param, so a default-view link never
// accumulates one. Read once on mount: the URL is how a sort survives opening a profile and coming Back.
const SORT_PARAM = 'sort'
const FIRST_SEEN_PARAM_VALUE = 'first_seen'

const readSortParam = () => {
  if (new URLSearchParams(window.location.search).get(SORT_PARAM) === FIRST_SEEN_PARAM_VALUE) {
    return ProfileListSort.FIRST_SEEN
  }
  return ProfileListSort.LAST_SEEN
}

const writeSortParam = (sort: ProfileListSort) => {
  const url = new URL(window.location.href)
  setOrDelete(url, SORT_PARAM, sort === ProfileListSort.FIRST_SEEN ? FIRST_SEEN_PARAM_VALUE : undefined)
  replaceUrlIfChanged(url)
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
  // Carries the failed request's own page token: a filter or toggle change re-runs page one while
  // nextToken still holds the previous query's cursor, so retrying off nextToken would append page
  // two of the old query to stale rows.
  const [error, setError] = useState<{ message: string; pageToken: string } | null>(null)
  const [schema, setSchema] = useState<GetFilterSchemaResponse | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const lastUpdatedLabel = useRelativeTime(lastUpdated)
  const latestProfilesRequestRef = useRef(0)
  const [includeBots, setIncludeBots] = useIncludeBots()
  // Most recently active first unless the URL carries a sort. The server's default, create time, can
  // leave someone who was active a minute ago several pages down.
  const [sort, setSort] = useState(readSortParam)

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
    writeSortParam(sort)
  }, [sort])

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
            includeBots,
            sort,
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
          // A person's sort key can move between pages (an identify merging older history moves first
          // seen earlier), so a later page can repeat someone already listed. Keep the first row.
          setProfiles(prev => {
            const listed = new Set(prev.map(p => p.id))
            return [...prev, ...response.profiles.filter(p => !listed.has(p.id))]
          })
        } else {
          // Only a fresh load restamps this. "Load more" appends rows below ones still fetched at the
          // original time, so bumping it there would overstate how current the list is.
          setProfiles(response.profiles)
          setLastUpdated(new Date())
        }
        setNextToken(response.nextPageToken)
      } catch (err) {
        if (requestId !== latestProfilesRequestRef.current) return
        // On a Load more, InvalidArgument can only be the page token: page one just accepted the same
        // filters, sort and bots setting. Resending a refused token (one an older server minted, met
        // across a deploy) is refused again, so Retry starts over from the first page instead.
        if (pageToken && err instanceof ConnectError && err.code === Code.InvalidArgument) {
          const message = 'The list changed since it loaded'
          console.error(`${message}:`, err)
          setError({ message, pageToken: '' })
          toast.error(`${message}. Retry reloads it from the top.`)
          return
        }
        const fallback = pageToken ? 'Failed to load more profiles' : 'Failed to load profiles'
        setError({ message: fallback, pageToken })
        toastRPCError(err, fallback)
      } finally {
        if (requestId === latestProfilesRequestRef.current) {
          setLoading(false)
        }
      }
    },
    [headers, profilesRPC, propFilters, includeBots, sort],
  )

  useEffect(() => {
    if (project) fetchProfilesPage()
  }, [project, fetchProfilesPage])

  // Refetches page one, dropping any pages loaded via "Load more", as the Retry buttons do.
  // trackFeature sits here rather than in fetchProfilesPage() because that also runs on mount and on
  // every filter change; only this handler is a deliberate click. Named explicitly since an icon-only
  // button autocaptures as tag `svg` with no text.
  const handleRefresh = () => {
    trackFeature({ featureId: 'profiles.refresh', featureName: 'Refresh profiles' })
    fetchProfilesPage()
  }

  // A new sort reloads page one through fetchProfilesPage's dependency on it, since a page token
  // only seeks under the sort it was issued for. Re-clicking the active column returns early so it
  // isn't counted as a sort; setSort with the unchanged value would already skip the reload.
  const handleSort = (next: ProfileListSort) => {
    if (next === sort) return
    trackFeature({ featureId: 'profiles.sort', featureName: 'Sort profiles' })
    setSort(next)
  }

  if (!project) return <NoProject title="Profiles" icon={ContactRound} />

  return (
    <Page title="Profiles" description="Browse profiles collected for this project">
      <div
        ref={filterRef}
        className="sticky top-0 z-10 bg-background -mx-page-gutter px-page-gutter -mt-4 pt-1 pb-2 mb-4 space-y-2 border-b border-border/50"
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
          <IncludeBotsToggle includeBots={includeBots} onChange={setIncludeBots} />
          {/* Sits in the sticky bar, not the page header, so it stays reachable once you scroll. The
              ml-4 keeps the icon off the filter controls: butted straight against them, it reads as
              one of their controls rather than an action on the table. The timestamp is the only
              confirmation a refresh returning no new rows can give: it resets to "just now" when
              nothing else on screen changes. Mirrors the freshness/reload pair on /live. */}
          <div className="ml-4 flex items-center gap-2 text-xs text-muted-foreground">
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
          <p className="text-sm font-medium mb-1">{error.message}</p>
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
            <span className="text-xs text-muted-foreground">{profiles.length}</span>
          </div>
          {/* Only clip keeps overflow-y visible for the sticky header; below xl, reach beats sticking. */}
          <div className="overflow-x-auto xl:overflow-x-clip">
            <table className="w-full border-collapse">
              <thead className="static z-9 bg-background xl:sticky" style={{ top: filterH }}>
                <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="py-2 pr-3 text-left font-medium">User</th>
                  <th className="py-2 pr-3 text-left font-medium">Country</th>
                  <th className="py-2 pr-3 text-left font-medium">Platform</th>
                  <th className="py-2 pl-4 text-right font-medium">Views</th>
                  <th className="py-2 pl-4 text-right font-medium">Events</th>
                  <th className="py-2 pl-4 text-right font-medium">Sessions</th>
                  <SortHeader
                    label="Last Seen"
                    active={sort === ProfileListSort.LAST_SEEN}
                    onSelect={() => handleSort(ProfileListSort.LAST_SEEN)}
                    className="pl-6 pr-3"
                  />
                  <SortHeader
                    label="First Seen"
                    active={sort === ProfileListSort.FIRST_SEEN}
                    onSelect={() => handleSort(ProfileListSort.FIRST_SEEN)}
                    className="pl-4"
                  />
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
                        <ShrinkableCell>
                          <DetailTooltip
                            detail={<PropertiesTooltip properties={profile.properties} />}
                            contentClassName={tooltipPanelContent}
                            className="items-center gap-3"
                          >
                            <div className="relative shrink-0">
                              <ProfileAvatar identity={identity} bot={activity?.bot} className="size-7 rounded-md" />
                              <span className="absolute -right-0.5 -bottom-0.5">
                                <StatusDot lastSeen={tsToDate(activity?.lastSeen)} className="size-2" />
                              </span>
                            </div>
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
                              <div className="truncate text-xs text-muted-foreground">
                                {identity.email ? identity.email : <span className="font-mono">{profileId}</span>}
                              </div>
                            </div>
                          </DetailTooltip>
                        </ShrinkableCell>
                      </td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground">
                        <ShrinkableCell>
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
                            <div className="truncate text-xs text-muted-foreground">{location.secondary}</div>
                          )}
                        </ShrinkableCell>
                      </td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground">
                        <ShrinkableCell>
                          <PlatformStackLabel
                            browser={activity?.browser}
                            browserVersion={activity?.browserVersion}
                            os={activity?.os}
                            osVersion={activity?.osVersion}
                            device={activity?.device}
                            bot={activity?.bot}
                            iconSize={16}
                          />
                        </ShrinkableCell>
                      </td>
                      <td className="py-3 pl-4 text-right text-sm tabular-nums">
                        {compactNumber(activity?.pageviews ?? 0)}
                      </td>
                      <td className="py-3 pl-4 text-right text-sm tabular-nums">
                        {compactNumber(activity?.totalEvents ?? 0)}
                      </td>
                      <td className="py-3 pl-4 text-right text-sm tabular-nums">
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
              <span>{error.message}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => fetchProfilesPage(error.pageToken)}
              >
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
