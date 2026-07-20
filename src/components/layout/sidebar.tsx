import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  BookOpen,
  Check,
  ChevronsUpDown,
  ContactRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  PanelsTopLeft,
  Plus,
  Radio,
  Settings,
  Sun,
  TrendingUp,
  Users,
} from 'lucide-react'
import { type CSSProperties, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Link, useLocation } from 'wouter'
import { signOutAtom } from '@/auth/auth.atoms'
import { Can } from '@/auth/can'
import { isDemoSessionAtom } from '@/auth/demo'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { type Theme, themeAtom } from '@/data/theme.atoms'
import {
  activeOrgAtom,
  activeProjectAtom,
  createProjectAtom,
  orgsAtom,
  projectsAtom,
  refreshOrgsAtom,
  selectOrgAtom,
} from '@/data/workspace.atoms'
import { useRouteProjectId } from '@/lib/project-path'
import { cn } from '@/lib/utils'

const navGroups = [
  {
    label: null,
    items: [
      { path: 'overview', label: 'Overview', icon: LayoutDashboard },
      { path: 'live', label: 'Live', icon: Radio },
      { path: 'dashboards', label: 'Dashboards', icon: PanelsTopLeft },
      { path: 'insights', label: 'Insights', icon: TrendingUp },
    ],
  },
  {
    label: 'Data',
    items: [
      { path: 'profiles', label: 'Profiles', icon: ContactRound },
      { path: 'events', label: 'Events', icon: BookOpen },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { path: 'members', label: 'Members', icon: Users },
      { path: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

// Nav paths hidden during the read-only demo. Settings exposes the shared demo account's
// email/password + org config; its /settings route is guarded in SettingsLayout as well.
const DEMO_HIDDEN_PATHS = ['settings']

const getProjectInitial = (projectName?: string | null) => {
  const normalizedName = projectName?.trim()
  if (!normalizedName) return 'P'
  return normalizedName.charAt(0).toUpperCase()
}

// Same name-hashed hue scheme as profile avatars, but as a washed-out tint —
// this chip is persistent chrome, not content, so it stays quiet.
const projectHue = (projectName?: string | null) => {
  const seed = projectName?.trim() || 'project'
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360
  return hash
}

const ProjectChip = ({ name, className }: { name?: string | null; className?: string }) => (
  <span
    className={cn(
      'flex shrink-0 items-center justify-center rounded-md font-medium',
      'bg-[oklch(0.93_0.035_var(--tone))] text-[oklch(0.45_0.08_var(--tone))]',
      'dark:bg-[oklch(0.37_0.045_var(--tone))] dark:text-[oklch(0.86_0.05_var(--tone))]',
      className,
    )}
    style={{ '--tone': projectHue(name) } as CSSProperties}
    aria-hidden
  >
    {getProjectInitial(name)}
  </span>
)

const AppSidebar = () => {
  const [location, navigate] = useLocation()
  const projects = useAtomValue(projectsAtom)
  const orgs = useAtomValue(orgsAtom)
  const activeOrg = useAtomValue(activeOrgAtom)
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const createProject = useSetAtom(createProjectAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const refreshOrgs = useSetAtom(refreshOrgsAtom)
  const signOut = useSetAtom(signOutAtom)
  const isDemo = useAtomValue(isDemoSessionAtom)
  const [theme, setTheme] = useAtom(themeAtom)

  const routeProjectId = useRouteProjectId()
  const currentProjectId = routeProjectId ?? activeProject?.id ?? null
  const prefix = currentProjectId ? `/p/${currentProjectId}` : ''
  const pagePath = location.match(/^\/p\/[^/]+\/(.*)$/)?.[1] ?? 'overview'

  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [saving, setSaving] = useState(false)

  // No default project pick here — WorkspaceBootstrap owns the only one. A copy flushes after it in
  // the same pass, still seeing activeProject null, and overwrites the restored pick with projects[0].

  // On mount, not on open: the count decides whether the Organizations section renders, and
  // resolving that late makes it appear under the cursor.
  useEffect(() => {
    refreshOrgs()
  }, [refreshOrgs])

  const closeSwitcher = () => {
    setSwitcherOpen(false)
    setCreating(false)
    setNewProjectName('')
    setSaving(false)
  }

  const handleSelectProject = (projectId: string) => {
    const project = projects.find(proj => proj.id === projectId)
    if (project) {
      setActiveProject(project)
      navigate(`/p/${project.id}/${pagePath.startsWith('dashboards/') ? 'dashboards' : pagePath}`)
    }
    closeSwitcher()
  }

  // Hands the switch to the bootstrap rather than fetching projects and picking one here: '/' is the
  // route that names no project, so WorkspaceBootstrap runs its own restore-last-visit-then-first
  // rule and ProjectRedirect navigates once the pick lands. Picking here as well would be a second
  // copy of that rule — the one the settings page used to hold — racing the first.
  //
  // Unconditionally '/', unlike a project switch, which keeps you on the current page: deep routes
  // here are keyed by a dashboard or profile belonging to the org being left. Replace rather than
  // push for the same reason — that URL names a project of the org just left, so Back lands on
  // "Project not found", and nothing corrects it: the pick has already happened, so the bootstrap's
  // default-pick effect sees a valid active project and declines to act.
  const handleSelectOrg = (orgId: string) => {
    const target = orgs.find(org => org.id === orgId)
    if (target && target.id !== activeOrg?.id) {
      selectOrg(target)
      navigate('/', { replace: true })
    }
    closeSwitcher()
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || saving) return
    setSaving(true)
    try {
      const project = await createProject(newProjectName.trim())
      closeSwitcher()
      if (project) navigate(`/p/${project.id}/overview`)
    } catch {
      toast.error('Failed to create project')
      setSaving(false)
    }
  }

  const cycleTheme = () => {
    const next: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
    setTheme(next[theme])
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Popover
              open={switcherOpen}
              onOpenChange={open => {
                if (open) setSwitcherOpen(true)
                else closeSwitcher()
              }}
            >
              <PopoverTrigger render={<SidebarMenuButton size="lg" />}>
                <ProjectChip name={activeProject?.displayName} className="size-8 text-sm" />
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {activeOrg?.displayName ?? 'Workspace'}
                  </span>
                  <span className="truncate font-medium text-foreground">
                    {activeProject?.displayName ?? 'Select project'}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={6} className="w-(--anchor-width) min-w-56 gap-0 p-1.5">
                {/* Signup auto-creates an org, so for most accounts this is one entry worth no space. */}
                {orgs.length > 1 && (
                  <>
                    <div className="flex items-center gap-2 px-2 pt-1.5 pb-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Organizations
                      </span>
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground tabular-nums">{orgs.length}</span>
                    </div>
                    <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                      {orgs.map(org => (
                        <button
                          key={org.id}
                          type="button"
                          onClick={() => handleSelectOrg(org.id)}
                          className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent"
                        >
                          <span className="min-w-0 flex-1 truncate">{org.displayName}</span>
                          {org.id === activeOrg?.id ? <Check className="size-3.5 shrink-0 text-link" /> : null}
                        </button>
                      ))}
                    </div>
                    <div className="mx-1 my-1.5 h-px bg-border/70" />
                  </>
                )}
                <div className="flex items-center gap-2 px-2 pt-1.5 pb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Projects</span>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground tabular-nums">{projects.length}</span>
                </div>
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                  {projects.map(proj => {
                    const selected = proj.id === currentProjectId
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => handleSelectProject(proj.id)}
                        className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <ProjectChip name={proj.displayName} className="size-5 rounded text-xs" />
                        <span className="min-w-0 flex-1 truncate">{proj.displayName}</span>
                        {selected ? <Check className="size-3.5 shrink-0 text-link" /> : null}
                      </button>
                    )
                  })}
                </div>
                <Can action="create" resource="project">
                  <div className="mx-1 my-1.5 h-px bg-border/70" />
                  {creating ? (
                    <div className="flex items-center gap-1.5 p-0.5">
                      <Input
                        autoFocus
                        value={newProjectName}
                        onChange={e => setNewProjectName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCreateProject()
                          if (e.key === 'Escape') {
                            e.stopPropagation()
                            setCreating(false)
                            setNewProjectName('')
                          }
                        }}
                        placeholder="Project name"
                        disabled={saving}
                        className="h-8 flex-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleCreateProject}
                        disabled={saving || !newProjectName.trim()}
                        className="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-link transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="size-3.5 animate-spin" /> : 'Create'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreating(true)}
                      disabled={!activeOrg}
                      className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-link transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                      New project
                    </button>
                  )}
                </Can>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, groupIndex) => {
          const items = isDemo ? group.items.filter(item => !DEMO_HIDDEN_PATHS.includes(item.path)) : group.items
          if (items.length === 0) return null
          return (
            <SidebarGroup key={group.label ?? groupIndex} className="py-1 first:pt-2">
              {group.label ? (
                <SidebarGroupLabel className="h-7 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                  {group.label}
                </SidebarGroupLabel>
              ) : null}
              <SidebarMenu className="gap-1">
                {items.map(item => {
                  const href = `${prefix}/${item.path}`
                  const isActive =
                    pagePath === item.path || (item.path !== 'overview' && pagePath.startsWith(item.path))
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton render={<Link href={href} />} isActive={isActive} tooltip={item.label}>
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={cycleTheme} tooltip={`Theme: ${theme}`}>
              {theme === 'light' && <Sun />}
              {theme === 'dark' && <Moon />}
              {theme === 'system' && <Monitor />}
              <span className="capitalize">{theme}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              // Dropping the /p/:projectId URL is App's job, not this button's — it has to happen
              // for a session that expires too, which has no button to hang off. See App.tsx.
              onClick={() => signOut()}
              tooltip="Sign out"
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

export default AppSidebar
