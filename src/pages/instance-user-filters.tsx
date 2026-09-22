import { useAtomValue } from 'jotai'
import { Check, ChevronRight, Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { type RefObject, useEffect, useState } from 'react'
import { BooleanFilter, type Organization } from '@/api/genproto/dashboard/instance/v1/instance_pb'
import { instanceAdminRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRelativeTime } from '@/hooks/use-relative-time'
import { formatDateTime } from '@/lib/timestamp'

type OrganizationFilter = { id: string; name: string } | null
type FilterField = 'search' | 'organization' | 'verified' | 'enabled'

const chipClass = 'inline-flex h-7 items-center overflow-hidden rounded-md border border-border text-xs'
const chipLabelClass = 'flex h-full items-center bg-muted/50 px-2 text-muted-foreground'
const chipValueClass = 'flex h-full max-w-56 items-center truncate px-2 font-mono transition-colors hover:bg-muted/40'
const chipRemoveClass =
  'flex h-full items-center px-1.5 text-faint transition-colors hover:bg-muted/40 hover:text-foreground'
const choiceClass =
  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/50'

const StatusFilterChip = ({
  label,
  value,
  trueLabel,
  falseLabel,
  onChange,
}: {
  label: string
  value: BooleanFilter
  trueLabel: string
  falseLabel: string
  onChange: (value: BooleanFilter) => void
}) => {
  const [open, setOpen] = useState(false)
  return (
    <span className={chipClass}>
      <span className={chipLabelClass}>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={chipValueClass}>
          {value === BooleanFilter.TRUE ? trueLabel : falseLabel}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 gap-0 p-1">
          {(
            [
              { value: BooleanFilter.TRUE, label: trueLabel },
              { value: BooleanFilter.FALSE, label: falseLabel },
            ] as const
          ).map(choice => (
            <button
              key={choice.value}
              type="button"
              className={choiceClass}
              onClick={() => {
                onChange(choice.value)
                setOpen(false)
              }}
            >
              {choice.label}
              {value === choice.value && <Check className="size-3.5" />}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className={chipRemoveClass}
        aria-label={`Remove ${label} filter`}
        onClick={() => onChange(BooleanFilter.UNSPECIFIED)}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

export const InstanceUserFilters = ({
  filterBarRef,
  search,
  onSearchChange,
  organization,
  onOrganizationChange,
  verified,
  onVerifiedChange,
  enabled,
  onEnabledChange,
  loading,
  onRefresh,
  lastUpdated,
}: {
  filterBarRef: RefObject<HTMLDivElement | null>
  search: string
  onSearchChange: (value: string) => void
  organization: OrganizationFilter
  onOrganizationChange: (value: OrganizationFilter) => void
  verified: BooleanFilter
  onVerifiedChange: (value: BooleanFilter) => void
  enabled: BooleanFilter
  onEnabledChange: (value: BooleanFilter) => void
  loading: boolean
  onRefresh: () => void
  lastUpdated: Date | null
}) => {
  const rpc = useAtomValue(instanceAdminRPCAtom)
  const lastUpdatedLabel = useRelativeTime(lastUpdated)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderField, setBuilderField] = useState<FilterField | null>(null)
  const [searchEditorOpen, setSearchEditorOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [organizationEditorOpen, setOrganizationEditorOpen] = useState(false)
  const [organizationSearch, setOrganizationSearch] = useState('')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [organizationsLoading, setOrganizationsLoading] = useState(false)
  const [organizationsHasMore, setOrganizationsHasMore] = useState(false)
  const [organizationsError, setOrganizationsError] = useState('')
  const organizationPickerOpen = organizationEditorOpen || (builderOpen && builderField === 'organization')

  useEffect(() => {
    if (!organizationPickerOpen) return
    let cancelled = false
    setOrganizationsLoading(true)
    setOrganizationsError('')
    setOrganizations([])
    setOrganizationsHasMore(false)
    const timer = window.setTimeout(
      () => {
        rpc
          .listOrganizations({ search: organizationSearch.trim(), pageSize: 50 })
          .then(result => {
            if (cancelled) return
            setOrganizations(result.organizations)
            setOrganizationsHasMore(!!result.nextPageToken)
          })
          .catch(cause => {
            if (!cancelled)
              setOrganizationsError(cause instanceof Error ? cause.message : 'Could not load organizations')
          })
          .finally(() => {
            if (!cancelled) setOrganizationsLoading(false)
          })
      },
      organizationSearch ? 200 : 0,
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [rpc, organizationPickerOpen, organizationSearch])

  const closeBuilder = () => {
    setBuilderOpen(false)
    setBuilderField(null)
    setOrganizationSearch('')
  }

  const selectOrganization = (value: OrganizationFilter) => {
    onOrganizationChange(value)
    setOrganizationEditorOpen(false)
    closeBuilder()
  }

  const selectStatus = (field: 'verified' | 'enabled', value: BooleanFilter) => {
    if (field === 'verified') onVerifiedChange(value)
    else onEnabledChange(value)
    closeBuilder()
  }

  const commitSearch = () => {
    onSearchChange(searchDraft.trim())
    setSearchEditorOpen(false)
    closeBuilder()
  }

  const searchEditor = (
    <div className="space-y-2 p-1">
      <Input
        autoFocus
        aria-label="Search users"
        placeholder="Email or user ID"
        value={searchDraft}
        onChange={event => setSearchDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') commitSearch()
        }}
        className="h-8"
      />
      <Button size="sm" className="w-full" disabled={!searchDraft.trim()} onClick={commitSearch}>
        Apply
      </Button>
    </div>
  )

  const organizationChoices = (
    <>
      <Input
        autoFocus
        aria-label="Find organization"
        placeholder="Find organization"
        value={organizationSearch}
        onChange={event => setOrganizationSearch(event.target.value)}
        className="h-8"
      />
      <div className="max-h-56 overflow-y-auto">
        {organizations.map(org => (
          <button
            key={org.id}
            type="button"
            className={choiceClass}
            onClick={() => selectOrganization({ id: org.id, name: org.name })}
          >
            <span className="truncate">{org.name}</span>
            {organization?.id === org.id && <Check className="size-3.5 shrink-0" />}
          </button>
        ))}
        {organizationsLoading && <p className="px-2 py-2 text-xs text-muted-foreground">Searching…</p>}
        {!organizationsLoading && organizationsError && (
          <p role="alert" className="px-2 py-2 text-xs text-negative">
            {organizationsError}
          </p>
        )}
        {!organizationsLoading && !organizationsError && organizations.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">No organizations found.</p>
        )}
        {!organizationsLoading && organizationsHasMore && (
          <p className="px-2 py-2 text-xs text-muted-foreground">Type to find more organizations.</p>
        )}
      </div>
    </>
  )

  return (
    <div
      ref={filterBarRef}
      className="sticky top-0 z-10 -mx-page-gutter -mt-4 mb-4 space-y-2 border-b border-border/50 bg-background px-page-gutter pt-1 pb-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        {search && (
          <span className={chipClass}>
            <span className={chipLabelClass}>Search</span>
            <Popover
              open={searchEditorOpen}
              onOpenChange={open => {
                setSearchEditorOpen(open)
                if (open) setSearchDraft(search)
              }}
            >
              <PopoverTrigger className={chipValueClass}>{search}</PopoverTrigger>
              <PopoverContent align="start" className="w-64 gap-0 p-1">
                {searchEditor}
              </PopoverContent>
            </Popover>
            <button
              type="button"
              className={chipRemoveClass}
              aria-label="Remove Search filter"
              onClick={() => onSearchChange('')}
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        {organization && (
          <span className={chipClass}>
            <span className={chipLabelClass}>Organization</span>
            <Popover
              open={organizationEditorOpen}
              onOpenChange={open => {
                setOrganizationEditorOpen(open)
                if (!open) setOrganizationSearch('')
              }}
            >
              <PopoverTrigger className={chipValueClass}>{organization.name}</PopoverTrigger>
              <PopoverContent align="start" className="w-72 gap-1 p-1.5">
                {organizationChoices}
              </PopoverContent>
            </Popover>
            <button
              type="button"
              className={chipRemoveClass}
              aria-label="Remove Organization filter"
              onClick={() => selectOrganization(null)}
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        {verified !== BooleanFilter.UNSPECIFIED && (
          <StatusFilterChip
            label="Verified"
            value={verified}
            trueLabel="Verified"
            falseLabel="Unverified"
            onChange={onVerifiedChange}
          />
        )}
        {enabled !== BooleanFilter.UNSPECIFIED && (
          <StatusFilterChip
            label="Enabled"
            value={enabled}
            trueLabel="Enabled"
            falseLabel="Disabled"
            onChange={onEnabledChange}
          />
        )}
        <Popover
          open={builderOpen}
          onOpenChange={open => {
            setBuilderOpen(open)
            if (!open) closeBuilder()
          }}
        >
          <PopoverTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground">
            <Plus className="size-3" /> Filter
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-0 p-1">
            {builderField && (
              <div className="flex items-center gap-1 px-2 pt-1 pb-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => {
                    setBuilderField(null)
                    setOrganizationSearch('')
                  }}
                  className="hover:text-foreground"
                >
                  Filter
                </button>
                <ChevronRight className="size-2.5" />
                <span className="text-foreground">
                  {builderField === 'search'
                    ? 'Search users'
                    : builderField === 'organization'
                      ? 'Organization'
                      : builderField === 'verified'
                        ? 'Verified'
                        : 'Enabled'}
                </span>
              </div>
            )}
            {!builderField && (
              <div className="max-h-72 overflow-auto">
                <button
                  type="button"
                  className={choiceClass}
                  onClick={() => {
                    setSearchDraft(search)
                    setBuilderField('search')
                  }}
                >
                  Search users
                </button>
                <button type="button" className={choiceClass} onClick={() => setBuilderField('organization')}>
                  Organization
                </button>
                <button type="button" className={choiceClass} onClick={() => setBuilderField('verified')}>
                  Verified
                </button>
                <button type="button" className={choiceClass} onClick={() => setBuilderField('enabled')}>
                  Enabled
                </button>
              </div>
            )}
            {builderField === 'search' && searchEditor}
            {builderField === 'organization' && organizationChoices}
            {(builderField === 'verified' || builderField === 'enabled') && (
              <div className="max-h-72 overflow-auto">
                <button
                  type="button"
                  className={choiceClass}
                  onClick={() => selectStatus(builderField, BooleanFilter.TRUE)}
                >
                  {builderField === 'verified' ? 'Verified' : 'Enabled'}
                </button>
                <button
                  type="button"
                  className={choiceClass}
                  onClick={() => selectStatus(builderField, BooleanFilter.FALSE)}
                >
                  {builderField === 'verified' ? 'Unverified' : 'Disabled'}
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <div className="ml-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh directory"
            className="text-muted-foreground"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
          {lastUpdated && <HoverSwap primary={`Updated ${lastUpdatedLabel}`} secondary={formatDateTime(lastUpdated)} />}
        </div>
      </div>
    </div>
  )
}
