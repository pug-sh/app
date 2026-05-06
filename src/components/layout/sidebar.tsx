import { signOutAtom } from '@/auth/auth.atoms'
import { Input } from '@/components/ui/input'
import { type Theme, themeAtom } from '@/data/theme.atoms'
import {
  activeOrgAtom,
  activeProjectAtom,
  createProjectAtom,
  projectsAtom,
} from '@/data/workspace.atoms'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  BookOpen,
  Check,
  ChevronsUpDown,
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
  UsersRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link, useLocation } from 'wouter'

const navItems = [
  { path: 'overview', label: 'Overview', icon: LayoutDashboard },
  { path: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { path: 'insights', label: 'Insights', icon: TrendingUp },
  { path: 'segments', label: 'Segments', icon: UsersRound },
  { path: 'events', label: 'Events', icon: BookOpen },
  { path: 'members', label: 'Members', icon: Users },
  { path: 'settings', label: 'Settings', icon: Settings },
]

const AppSidebar = () => {
  const [location, navigate] = useLocation()
  const projects = useAtomValue(projectsAtom)
  const activeOrg = useAtomValue(activeOrgAtom)
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const createProject = useSetAtom(createProjectAtom)
  const signOut = useSetAtom(signOutAtom)
  const [theme, setTheme] = useAtom(themeAtom)

  const routeProjectId = location.match(/^\/p\/([^/]+)/)?.[1] ?? null
  const currentProjectId = routeProjectId ?? activeProject?.id ?? null
  const prefix = currentProjectId ? `/p/${currentProjectId}` : ''
  const pagePath = location.match(/^\/p\/[^/]+\/(.*)$/)?.[1] ?? 'overview'
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (projects.length === 0 || activeProject || routeProjectId) return
    setActiveProject(projects[0])
  }, [projects, activeProject, routeProjectId, setActiveProject])
  useEffect(() => {
    if (createProjectOpen) inputRef.current?.focus()
  }, [createProjectOpen])

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    setSaving(true)
    try {
      const project = await createProject(newProjectName.trim())
      setNewProjectName('')
      setCreateProjectOpen(false)
      if (project) navigate(`/p/${project.id}/overview`)
    } catch {
      toast.error('Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sidebar collapsible="icon">
      <Dialog
        open={createProjectOpen}
        onOpenChange={open => {
          setCreateProjectOpen(open)
          if (!open) {
            setNewProjectName('')
            setSaving(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Create a project in {activeOrg?.displayName ?? 'your workspace'}.</DialogDescription>
          </DialogHeader>
          <div className="px-0.5">
            <Input
              ref={inputRef}
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateProject()
              }}
              placeholder="Project name"
              disabled={saving}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateProjectOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={saving || !newProjectName.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {activeOrg?.displayName ?? 'Workspace'}
                  </span>
                  <span className="truncate font-semibold">{activeProject?.displayName ?? 'Select project'}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={8}>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{activeOrg?.displayName ?? 'Workspace'}</DropdownMenuLabel>
                  {projects.map(proj => {
                    const selected = proj.id === currentProjectId
                    return (
                      <DropdownMenuItem
                        key={proj.id}
                        onClick={() => {
                          setActiveProject(proj)
                          navigate(`/p/${proj.id}/${pagePath}`)
                        }}
                        className="gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{proj.displayName}</div>
                        </div>
                        {selected ? <Check className="ml-auto size-4 text-sidebar-primary" /> : null}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setCreateProjectOpen(true)}
                  disabled={!activeOrg}
                  className="min-h-9 gap-2 text-sidebar-primary"
                >
                  <Plus className="size-4" />
                  New project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
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
              <span className="capitalize">{theme}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut()} tooltip="Sign out">
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
