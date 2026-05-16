import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { Suspense, useEffect } from 'react'
import { isAuthenticatedAtom } from '@/auth/auth.atoms'
import LoadingSpinner from '@/components/loading-spinner'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { applyTheme, themeAtom } from '@/data/theme.atoms'
import {
  activeOrgAtom,
  activeProjectAtom,
  fetchOrgsAtom,
  fetchProjectsAtom,
  orgsAtom,
  projectsAtom,
  resetWorkspaceAtom,
  workspaceErrorAtom,
} from '@/data/workspace.atoms'
import { lazyWithRetry } from '@/lib/lazy'

const AppSidebar = lazyWithRetry(() => import('@/components/layout/sidebar'), 'sidebar')
const Router = lazyWithRetry(() => import('@/pages/router'), 'router')
const SignIn = lazyWithRetry(() => import('@/pages/sign-in'), 'sign-in')

const ThemeSync = () => {
  const theme = useAtomValue(themeAtom)
  useEffect(() => {
    applyTheme(theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])
  return null
}

const WorkspaceBootstrap = () => {
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const orgs = useAtomValue(orgsAtom)
  const projects = useAtomValue(projectsAtom)
  const [activeOrg, setActiveOrg] = useAtom(activeOrgAtom)
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const fetchProjects = useSetAtom(fetchProjectsAtom)
  const resetWorkspace = useSetAtom(resetWorkspaceAtom)

  useEffect(() => {
    if (!authenticated) {
      resetWorkspace()
      return
    }
    fetchOrgs()
  }, [authenticated, fetchOrgs, resetWorkspace])

  useEffect(() => {
    if (orgs.length === 0) {
      if (activeOrg) setActiveOrg(null)
      return
    }
    if (!activeOrg || !orgs.some(org => org.id === activeOrg.id)) {
      setActiveOrg(orgs[0])
    }
  }, [orgs, activeOrg, setActiveOrg])

  useEffect(() => {
    if (!activeOrg) return
    setActiveProject(null)
    fetchProjects()
  }, [activeOrg, fetchProjects, setActiveProject])

  useEffect(() => {
    if (projects.length === 0) {
      if (activeProject) setActiveProject(null)
      return
    }
    if (!activeProject || !projects.some(project => project.id === activeProject.id)) {
      setActiveProject(projects[0])
    }
  }, [projects, activeProject, setActiveProject])

  return null
}

const AuthenticatedApp = () => {
  return (
    <SidebarProvider>
      <WorkspaceBootstrap />
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main className="flex-1 min-w-0 overflow-x-clip">
          <Suspense fallback={<LoadingSpinner />}>
            <Router />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

const WorkspaceError = ({ message }: { message: string }) => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
      <p className="text-sm font-medium mb-1">Unable to load workspace</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">{message}</p>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  </div>
)

const App = () => {
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const workspaceError = useAtomValue(workspaceErrorAtom)
  return (
    <>
      <ThemeSync />
      {!authenticated ? (
        <Suspense fallback={<LoadingSpinner />}>
          <SignIn />
        </Suspense>
      ) : workspaceError ? (
        <WorkspaceError message={workspaceError} />
      ) : (
        <AuthenticatedApp />
      )}
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
