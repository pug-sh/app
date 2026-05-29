import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { Suspense, useEffect } from 'react'
import { toast } from 'sonner'
import { useLocation } from 'wouter'
import { isAuthenticatedAtom } from '@/auth/auth.atoms'
import LoadingSpinner from '@/components/loading-spinner'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { applyTheme, themeAtom } from '@/data/theme.atoms'
import {
  activeOrgAtom,
  activeProjectAtom,
  bootstrapStatusAtom,
  fetchOrgsAtom,
  fetchProjectsAtom,
  lastOrgIdAtom,
  lastProjectByOrgAtom,
  loadOrgAtom,
  projectsAtom,
  resetWorkspaceAtom,
  selectOrgAtom,
  workspaceErrorAtom,
} from '@/data/workspace.atoms'
import { lazyWithRetry } from '@/lib/lazy'

const AppSidebar = lazyWithRetry(() => import('@/components/layout/sidebar'), 'sidebar')
const Router = lazyWithRetry(() => import('@/pages/router'), 'router')
const SignIn = lazyWithRetry(() => import('@/pages/sign-in'), 'sign-in')
const SelectOrg = lazyWithRetry(() => import('@/pages/select-org'), 'select-org')
const MagicLink = lazyWithRetry(() => import('@/pages/magic-link'), 'magic-link')

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
  const [status, setStatus] = useAtom(bootstrapStatusAtom)
  const projects = useAtomValue(projectsAtom)
  const activeOrg = useAtomValue(activeOrgAtom)
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const lastOrgId = useAtomValue(lastOrgIdAtom)
  const loadOrg = useSetAtom(loadOrgAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const fetchProjects = useSetAtom(fetchProjectsAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const resetWorkspace = useSetAtom(resetWorkspaceAtom)
  const setLastProjectByOrg = useSetAtom(lastProjectByOrgAtom)

  useEffect(() => {
    if (!authenticated) {
      resetWorkspace()
    } else if (status === 'idle') {
      setStatus('loading-org')
    }
  }, [authenticated, status, setStatus, resetWorkspace])

  useEffect(() => {
    if (status !== 'loading-org') return
    let cancelled = false
    ;(async () => {
      if (lastOrgId) {
        const org = await loadOrg(lastOrgId)
        if (cancelled) return
        if (org) {
          setStatus('ready')
          return
        }
        toast.message('Your previous organization is no longer available')
      }
      const list = await fetchOrgs()
      if (cancelled) return
      if (list.length === 0) {
        setStatus('error')
        return
      }
      if (list.length === 1) {
        selectOrg(list[0])
        setStatus('ready')
        return
      }
      setStatus('needs-selection')
    })()
    return () => {
      cancelled = true
    }
  }, [status, lastOrgId, loadOrg, fetchOrgs, selectOrg, setStatus])

  useEffect(() => {
    if (status !== 'ready' || !activeOrg) return
    setActiveProject(null)
    fetchProjects()
  }, [status, activeOrg, fetchProjects, setActiveProject])

  useEffect(() => {
    if (projects.length === 0) {
      if (activeProject) setActiveProject(null)
      return
    }
    if (!activeProject || !projects.some(project => project.id === activeProject.id)) {
      setActiveProject(projects[0])
    }
  }, [projects, activeProject, setActiveProject])

  useEffect(() => {
    if (status !== 'needs-selection' || !activeOrg) return
    setStatus('ready')
  }, [activeOrg, status, setStatus])

  // Remember the last project visited per org, to restore when switching orgs.
  useEffect(() => {
    if (!activeOrg || !activeProject) return
    setLastProjectByOrg(prev =>
      prev[activeOrg.id] === activeProject.id ? prev : { ...prev, [activeOrg.id]: activeProject.id },
    )
  }, [activeOrg, activeProject, setLastProjectByOrg])

  return null
}

const AuthenticatedApp = () => {
  return (
    <SidebarProvider>
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <SidebarInset className="min-h-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
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
  const [location] = useLocation()
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const status = useAtomValue(bootstrapStatusAtom)
  const workspaceError = useAtomValue(workspaceErrorAtom)
  return (
    <>
      <ThemeSync />
      <WorkspaceBootstrap />
      {location === '/magic-link' ? (
        <Suspense fallback={<LoadingSpinner />}>
          <MagicLink />
        </Suspense>
      ) : !authenticated ? (
        <Suspense fallback={<LoadingSpinner />}>
          <SignIn />
        </Suspense>
      ) : workspaceError || status === 'error' ? (
        <WorkspaceError message={workspaceError ?? 'No organizations available for this account.'} />
      ) : status === 'needs-selection' ? (
        <Suspense fallback={<LoadingSpinner />}>
          <SelectOrg />
        </Suspense>
      ) : status === 'ready' ? (
        <AuthenticatedApp />
      ) : (
        <LoadingSpinner />
      )}
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
