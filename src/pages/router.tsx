import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, FolderPlus } from 'lucide-react'
import { Component, Fragment, type ReactNode, Suspense, useEffect } from 'react'
import { Route, Switch, useLocation, useSearch } from 'wouter'
import LoadingSpinner from '@/components/loading-spinner'
import { Button } from '@/components/ui/button'
import {
  activeOrgAtom,
  activeProjectAtom,
  commitProjectsAtom,
  findProjectOrgAtom,
  missingProjectAtom,
  projectsAtom,
  projectsLoadedAtom,
  refreshOrgsAtom,
  selectOrgAtom,
} from '@/data/workspace.atoms'
import { useRouteParams } from '@/lib/route-params'
import ProfileShell from './routegen/profiles/[profileId]/_shell'
import SettingsLayout from './routegen/settings/settings-layout'
import { routes } from './routes'

// Layout groups keep a shell (tab bar + header) mounted across its tab routes. The shell is
// imported eagerly (only the inner page is lazy), so switching tabs suspends just the body
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

// Exported for tests: it adopts whatever project the URL names, so it's what turns a wrong redirect
// into a wrong active project. Pinning ProjectRedirect without it would miss that entirely.
export const ProjectSync = ({ children }: { children: React.ReactNode }) => {
  const { projectId } = useRouteParams<{ projectId: string }>()
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const projects = useAtomValue(projectsAtom)
  const projectsLoaded = useAtomValue(projectsLoadedAtom)
  const activeOrgId = useAtomValue(activeOrgAtom)?.id
  const [missingProject, setMissingProject] = useAtom(missingProjectAtom)
  const refreshOrgs = useSetAtom(refreshOrgsAtom)
  const findProjectOrg = useSetAtom(findProjectOrgAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const commitProjects = useSetAtom(commitProjectsAtom)
  const [, navigate] = useLocation()
  const matchedProject = projectId ? projects.find(p => p.id === projectId) : null
  const missing = !!projectId && projectsLoaded && !matchedProject
  const verdict = missingProject?.projectId === projectId ? missingProject : null

  useEffect(() => {
    if (!projectId || projects.length === 0 || !matchedProject) return
    if (activeProject?.id === projectId) return

    setActiveProject(matchedProject)
  }, [projectId, projects.length, matchedProject, activeProject, setActiveProject])

  // A link can name a project in another of the account's orgs: open that org before calling the project missing.
  useEffect(() => {
    if (!missing || verdict) return
    let cancelled = false
    void (async () => {
      const others = (await refreshOrgs())?.filter(org => org.id !== activeOrgId)
      const found = others ? await findProjectOrg({ projectId, orgs: others }) : undefined
      if (cancelled) return
      if (found) {
        selectOrg(found.org)
        commitProjects({ orgId: found.org.id, projects: found.projects })
      } else {
        setMissingProject({ projectId, unchecked: found === undefined })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    missing,
    verdict,
    projectId,
    activeOrgId,
    refreshOrgs,
    findProjectOrg,
    selectOrg,
    commitProjects,
    setMissingProject,
  ])

  if (missing && !verdict) return <LoadingSpinner />

  if (missing && verdict?.unchecked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-sm font-medium mb-1">Couldn't open this project</p>
        <p className="text-xs mb-3">Some of your organizations didn't answer in time.</p>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMissingProject(null)}
            className="text-xs text-link hover:underline underline-offset-4"
          >
            Try again
          </button>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="text-xs text-link hover:underline underline-offset-4"
          >
            Go to overview
          </button>
        </div>
      </div>
    )
  }

  if (missing) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-sm font-medium mb-1">Project not found</p>
        <p className="text-xs mb-3">This project may have been removed or you don't have access.</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="text-xs text-link hover:underline underline-offset-4"
        >
          Go to overview
        </button>
      </div>
    )
  }

  // The first effect adopts the route's project a commit later, so a spinner here would only flash.
  if (projectId && matchedProject && activeProject?.id !== projectId) return null

  // Keyed on the route's project so switching projects remounts the page rather than re-rendering
  // it with new data underneath its old state. Every generated route is `/p/:projectId/...` (see
  // routes.ts), so this covers all of them. Without it the two switch paths disagree: back/forward
  // changes the URL before `activeProject` catches up, so the gate above unmounts the subtree, but
  // the sidebar batches setActiveProject + navigate into one render, so the gate never trips and a
  // page's local state survives, now describing the wrong project. Each page fetching its own
  // project-scoped data would otherwise have to notice that for itself.
  return <Fragment key={projectId}>{children}</Fragment>
}

const PROJECT_LESS_PATHS = new Set(Object.keys(routes).map(path => path.replace('/p/:projectId', '')))

// Exported for the test that pins it against WorkspaceBootstrap: the two race for the first
// navigation off '/', and the bug only appears when they run together.
export const ProjectRedirect = () => {
  const [location, navigate] = useLocation()
  const search = useSearch()
  // Waits for activeProjectAtom rather than falling back to projects[0] itself. This route is the
  // one place the URL names no project, so App's bootstrap always has a pick coming. A second pick
  // here doesn't just duplicate that one, it beats it: both run off the render where the list
  // arrives, and this effect's captured projects[0] would navigate before the bootstrap's restored
  // project could land, putting the wrong id in the URL for ProjectSync to then adopt back.
  const project = useAtomValue(activeProjectAtom)
  const projects = useAtomValue(projectsAtom)
  const projectsLoaded = useAtomValue(projectsLoadedAtom)

  useEffect(() => {
    if (project) {
      // The post-checkout return carries no project, so '/settings/billing?status=failed' survives
      // whole. Only a real route does: anything else prefixed draws a layout shell with no body.
      const keep = PROJECT_LESS_PATHS.has(location)
      const rest = keep ? `${location}${search ? `?${search}` : ''}` : '/overview'
      navigate(`/p/${project.id}${rest}`, { replace: true })
    }
  }, [location, search, project, navigate])

  if (project) return null
  // A brand-new org, or one whose last project was deleted, has no pick coming: waiting on one
  // spins forever. Only say so once the list has actually landed, or the wait itself reads as empty.
  if (projectsLoaded && projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <FolderPlus className="w-10 h-10 mb-4 opacity-30" />
        <p className="text-sm font-medium mb-1">No projects yet</p>
        <p className="text-xs">Create one from the project switcher to get started.</p>
      </div>
    )
  }
  return <LoadingSpinner />
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
