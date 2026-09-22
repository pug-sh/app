import { Code, ConnectError } from '@connectrpc/connect'
import { useAtomValue, useSetAtom } from 'jotai'
import { ArrowLeft, Check, LogOut, Plus, RefreshCw, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  BooleanFilter,
  type DeletionOperation,
  type GetOrganizationResponse,
  type Organization,
  type User,
} from '@/api/genproto/dashboard/instance/v1/instance_pb'
import { OrgRole } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { instanceAdminRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { NameChip } from '@/components/name-chip'
import SectionHeader from '@/components/section-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { activeOrgAtom, bootstrapStatusAtom, orgsAtom, refreshOrgsAtom } from '@/data/workspace.atoms'
import { InstanceUserFilters } from './instance-user-filters'

const roles = [OrgRole.ADMIN, OrgRole.MEMBER, OrgRole.VIEWER]
const roleName = (role: OrgRole) => OrgRole[role]?.replace('ORG_ROLE_', '').toLowerCase() ?? 'member'
const organizationSections = ['overview', 'projects', 'members', 'invitations', 'deletions'] as const
type OrganizationSection = (typeof organizationSections)[number]
const initials = (value: string) =>
  value
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')

const DetailSectionHeader = ({ title, count }: { title: string; count?: number }) => (
  <div className="mb-3 flex items-baseline gap-2">
    <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
    {count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
  </div>
)

const UserOrganizations = ({ memberships, email }: { memberships: User['memberships']; email: string }) => {
  const organizations = [...memberships].sort(
    (a, b) => a.orgName.localeCompare(b.orgName) || a.orgId.localeCompare(b.orgId),
  )
  if (organizations.length === 0) return <span>—</span>
  if (organizations.length === 1) {
    return (
      <span className="block max-w-56 truncate" title={organizations[0].orgName}>
        {organizations[0].orgName}
      </span>
    )
  }

  return (
    <div className="flex max-w-56 min-w-0 items-baseline gap-1.5">
      <span className="min-w-0 truncate" title={organizations[0].orgName}>
        {organizations[0].orgName}
      </span>
      <Popover>
        <PopoverTrigger
          className="shrink-0 text-sm leading-5 font-medium text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Show all ${organizations.length} organizations for ${email}`}
        >
          +{organizations.length - 1}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-0 p-1.5">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Organizations ({organizations.length})</p>
          <ul className="max-h-64 overflow-y-auto">
            {organizations.map(membership => (
              <li
                key={membership.orgId}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate" title={membership.orgName}>
                  {membership.orgName}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{roleName(membership.role)}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}

const InstanceConsole = () => {
  const rpc = useAtomValue(instanceAdminRPCAtom)
  const ownOrgs = useAtomValue(orgsAtom)
  const activeOrg = useAtomValue(activeOrgAtom)
  const refreshOwnOrgs = useSetAtom(refreshOrgsAtom)
  const setBootstrapStatus = useSetAtom(bootstrapStatusAtom)
  const [location, navigate] = useLocation()
  const tab = location.startsWith('/instance/users')
    ? 'users'
    : location.startsWith('/instance/deletions')
      ? 'deletions'
      : 'organizations'
  const organizationRoute = location.match(/^\/instance\/organizations\/([^/]+)(?:\/([^/]+))?\/?$/)
  const selectedOrg = organizationRoute?.[1] ?? null
  const organizationSection: OrganizationSection = organizationSections.includes(
    organizationRoute?.[2] as OrganizationSection,
  )
    ? (organizationRoute?.[2] as OrganizationSection)
    : 'overview'
  const [showProvision, setShowProvision] = useState(false)
  const [search, setSearch] = useState('')
  const [pageToken, setPageToken] = useState('')
  const [nextPageToken, setNextPageToken] = useState('')
  const [previousTokens, setPreviousTokens] = useState<string[]>([])
  const [userOrgFilter, setUserOrgFilter] = useState<{ id: string; name: string } | null>(null)
  const [verifiedFilter, setVerifiedFilter] = useState<BooleanFilter>(BooleanFilter.UNSPECIFIED)
  const [enabledFilter, setEnabledFilter] = useState<BooleanFilter>(BooleanFilter.UNSPECIFIED)
  const filterBarRef = useRef<HTMLDivElement>(null)
  const [filterBarHeight, setFilterBarHeight] = useState(0)
  const [usersLoading, setUsersLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [usersLastUpdated, setUsersLastUpdated] = useState<Date | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [detail, setDetail] = useState<GetOrganizationResponse | null>(null)
  const [deletions, setDeletions] = useState<DeletionOperation[]>([])
  const [history, setHistory] = useState<DeletionOperation[]>([])
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null)
  const [deleteProjectName, setDeleteProjectName] = useState('')
  const [deleteOrgOpen, setDeleteOrgOpen] = useState(false)
  const [deleteOrgId, setDeleteOrgId] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [name, setName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>(OrgRole.MEMBER)
  const [showInvite, setShowInvite] = useState(false)
  const inviteInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [confirmation, setConfirmation] = useState<{ kind: 'remove' | 'sessions' | 'toggle'; id: string } | null>(null)

  const resetPagination = useCallback(() => {
    setPageToken('')
    setNextPageToken('')
    setPreviousTokens([])
    setConfirmation(null)
  }, [])

  useEffect(() => {
    if (location === '/') navigate('/instance/organizations', { replace: true })
  }, [location, navigate])

  useEffect(() => {
    setDetail(null)
    setSearch('')
    resetPagination()
    setUserOrgFilter(null)
    setVerifiedFilter(BooleanFilter.UNSPECIFIED)
    setEnabledFilter(BooleanFilter.UNSPECIFIED)
  }, [tab, resetPagination])

  useEffect(() => {
    if (tab !== 'users' || !filterBarRef.current) return
    const bar = filterBarRef.current
    const updateHeight = () => setFilterBarHeight(bar.offsetHeight)
    updateHeight()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateHeight)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [tab])

  const refresh = useCallback(() => {
    setRevision(n => n + 1)
  }, [])
  const loadMore = async (kind: 'projects' | 'members' | 'invitations') => {
    if (!selectedOrg || !detail || busy) return
    const token =
      kind === 'projects'
        ? detail.nextProjectPageToken
        : kind === 'members'
          ? detail.nextMemberPageToken
          : detail.nextInvitationPageToken
    if (!token) return
    setBusy(true)
    setError('')
    try {
      const next = await rpc.getOrganization({
        orgId: selectedOrg,
        pageSize: 50,
        projectPageToken: kind === 'projects' ? token : '',
        memberPageToken: kind === 'members' ? token : '',
        invitationPageToken: kind === 'invitations' ? token : '',
      })
      setDetail(current => {
        if (!current || current.organization?.id !== selectedOrg) return current
        if (kind === 'projects')
          return {
            ...current,
            projects: [...current.projects, ...next.projects],
            nextProjectPageToken: next.nextProjectPageToken,
          }
        if (kind === 'members')
          return {
            ...current,
            members: [...current.members, ...next.members],
            nextMemberPageToken: next.nextMemberPageToken,
          }
        return {
          ...current,
          invitations: [...current.invitations, ...next.invitations],
          nextInvitationPageToken: next.nextInvitationPageToken,
        }
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more organization records')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    let cancelled = false
    setError('')
    setUsersLoading(tab === 'users')
    if (tab === 'users') setUsers([])
    ;(async () => {
      try {
        if (tab === 'organizations') {
          const result = await rpc.listOrganizations({ search, pageSize: 50, pageToken })
          if (!cancelled) {
            setOrgs(result.organizations)
            setNextPageToken(result.nextPageToken)
          }
        } else if (tab === 'users') {
          const result = await rpc.listUsers({
            search,
            pageSize: 50,
            pageToken,
            orgId: userOrgFilter?.id ?? '',
            verified: verifiedFilter,
            enabled: enabledFilter,
          })
          if (!cancelled) {
            setUsers(result.users)
            setNextPageToken(result.nextPageToken)
            setUsersLastUpdated(new Date())
          }
        } else {
          const result = await rpc.listDeletions({ orgId: search.trim(), pageSize: 50, pageToken })
          if (!cancelled) {
            setHistory(result.operations)
            setNextPageToken(result.nextPageToken)
          }
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the instance directory')
      } finally {
        if (!cancelled) setUsersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rpc, tab, search, pageToken, userOrgFilter?.id, verifiedFilter, enabledFilter, revision])

  useEffect(() => {
    if (!selectedOrg) return
    let cancelled = false
    Promise.all([rpc.getOrganization({ orgId: selectedOrg, pageSize: 50 }), rpc.listDeletions({ orgId: selectedOrg })])
      .then(([result, operationList]) => {
        if (!cancelled) {
          setDetail(result)
          setDeletions(operationList.operations)
        }
      })
      .catch(cause => {
        if (cancelled) return
        if (cause instanceof ConnectError && cause.code === Code.NotFound) {
          setDetail(null)
          navigate('/instance/deletions')
          return
        }
        setError(cause instanceof Error ? cause.message : 'Could not load organization')
      })
    return () => {
      cancelled = true
    }
  }, [rpc, selectedOrg, revision, navigate])

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      setConfirmation(null)
      refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const onProvision = () =>
    run(async () => {
      const created = await rpc.provisionOrganization({ name: name.trim(), adminEmail: adminEmail.trim() })
      setName('')
      setAdminEmail('')
      setShowProvision(false)
      await refreshOwnOrgs()
      if (created.organization) navigate(`/instance/organizations/${created.organization.id}`)
      if (created.warning) setError(created.warning)
    })

  const onInvite = () => {
    if (!selectedOrg) return
    run(async () => {
      await rpc.inviteMember({ orgId: selectedOrg, email: inviteEmail.trim(), role: inviteRole })
      setInviteEmail('')
      setShowInvite(false)
    })
  }

  const selectedOrganization = detail?.organization?.id === selectedOrg ? detail.organization : null

  useEffect(() => {
    setConfirmation(null)
    setDeleteProjectId(null)
  }, [organizationSection])

  return (
    <Page
      header={
        selectedOrg ? (
          <div className="space-y-4">
            <nav aria-label="Breadcrumb">
              <ol className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="/instance/organizations"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="size-4" /> Organizations
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="truncate text-foreground" aria-current="page">
                  {selectedOrganization?.name ?? 'Organization'}
                </li>
              </ol>
            </nav>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl tracking-tight">{selectedOrganization?.name ?? 'Organization'}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{selectedOrg}</p>
              </div>
              <div className="flex items-center gap-2">
                {!activeOrg && ownOrgs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBootstrapStatus('loading-org')
                      navigate('/')
                    }}
                  >
                    Choose workspace
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={refresh} aria-label="Refresh organization">
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : undefined
      }
      title={
        selectedOrg
          ? (selectedOrganization?.name ?? 'Organization')
          : tab === 'users'
            ? 'Users'
            : tab === 'deletions'
              ? 'Deletion history'
              : 'Organizations'
      }
      description={
        selectedOrg
          ? selectedOrg
          : tab === 'users'
            ? 'Manage sign-in and organization access across this instance.'
            : tab === 'deletions'
              ? 'Review and manage permanent deletion requests.'
              : 'Manage organizations and their projects across this instance.'
      }
      actions={
        <>
          {!activeOrg && ownOrgs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBootstrapStatus('loading-org')
                navigate('/')
              }}
            >
              Choose workspace
            </Button>
          )}
          {!selectedOrg && tab === 'organizations' && (
            <>
              <Button size="sm" onClick={() => setShowProvision(value => !value)}>
                <Plus className="size-4" /> New organization
              </Button>
            </>
          )}
          {tab !== 'users' && !selectedOrg && (
            <Button variant="ghost" size="icon-sm" onClick={refresh} aria-label="Refresh directory">
              <RefreshCw className="size-4" />
            </Button>
          )}
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-5 rounded-md border border-negative/30 bg-negative/10 p-3 text-sm text-negative">
          {error}
        </p>
      )}
      {selectedOrg ? (
        <div className="w-full">
          <nav aria-label="Organization sections" className="mb-7 flex gap-6 overflow-x-auto border-b">
            {organizationSections.map(section => (
              <a
                key={section}
                href={`/instance/organizations/${selectedOrg}/${section}`}
                aria-current={organizationSection === section ? 'page' : undefined}
                onClick={event => {
                  event.preventDefault()
                  navigate(`/instance/organizations/${selectedOrg}/${section}`)
                }}
                className={`shrink-0 border-b-2 pb-3 text-sm transition-colors ${
                  organizationSection === section
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {section === 'deletions' ? 'Deletion activity' : section[0].toUpperCase() + section.slice(1)}
              </a>
            ))}
          </nav>
          {selectedOrganization && (
            <>
              {organizationSection === 'overview' && (
                <div className="max-w-5xl space-y-8">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Projects</p>
                      <p className="mt-1 text-2xl font-medium tabular-nums">{selectedOrganization.projectCount}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Members</p>
                      <p className="mt-1 text-2xl font-medium tabular-nums">{selectedOrganization.memberCount}</p>
                    </div>
                  </div>
                  <section>
                    <DetailSectionHeader title="Organization" />
                    {selectedOrganization.deletionState !== 'active' && (
                      <p className="mt-2 text-sm text-negative">
                        Organization deletion: {selectedOrganization.deletionState}. See Deletion activity for details.
                      </p>
                    )}
                    {selectedOrganization.needsAdmin && (
                      <p className="mt-2 text-sm text-negative">
                        No enabled organization admin.{' '}
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:no-underline"
                          onClick={() => navigate(`/instance/organizations/${selectedOrg}/members`)}
                        >
                          Invite a replacement
                        </button>
                        .
                      </p>
                    )}
                    {selectedOrganization.createdAt && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Created {new Date(selectedOrganization.createdAt).toLocaleDateString()}
                      </p>
                    )}
                    <form
                      className="mt-4 flex max-w-md gap-2"
                      onSubmit={event => {
                        event.preventDefault()
                        if (name.trim()) run(() => rpc.renameOrganization({ orgId: selectedOrg, name: name.trim() }))
                      }}
                    >
                      <Input
                        aria-label="New organization name"
                        placeholder="New organization name"
                        value={name}
                        onChange={event => setName(event.target.value)}
                        maxLength={150}
                      />
                      <Button
                        type="submit"
                        disabled={busy || !name.trim() || selectedOrganization.deletionState !== 'active'}
                      >
                        Rename
                      </Button>
                    </form>
                  </section>
                  <section className="space-y-3">
                    <DetailSectionHeader title="Delete organization" />
                    <p className="text-sm">
                      Access stops immediately. Purging begins after a 24-hour cancellation window and permanently
                      removes this organization, its projects, events, profiles, dashboards, credentials, and derived
                      analytics. Older backups expire under the instance backup retention policy.
                    </p>
                    {selectedOrganization.deletionState === 'active' &&
                      (!deleteOrgOpen ? (
                        <Button variant="destructive" disabled={busy} onClick={() => setDeleteOrgOpen(true)}>
                          Delete organization
                        </Button>
                      ) : (
                        <div className="max-w-lg space-y-2">
                          <label className="block text-sm" htmlFor="delete-org-id">
                            Type organization ID {selectedOrg}
                          </label>
                          <Input
                            id="delete-org-id"
                            value={deleteOrgId}
                            onChange={event => setDeleteOrgId(event.target.value)}
                          />
                          <label className="block text-sm" htmlFor="delete-org-reason">
                            Reason for audit record
                          </label>
                          <Input
                            id="delete-org-reason"
                            value={deleteReason}
                            onChange={event => setDeleteReason(event.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              disabled={busy || deleteOrgId !== selectedOrg || !deleteReason.trim()}
                              onClick={() =>
                                run(async () => {
                                  await rpc.requestOrganizationDeletion({
                                    orgId: selectedOrg,
                                    confirmationId: deleteOrgId,
                                    reason: deleteReason.trim(),
                                  })
                                  setDeleteOrgOpen(false)
                                  setDeleteOrgId('')
                                  setDeleteReason('')
                                })
                              }
                            >
                              Schedule permanent deletion
                            </Button>
                            <Button variant="ghost" onClick={() => setDeleteOrgOpen(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ))}
                  </section>
                </div>
              )}
              {organizationSection === 'projects' && (
                <section>
                  <DetailSectionHeader title="Projects" count={selectedOrganization.projectCount} />
                  {detail?.projects.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No projects.</p>}
                  <div className="space-y-0.5">
                    {detail?.projects.map(project => (
                      <div
                        key={project.id}
                        className="-mx-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/40"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex-1">
                            {project.name}{' '}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{project.id}</span>{' '}
                            {project.deletionState !== 'active' && (
                              <span className="text-negative">({project.deletionState})</span>
                            )}
                          </span>
                          {project.deletionState === 'active' && selectedOrganization.deletionState === 'active' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busy}
                              onClick={() => {
                                setDeleteProjectId(project.id)
                                setDeleteProjectName('')
                              }}
                            >
                              Delete project
                            </Button>
                          )}
                        </div>
                        {deleteProjectId === project.id && (
                          <div className="mt-3 space-y-2">
                            <p>
                              Permanent deletion starts immediately. Type <strong>{project.name}</strong> to confirm.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Project {project.id} · organization {selectedOrg}. Events, profiles, dashboards,
                              credentials, and derived analytics are purged from live stores. Backups expire under the
                              instance backup retention policy.
                            </p>
                            <Input
                              aria-label={`Confirm deletion of ${project.name}`}
                              value={deleteProjectName}
                              onChange={event => setDeleteProjectName(event.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={busy || deleteProjectName !== project.name}
                                onClick={() =>
                                  run(async () => {
                                    await rpc.requestProjectDeletion({
                                      orgId: selectedOrg,
                                      projectId: project.id,
                                      confirmationName: deleteProjectName,
                                    })
                                    setDeleteProjectId(null)
                                  })
                                }
                              >
                                Request permanent deletion
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteProjectId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {detail?.nextProjectPageToken && (
                    <Button className="mt-2" variant="outline" disabled={busy} onClick={() => loadMore('projects')}>
                      Load more projects
                    </Button>
                  )}
                </section>
              )}
              {organizationSection === 'deletions' && (
                <section className="space-y-3">
                  <DetailSectionHeader title="Deletion operations" count={deletions.length} />
                  {deletions.length === 0 && <p className="text-sm text-muted-foreground">No deletion operations.</p>}
                  {deletions.map(operation => (
                    <div
                      key={operation.id}
                      className="-mx-2 flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/40"
                    >
                      <span className="flex-1">
                        <strong>{operation.targetName}</strong> · {operation.targetType} · {operation.status}
                        <br />
                        <span className="font-mono text-xs text-muted-foreground">{operation.id}</span>
                        <span className="block text-xs text-muted-foreground">
                          Requested by {operation.actorEmail || operation.actorId}
                        </span>
                        {operation.reason && <span className="block text-xs">Reason: {operation.reason}</span>}
                        {operation.projects.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            ClickHouse {operation.projects.filter(project => project.clickhouseDone).length}/
                            {operation.projects.length} · PostgreSQL{' '}
                            {operation.projects.filter(project => project.postgresDone).length}/
                            {operation.projects.length} projects purged
                          </span>
                        )}
                        {operation.status === 'pending_deletion' && operation.targetType === 'organization' && (
                          <span className="ml-2">Purge after {new Date(operation.purgeAfter).toLocaleString()}</span>
                        )}
                        {operation.lastError && <span className="block text-negative">{operation.lastError}</span>}
                      </span>
                      {operation.targetType === 'organization' && operation.status === 'pending_deletion' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => run(() => rpc.cancelOrganizationDeletion({ operationId: operation.id }))}
                        >
                          Cancel deletion
                        </Button>
                      )}
                      {operation.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => run(() => rpc.retryDeletion({ operationId: operation.id }))}
                        >
                          Retry purge
                        </Button>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {organizationSection === 'members' && (
                <section>
                  <DetailSectionHeader title="Members" count={selectedOrganization.memberCount} />
                  {detail?.members.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No members.</p>}
                  <div className="space-y-0.5">
                    {detail?.members.map(member => (
                      <div
                        key={member.id}
                        className="group -mx-2 flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/40"
                      >
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                          <span className="text-xs font-medium text-muted-foreground">{initials(member.email)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{member.email.split('@')[0]}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{member.email}</p>
                        </div>
                        {member.disabled && <Badge variant="secondary">Disabled</Badge>}
                        <Select
                          value={
                            member.memberships.find(membership => membership.orgId === selectedOrg)?.role ??
                            OrgRole.MEMBER
                          }
                          disabled={busy || selectedOrganization.deletionState !== 'active'}
                          onValueChange={role =>
                            run(() =>
                              rpc.setMemberRole({
                                orgId: selectedOrg,
                                userId: member.id,
                                role: role ?? OrgRole.MEMBER,
                              }),
                            )
                          }
                        >
                          <SelectTrigger size="sm" className="shrink-0" aria-label={`Role for ${member.email}`}>
                            <SelectValue>{role => roleName(role ?? OrgRole.MEMBER)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-0 p-1">
                            {roles.map(role => (
                              <SelectItem key={role} value={role}>
                                {roleName(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {confirmation?.kind === 'remove' && confirmation.id === member.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs">Remove {member.email}?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busy || selectedOrganization.deletionState !== 'active'}
                              onClick={() => run(() => rpc.removeMember({ orgId: selectedOrg, userId: member.id }))}
                            >
                              Confirm
                            </Button>
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmation(null)}>
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove ${member.email}`}
                                  disabled={busy || selectedOrganization.deletionState !== 'active'}
                                  onClick={() => setConfirmation({ kind: 'remove', id: member.id })}
                                />
                              }
                            >
                              <Trash2 className="size-4" />
                            </TooltipTrigger>
                            <TooltipContent>Remove member</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ))}
                  </div>
                  {detail?.nextMemberPageToken && (
                    <Button className="mt-2" variant="outline" disabled={busy} onClick={() => loadMore('members')}>
                      Load more members
                    </Button>
                  )}
                  {selectedOrganization.deletionState === 'active' &&
                    (showInvite ? (
                      <form
                        className="mt-2 flex flex-wrap items-center gap-2 pl-2"
                        onSubmit={event => {
                          event.preventDefault()
                          onInvite()
                        }}
                      >
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/50">
                          <Plus className="size-3 text-muted-foreground" />
                        </div>
                        <Input
                          ref={inviteInputRef}
                          type="email"
                          aria-label="Invite email"
                          placeholder="colleague@company.com"
                          value={inviteEmail}
                          onChange={event => setInviteEmail(event.target.value)}
                          required
                          className="max-w-xs flex-1"
                        />
                        <Select value={inviteRole} onValueChange={role => setInviteRole(role ?? OrgRole.MEMBER)}>
                          <SelectTrigger className="shrink-0" aria-label="Invitation role">
                            <SelectValue>{role => roleName(role ?? OrgRole.MEMBER)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-0 p-1">
                            {roles.map(role => (
                              <SelectItem key={role} value={role}>
                                {roleName(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="submit"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Send invitation"
                          disabled={busy || !inviteEmail.trim()}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Cancel invitation"
                          onClick={() => {
                            setShowInvite(false)
                            setInviteEmail('')
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowInvite(true)
                          setTimeout(() => inviteInputRef.current?.focus(), 0)
                        }}
                        className="-mx-2 mt-1 flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
                          <Plus className="size-3" />
                        </span>
                        Invite member
                      </button>
                    ))}
                </section>
              )}
              {organizationSection === 'invitations' && (
                <section>
                  <DetailSectionHeader title="Pending invitations" count={detail?.invitations.length ?? 0} />
                  {detail?.invitations.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">No pending invitations.</p>
                  )}
                  <div className="space-y-0.5">
                    {detail?.invitations.map(invitation => (
                      <div
                        key={invitation.id}
                        className="-mx-2 flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/40"
                      >
                        <span className="flex-1">
                          {invitation.email} · {roleName(invitation.role)} · expires{' '}
                          {new Date(invitation.expiresAt).toLocaleDateString()}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || selectedOrganization.deletionState !== 'active'}
                          onClick={() =>
                            run(() => rpc.resendInvitation({ orgId: selectedOrg, invitationId: invitation.id }))
                          }
                        >
                          Resend
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || selectedOrganization.deletionState !== 'active'}
                          onClick={() =>
                            run(() => rpc.revokeInvitation({ orgId: selectedOrg, invitationId: invitation.id }))
                          }
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                  {detail?.nextInvitationPageToken && (
                    <Button className="mt-2" variant="outline" disabled={busy} onClick={() => loadMore('invitations')}>
                      Load more invitations
                    </Button>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={tab === 'deletions' ? 'max-w-5xl' : 'w-full'}>
          {tab === 'users' ? (
            <InstanceUserFilters
              filterBarRef={filterBarRef}
              search={search}
              onSearchChange={value => {
                setSearch(value)
                resetPagination()
              }}
              organization={userOrgFilter}
              onOrganizationChange={value => {
                setUserOrgFilter(value)
                resetPagination()
              }}
              verified={verifiedFilter}
              onVerifiedChange={value => {
                setVerifiedFilter(value)
                resetPagination()
              }}
              enabled={enabledFilter}
              onEnabledChange={value => {
                setEnabledFilter(value)
                resetPagination()
              }}
              loading={usersLoading}
              onRefresh={refresh}
              lastUpdated={usersLastUpdated}
            />
          ) : (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <Input
                aria-label={tab === 'deletions' ? 'Filter deletion history by organization ID' : 'Search organizations'}
                placeholder={tab === 'deletions' ? 'Organization ID (optional)' : 'Search organizations by name or ID'}
                value={search}
                onChange={event => {
                  setSearch(event.target.value)
                  resetPagination()
                }}
                className="w-full max-w-md sm:w-72"
              />
            </div>
          )}
          {tab === 'organizations' ? (
            <>
              {showProvision && (
                <form
                  className="mb-8 flex max-w-xl flex-col gap-3 rounded-lg border bg-muted/20 p-4"
                  onSubmit={event => {
                    event.preventDefault()
                    onProvision()
                  }}
                >
                  <p className="text-sm font-medium">New organization</p>
                  <Input
                    aria-label="Organization name"
                    placeholder="Organization name"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    required
                    maxLength={150}
                  />
                  <Input
                    aria-label="Initial admin email"
                    type="email"
                    placeholder="Initial admin email"
                    value={adminEmail}
                    onChange={event => setAdminEmail(event.target.value)}
                    required
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={busy}>
                      Create organization
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowProvision(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
              <SectionHeader title="Organizations" count={orgs.length} />
              <div className="space-y-0.5">
                {orgs.length === 0 && <p className="py-8 text-sm text-muted-foreground">No organizations found.</p>}
                {orgs.map(org => (
                  <button
                    key={org.id}
                    type="button"
                    className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/40"
                    onClick={() => navigate(`/instance/organizations/${org.id}`)}
                  >
                    <NameChip name={org.name} fallback="O" className="size-8 shrink-0 rounded-md text-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{org.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{org.id}</span>
                    </span>
                    <span className="hidden max-w-72 text-right text-xs text-muted-foreground sm:block">
                      <span className="block">
                        {org.memberCount} members · {org.projectCount} projects
                      </span>
                      <span className="block truncate">
                        {org.deletionState !== 'active'
                          ? org.deletionState
                          : org.needsAdmin
                            ? 'Needs an enabled admin'
                            : org.adminEmails.join(', ') || 'Awaiting first admin'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : tab === 'users' ? (
            <>
              {!usersLoading && users.length > 0 && (
                <div className="mt-4 mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Users</span>
                  <span className="text-xs text-muted-foreground">{users.length}</span>
                </div>
              )}
              <div className="overflow-x-auto min-[1400px]:overflow-x-clip">
                <table className="w-full min-w-[840px] border-collapse" aria-label="Users">
                  <thead className="static z-9 bg-background min-[1400px]:sticky" style={{ top: filterBarHeight }}>
                    <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3 text-left font-medium">User</th>
                      <th className="py-2 pr-3 text-left font-medium">Organizations</th>
                      <th className="py-2 pr-3 text-left font-medium">Verified</th>
                      <th className="py-2 pr-3 text-left font-medium">Enabled</th>
                      <th className="py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <Fragment key={user.id}>
                        <tr className="border-b border-border/50 transition-colors hover:bg-muted/40">
                          <td className="py-3 pr-3 text-sm">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                                {user.email.slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <span className="block truncate font-medium" title={user.email}>
                                  {user.email}
                                </span>
                                <span
                                  className="block truncate font-mono text-xs text-muted-foreground"
                                  title={user.id}
                                >
                                  {user.id}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-sm text-muted-foreground">
                            <UserOrganizations memberships={user.memberships} email={user.email} />
                          </td>
                          <td className="py-3 pr-3">
                            <Badge variant={user.emailVerified ? 'secondary' : 'outline'}>
                              {user.emailVerified ? 'Verified' : 'Unverified'}
                            </Badge>
                          </td>
                          <td className="py-3 pr-3">
                            <Badge variant={user.disabled ? 'destructive' : 'secondary'}>
                              {user.disabled ? 'Disabled' : 'Enabled'}
                            </Badge>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={`Revoke sessions for ${user.email}`}
                                      disabled={busy}
                                      onClick={() => setConfirmation({ kind: 'sessions', id: user.id })}
                                    />
                                  }
                                >
                                  <LogOut className="size-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>Revoke sessions</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      className={
                                        user.disabled ? 'text-positive' : 'text-muted-foreground hover:text-negative'
                                      }
                                      aria-label={`${user.disabled ? 'Enable' : 'Disable'} sign-in for ${user.email}`}
                                      disabled={busy}
                                      onClick={() => setConfirmation({ kind: 'toggle', id: user.id })}
                                    />
                                  }
                                >
                                  {user.disabled ? <UserCheck className="size-3.5" /> : <UserX className="size-3.5" />}
                                </TooltipTrigger>
                                <TooltipContent>{user.disabled ? 'Enable sign-in' : 'Disable sign-in'}</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                        {confirmation?.id === user.id && (
                          <tr className="border-b border-border/50 bg-muted/20">
                            <td colSpan={5} className="py-2 pr-2">
                              <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                                <span className="text-muted-foreground">
                                  {confirmation.kind === 'sessions'
                                    ? `Revoke all sessions for ${user.email}?`
                                    : `${user.disabled ? 'Enable' : 'Disable'} sign-in for ${user.email}?`}
                                </span>
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        size="icon-sm"
                                        variant={
                                          confirmation.kind === 'toggle' && !user.disabled ? 'destructive' : 'outline'
                                        }
                                        aria-label={
                                          confirmation.kind === 'sessions'
                                            ? `Confirm revoking sessions for ${user.email}`
                                            : `Confirm ${user.disabled ? 'enabling' : 'disabling'} sign-in for ${user.email}`
                                        }
                                        disabled={busy}
                                        onClick={() =>
                                          run(() =>
                                            confirmation.kind === 'sessions'
                                              ? rpc.revokeUserSessions({ userId: user.id })
                                              : rpc.setUserDisabled({ userId: user.id, disabled: !user.disabled }),
                                          )
                                        }
                                      />
                                    }
                                  >
                                    <Check className="size-3.5" />
                                  </TooltipTrigger>
                                  <TooltipContent>Confirm</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        aria-label={`Cancel action for ${user.email}`}
                                        disabled={busy}
                                        onClick={() => setConfirmation(null)}
                                      />
                                    }
                                  >
                                    <X className="size-3.5" />
                                  </TooltipTrigger>
                                  <TooltipContent>Cancel</TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {usersLoading && <p className="py-16 text-center text-sm text-muted-foreground">Loading users…</p>}
              {!usersLoading && users.length === 0 && !error && (
                <p className="py-16 text-center text-sm text-muted-foreground">No users match these filters.</p>
              )}
            </>
          ) : (
            <div className="space-y-0.5">
              <SectionHeader title="Deletion operations" count={history.length} />
              {history.length === 0 && <p className="text-sm text-muted-foreground">No deletion operations.</p>}
              {history.map(operation => (
                <div
                  key={operation.id}
                  className="-mx-2 flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <strong>{operation.targetName}</strong> · {operation.targetType} · {operation.status}
                    <br />
                    <span className="font-mono text-xs text-muted-foreground">
                      {operation.id} · organization {operation.orgId}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Requested by {operation.actorEmail || operation.actorId}
                    </span>
                    {operation.reason && <span className="block text-xs">Reason: {operation.reason}</span>}
                    {operation.projects.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        ClickHouse {operation.projects.filter(project => project.clickhouseDone).length}/
                        {operation.projects.length} · PostgreSQL{' '}
                        {operation.projects.filter(project => project.postgresDone).length}/{operation.projects.length}{' '}
                        projects purged
                      </span>
                    )}
                    {operation.status === 'pending_deletion' && operation.targetType === 'organization' && (
                      <span className="block">Purge after {new Date(operation.purgeAfter).toLocaleString()}</span>
                    )}
                    {operation.lastError && <span className="block text-negative">{operation.lastError}</span>}
                  </span>
                  {operation.targetType === 'organization' && operation.status === 'pending_deletion' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => run(() => rpc.cancelOrganizationDeletion({ operationId: operation.id }))}
                    >
                      Cancel deletion
                    </Button>
                  )}
                  {operation.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => run(() => rpc.retryDeletion({ operationId: operation.id }))}
                    >
                      Retry purge
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 flex gap-2">
            {previousTokens.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setPageToken(previousTokens[previousTokens.length - 1])
                  setPreviousTokens(tokens => tokens.slice(0, -1))
                }}
              >
                Previous page
              </Button>
            )}
            {nextPageToken && (
              <Button
                variant="outline"
                onClick={() => {
                  setPreviousTokens(tokens => [...tokens, pageToken])
                  setPageToken(nextPageToken)
                }}
              >
                Next page
              </Button>
            )}
          </div>
        </div>
      )}
    </Page>
  )
}

export default InstanceConsole
