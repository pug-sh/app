import { signOutAtom } from '@/auth/jwt.atoms'
import { type Theme, themeAtom } from '@/data/theme.atoms'
import {
  activeOrgAtom,
  activeProjectAtom,
  createProjectAtom,
  fetchOrgsAtom,
  fetchProjectsAtom,
  orgsAtom,
  projectsAtom,
} from '@/data/workspace.atoms'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  Bell,
  BookOpen,
  Check,
  ChevronsUpDown,
  FolderOpen,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'

const navItems = [
  { path: 'overview', label: 'Overview', icon: LayoutDashboard },
  { path: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { path: 'insights', label: 'Insights', icon: TrendingUp },
  { path: 'events', label: 'Events', icon: BookOpen },
  { path: 'members', label: 'Members', icon: Users },
  { path: 'settings', label: 'Settings', icon: Settings },
]

const AppSidebar = () => {
  const [location, navigate] = useLocation()
  const orgs = useAtomValue(orgsAtom)
  const projects = useAtomValue(projectsAtom)
  const [activeOrg, setActiveOrg] = useAtom(activeOrgAtom)
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const fetchProjects = useSetAtom(fetchProjectsAtom)
  const createProject = useSetAtom(createProjectAtom)
  const signOut = useSetAtom(signOutAtom)
  const [theme, setTheme] = useAtom(themeAtom)

  const prefix = activeProject ? `/p/${activeProject.id}` : ''
  // Extract the page path from current location (strip /p/:projectId prefix)
  const pagePath = useMemo(() => {
    const match = location.match(/^\/p\/[^/]+\/(.*)$/)
    return match ? match[1] : 'overview'
  }, [location])
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchOrgs()
  }, [fetchOrgs])
  useEffect(() => {
    if (orgs.length > 0 && !activeOrg) setActiveOrg(orgs[0])
  }, [orgs, activeOrg, setActiveOrg])
  useEffect(() => {
    if (activeOrg) fetchProjects()
  }, [activeOrg, fetchProjects])
  useEffect(() => {
    if (projects.length > 0 && !activeProject) setActiveProject(projects[0])
  }, [projects, activeProject, setActiveProject])
  useEffect(() => {
    if (creatingProject) inputRef.current?.focus()
  }, [creatingProject])

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    setSaving(true)
    try {
      await createProject(newProjectName.trim())
      setNewProjectName('')
      setCreatingProject(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sidebar collapsible='icon'>
      {/* Logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' render={<Link href={`${prefix}/overview`} />}>
              <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
                <Bell className='size-4' />
              </div>
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-semibold'>Cotton</span>
                <span className='truncate text-xs text-muted-foreground'>{activeOrg?.displayName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Project switcher */}
        <SidebarGroup>
          <SidebarGroupLabel>Project</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton />}>
                  <FolderOpen className='size-4' />
                  <span>{activeProject?.displayName ?? 'Select project'}</span>
                  <ChevronsUpDown className='ml-auto size-4' />
                </DropdownMenuTrigger>
                <DropdownMenuContent className='min-w-56 rounded-lg' align='start' sideOffset={4}>
                  <DropdownMenuLabel className='text-xs text-muted-foreground'>Projects</DropdownMenuLabel>
                  {projects.map(proj => (
                    <DropdownMenuItem
                      key={proj.id}
                      onSelect={() => {
                        setActiveProject(proj)
                        navigate(`/p/${proj.id}/${pagePath}`)
                      }}
                    >
                      <FolderOpen className='size-4' />
                      {proj.displayName}
                      {proj.id === activeProject?.id && <Check className='ml-auto size-4' />}
                    </DropdownMenuItem>
                  ))}
                  {projects.length === 0 && !creatingProject && (
                    <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {creatingProject ? (
                    <div className='px-2 py-1.5'>
                      <div className='flex items-center gap-1'>
                        <input
                          ref={inputRef}
                          value={newProjectName}
                          onChange={e => setNewProjectName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleCreateProject()
                            if (e.key === 'Escape') {
                              setCreatingProject(false)
                              setNewProjectName('')
                            }
                          }}
                          placeholder='Project name'
                          className='flex-1 min-w-0 text-sm px-2 py-1 rounded-md border border-input bg-transparent outline-none focus:border-ring focus:ring-1 focus:ring-ring/50'
                          disabled={saving}
                        />
                        <button
                          onClick={handleCreateProject}
                          disabled={saving || !newProjectName.trim()}
                          className='p-1 rounded-md hover:bg-muted text-primary disabled:opacity-50 cursor-pointer'
                        >
                          {saving ? <Loader2 className='size-3.5 animate-spin' /> : <Check className='size-3.5' />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    activeOrg && (
                      <DropdownMenuItem onSelect={() => setCreatingProject(true)}>
                        <Plus className='size-4' />
                        New project
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map(item => {
              const href = `${prefix}/${item.path}`
              const isActive = pagePath === item.path || (item.path !== 'overview' && pagePath.startsWith(item.path))
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
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                const next: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
                setTheme(next[theme])
              }}
              tooltip={`Theme: ${theme}`}
            >
              {theme === 'light' && <Sun />}
              {theme === 'dark' && <Moon />}
              {theme === 'system' && <Monitor />}
              <span className='capitalize'>{theme}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut()} tooltip='Sign out'>
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
