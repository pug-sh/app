import { useAtom, useAtomValue } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { Component, type ReactNode, Suspense, useEffect } from 'react'
import { Route, Switch, useLocation, useParams } from 'wouter'
import LoadingSpinner from '@/components/loading-spinner'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectsAtom } from '@/data/workspace.atoms'
import ProfileShell from './routegen/profiles/[profileId]/_shell'
import SettingsLayout from './routegen/settings/settings-layout'
import { routes } from './routes'

// Layout groups keep a shell (tab bar + header) mounted across its tab routes. The shell is
// imported eagerly — only the inner page is lazy — so switching tabs suspends just the body
// (inner Suspense, loader below the tabs) instead of blanking the whole page. `base` selects
// member routes by path prefix; `outer` is the wouter pattern that stays matched across them
// (`/*?` = optional trailing segments, so the prefix route also matches the tab-less base URL).
const LAYOUT_GROUPS = [
  {
    base: '/p/:projectId/profiles/:profileId',
    outer: '/p/:projectId/profiles/:profileId/*?',
    Layout: ProfileShell,
  },
  {
    base: '/p/:projectId/settings',
    outer: '/p/:projectId/settings/*?',
    Layout: SettingsLayout,
  },
] as const

class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Route error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-24">
          <AlertCircle className="w-10 h-10 mb-4 text-muted-foreground opacity-30" />
          <p className="text-sm font-medium mb-1">Something went wrong on this page</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => this.setState({ hasError: false })}>
            Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

const ProjectSync = ({ children }: { children: React.ReactNode }) => {
  const { projectId } = useParams<{ projectId: string }>()
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const projects = useAtomValue(projectsAtom)
  const [, navigate] = useLocation()
  const matchedProject = projectId ? projects.find(p => p.id === projectId) : null

  useEffect(() => {
    if (!projectId || projects.length === 0 || !matchedProject) return
    if (activeProject?.id === projectId) return

    setActiveProject(matchedProject)
  }, [projectId, projects.length, matchedProject, activeProject, setActiveProject])

  const notFound = !!projectId && projects.length > 0 && !matchedProject

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-sm font-medium mb-1">Project not found</p>
        <p className="text-xs mb-3">This project may have been removed or you don't have access.</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="text-xs text-link hover:underline underline-offset-4 cursor-pointer"
        >
          Go to overview
        </button>
      </div>
    )
  }

  if (projectId && matchedProject && activeProject?.id !== projectId) {
    return <LoadingSpinner />
  }

  return <>{children}</>
}

const ProjectRedirect = () => {
  const [, navigate] = useLocation()
  const activeProject = useAtomValue(activeProjectAtom)
  const projects = useAtomValue(projectsAtom)
  const project = activeProject ?? projects[0]

  useEffect(() => {
    if (project) {
      navigate(`/p/${project.id}/overview`, { replace: true })
    }
  }, [project, navigate])

  if (!project) return <LoadingSpinner />
  return null
}

// Group member routes (sorted by routes.ts) by which layout owns them; the rest stay flat.
const groupedRoutes = LAYOUT_GROUPS.map(group => ({
  ...group,
  members: Object.entries(routes).filter(([path]) => path === group.base || path.startsWith(group.base + '/')),
}))
const groupedPaths = new Set(groupedRoutes.flatMap(g => g.members.map(([path]) => path)))
const flatRoutes = Object.entries(routes).filter(([path]) => !groupedPaths.has(path))

const Router = () => {
  return (
    <Switch>
      {groupedRoutes.map(({ outer, Layout, members }) => (
        <Route key={outer} path={outer}>
          <ProjectSync>
            <RouteErrorBoundary>
              {/* Outer Suspense covers the genuine first load (lazy shell deps + profile data).
                  Inner Suspense covers per-tab body chunks, keeping the shell + tabs mounted. */}
              <Suspense fallback={<LoadingSpinner />}>
                <Layout>
                  <Suspense fallback={<LoadingSpinner />}>
                    <Switch>
                      {members.map(([path, { component: Component }]) => (
                        <Route key={path} path={path}>
                          <Component />
                        </Route>
                      ))}
                    </Switch>
                  </Suspense>
                </Layout>
              </Suspense>
            </RouteErrorBoundary>
          </ProjectSync>
        </Route>
      ))}
      {flatRoutes.map(([path, { component: Component }]) => (
        <Route key={path} path={path}>
          <ProjectSync>
            <RouteErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <Component />
              </Suspense>
            </RouteErrorBoundary>
          </ProjectSync>
        </Route>
      ))}
      <Route>
        <ProjectRedirect />
      </Route>
    </Switch>
  )
}

export default Router
