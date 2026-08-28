import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Route, useLocation } from 'wouter'
import AnalyticsIdentity from '@/analytics/identity'
import { isAuthenticatedAtom } from '@/auth/auth.atoms'
import { AuthSplit } from '@/auth/auth-split'
import { AuthPending, AuthStatus } from '@/auth/auth-status'
import { customerIdAtom } from '@/auth/jwt.atoms'
import { DemoBanner } from '@/components/demo-banner'
import LoadingSpinner from '@/components/loading-spinner'
import { SocialNav } from '@/components/social-nav'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { applyTheme, resolvedThemeAtom, themeAtom } from '@/data/theme.atoms'
import {
  activeOrgAtom,
  activeProjectAtom,
  bootstrapStatusAtom,
  commitProjectsAtom,
  fetchOrgsAtom,
  fetchProjectsAtom,
  lastOrgIdAtom,
  lastProjectByOrgAtom,
  loadOrgAtom,
  prefetchProjectsAtom,
  projectsAtom,
  projectsLoadedAtom,
  rememberLastProjectAtom,
  resetWorkspaceAtom,
  selectOrgAtom,
  workspaceErrorAtom,
} from '@/data/workspace.atoms'
import { setSeriesColorScheme } from '@/lib/event-colors'
import { lazyWithRetry } from '@/lib/lazy'
import { useRouteProjectId } from '@/lib/project-path'

const AppSidebar = lazyWithRetry(() => import('@/components/layout/sidebar'), 'sidebar')
const Router = lazyWithRetry(() => import('@/pages/router'), 'router')
const SignIn = lazyWithRetry(() => import('@/pages/sign-in'), 'sign-in')
const SelectOrg = lazyWithRetry(() => import('@/pages/select-org'), 'select-org')
const MagicLink = lazyWithRetry(() => import('@/pages/magic-link'), 'magic-link')
const OAuthCallback = lazyWithRetry(() => import('@/pages/oauth-callback'), 'oauth-callback')
const SharedDashboard = lazyWithRetry(() => import('@/pages/shared-dashboard'), 'shared-dashboard')
const Demo = lazyWithRetry(() => import('@/pages/demo'), 'demo')

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

// Exported for its tests: a session that ends leaves the address bar naming the project it ended
// in, and the next account to sign in on this browser inherits it — "Project not found" if they
// can't see it, someone else's project if they can, and silently, since WorkspaceBootstrap declines
// to default-pick over a route that names a project the new account *can* see.
//
// Owned here rather than by each sign-out button because not every path has a button. The
// transport's clearSession() — the sole authority on session death, fired when the server rejects
// the refresh token — reaches no component and cannot navigate for itself, and on a shared machine
// that expiry ends more sessions than anyone clicking Sign out.
//
// Keyed on the true→false transition, NOT on !authenticated: arriving already signed out is how a
// shared /p/ link works, and that URL has to survive the sign-in that follows it. Replace rather than
// push, or Back steps into the URL this just dropped.
export const SessionUrlGuard = () => {
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const routeProjectId = useRouteProjectId()
  const [, navigate] = useLocation()

  const wasAuthenticated = useRef(authenticated)
  useEffect(() => {
    const sessionEnded = wasAuthenticated.current && !authenticated
    wasAuthenticated.current = authenticated
    if (sessionEnded && routeProjectId) navigate('/', { replace: true })
  }, [authenticated, routeProjectId, navigate])

  return null
}

// Exported for its tests: this owns the only default project pick in the app, and the rules it
// follows (defer to the route, restore the last visit, then fall back to the first) are each a
// separate bug when dropped.
export const WorkspaceBootstrap = () => {
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const customerId = useAtomValue(customerIdAtom)
  const [status, setStatus] = useAtom(bootstrapStatusAtom)
  const projects = useAtomValue(projectsAtom)
  const activeOrg = useAtomValue(activeOrgAtom)
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const routeProjectId = useRouteProjectId()
  const lastOrgId = useAtomValue(lastOrgIdAtom)
  const loadOrg = useSetAtom(loadOrgAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const fetchProjects = useSetAtom(fetchProjectsAtom)
  const prefetchProjects = useSetAtom(prefetchProjectsAtom)
  const commitProjects = useSetAtom(commitProjectsAtom)
  const projectsLoaded = useAtomValue(projectsLoadedAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const resetWorkspace = useSetAtom(resetWorkspaceAtom)
  const lastProjectByOrg = useAtomValue(lastProjectByOrgAtom)
  const rememberLastProject = useSetAtom(rememberLastProjectAtom)

  useEffect(() => {
    if (!authenticated) {
      resetWorkspace()
    } else if (status === 'idle') {
      setStatus('loading-org')
    }
  }, [authenticated, status, setStatus, resetWorkspace])

  // The one place an account switch tears the workspace down, in-tab and cross-tab alike. The JWT
  // syncs across tabs (atomWithStorage listens for storage events); the workspace does not. Sign in
  // as someone else in another tab and this one keeps the previous account's org and project while
  // every request it sends now carries the new account's token — including the visit it records,
  // which would file one account's project under the other's stamp and undo the whole point of
  // stamping them. Rebuild instead.
  const knownCustomer = useRef(customerId)
  useEffect(() => {
    const switched = knownCustomer.current && customerId && knownCustomer.current !== customerId
    knownCustomer.current = customerId
    if (switched) resetWorkspace()
  }, [customerId, resetWorkspace])

  useEffect(() => {
    if (status !== 'loading-org') return
    let cancelled = false
    ;(async () => {
      if (lastOrgId) {
        // Both calls need only the org id, so they go out together rather than the list waiting on
        // the org. prefetchProjects resolves null on a miss; the org-keyed effect below then fetches.
        const prefetched = prefetchProjects(lastOrgId)
        const org = await loadOrg(lastOrgId)
        if (cancelled) return
        if (org) {
          // Before 'ready': the org-keyed effect runs off that change and skips on a landed list.
          const projects = await prefetched
          if (cancelled) return
          // Keyed to the org the list was fetched for, not the one that came back: if they differ
          // the commit is dropped and the effect below refetches, rather than mis-filing the list.
          if (projects) commitProjects({ orgId: lastOrgId, projects })
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
  }, [status, lastOrgId, loadOrg, prefetchProjects, commitProjects, fetchOrgs, selectOrg, setStatus])

  // Keyed on the org id, not the org object: renameOrgAtom writes a fresh object for the same org,
  // and this effect blanks the active project and refetches the list — so a rename would clear the
  // sidebar's project list and chip for a round-trip it didn't need. fetchProjects reads the org
  // from the store itself, so the id is all this needs.
  const activeOrgId = activeOrg?.id
  useEffect(() => {
    if (status !== 'ready' || !activeOrgId) return
    // Already committed by the restore path's prefetch. A switch still falls through: selectOrg
    // clears the key alongside the list.
    if (projectsLoaded) return
    setActiveProject(null)
    fetchProjects()
  }, [status, activeOrgId, projectsLoaded, fetchProjects, setActiveProject])

  useEffect(() => {
    if (projects.length === 0) {
      if (activeProject) setActiveProject(null)
      return
    }
    if (activeProject && projects.some(project => project.id === activeProject.id)) return
    // A /p/:projectId route already names the project it wants, and ProjectSync sets it from there.
    // Defaulting to projects[0] here would win that race and make a project the user never asked for
    // briefly active for everything watching activeProjectAtom — the page itself is shielded by
    // ProjectSync's gate, but workspaceSettledAtom isn't, and reports a settled workspace around the
    // wrong project. Only default when the URL has no opinion, or names a project that isn't
    // available (ProjectSync renders "Project not found" and needs a sane fallback behind it).
    if (routeProjectId && projects.some(project => project.id === routeProjectId)) return
    // The URL has no opinion, so restore the last project visited in this org before falling back to
    // the first: landing on the bare app URL should return you where you left off, the way lastOrgId
    // already restores the org around it. The settings org switcher prefers the same stored pick, so
    // this is what makes a switch survive the trip back through '/'.
    const lastProjectId = activeOrg ? lastProjectByOrg[activeOrg.id] : undefined
    setActiveProject(projects.find(project => project.id === lastProjectId) ?? projects[0])
  }, [projects, activeProject, routeProjectId, activeOrg, lastProjectByOrg, setActiveProject])

  useEffect(() => {
    if (status !== 'needs-selection' || !activeOrg) return
    setStatus('ready')
  }, [activeOrg, status, setStatus])

  // Remember the last project visited per org, to restore when switching orgs. Stamped with the
  // signed-in customer inside the atom, so one account can't be handed the other's project when two
  // share an org. Only one account's visits are kept — the second's write replaces the first's.
  useEffect(() => {
    if (!activeOrg || !activeProject) return
    rememberLastProject({ orgId: activeOrg.id, projectId: activeProject.id })
  }, [activeOrg, activeProject, rememberLastProject])

  return null
}

const AuthenticatedApp = () => {
  return (
    <SidebarProvider>
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <SidebarInset className="min-h-0">
        <DemoBanner />
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-page-gutter">
          <SidebarTrigger className="-ml-1" />
          <SocialNav className="ml-auto -mr-1" />
        </header>
        {/*
          data-pug-no-capture blanks the text our own click/dead-click capture would otherwise read
          out of this subtree. Everything a page renders here belongs to a customer — their
          end-users' emails and distinct IDs, their property values, their event names — and that
          text has no business in our analytics. Clicks still count; only the free text is dropped,
          and structural fields (tag/id/class/coords) still ride along.

          It sits on <main> rather than on each table or detail pane by design: the SDK resolves the
          marker with closest(), so one boundary covers every page that will ever mount here,
          including ones not written yet. Per-region markers would have to be remembered forever,
          and forgetting one puts a third party's PII in our project permanently. The cost is that
          button labels in here are blanked too — trackFeature() names those explicitly instead.
        */}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-x-clip" data-pug-no-capture>
          <Suspense fallback={<LoadingSpinner />}>
            <Router />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

const WorkspaceError = ({ message }: { message: string }) => (
  <AuthStatus icon={AlertCircle} tone="negative" title="Unable to load workspace" description={message}>
    <Button variant="outline" className="mt-6 h-10" onClick={() => window.location.reload()}>
      Retry
    </Button>
  </AuthStatus>
)

const App = () => {
  const [location] = useLocation()
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const status = useAtomValue(bootstrapStatusAtom)
  const workspaceError = useAtomValue(workspaceErrorAtom)

  // Event-series colors are JS-computed (badge inline styles + chart SVG fills),
  // so unlike CSS-variable tokens they can't react to the .dark class on their
  // own. Sync the color module to the resolved theme via a module-level mutation
  // during render: App is the tree root, so descendants rendered later this pass
  // read the new scheme. Inline getSeriesColor() callers pick it up for free;
  // consumers that memoize palettes also subscribe to resolvedThemeAtom and key
  // their memo on it, so the mutation has landed before they re-derive.
  const resolvedTheme = useAtomValue(resolvedThemeAtom)
  setSeriesColorScheme(resolvedTheme === 'dark')

  // The public shared-dashboard route renders standalone and must not touch the
  // authenticated workspace — skip bootstrap so a logged-in viewer's org/project
  // RPCs never fire on a public page.
  const isSharedRoute = location.startsWith('/shared/')
  const isMagicLink = location === '/magic-link'
  const isOAuthCallback = location === '/oauth/callback'
  const isDemoRoute = location === '/demo'
  const failed = !!workspaceError || status === 'error'

  // A screen that is unambiguously part of the signed-out flow. Bootstrap is excluded: it is the
  // one state that straddles, running both between sign-in and the picker and on the way from a
  // restored session into the dashboard.
  const onAuthScreen =
    !isSharedRoute &&
    (isMagicLink || isOAuthCallback || isDemoRoute || !authenticated || failed || status === 'needs-selection')

  // Which of the two bootstraps this is, latched from whether an auth screen came first — a
  // restored session never shows one, so it boots on the plain spinner and never flashes the wall.
  const [afterAuthScreen, setAfterAuthScreen] = useState(onAuthScreen)
  useEffect(() => {
    if (onAuthScreen) setAfterAuthScreen(true)
    // Cleared once the app is up, or a cross-tab account switch — which resets bootstrap while the
    // session stays live — would put the wall back over the dashboard.
    else if (status === 'ready') setAfterAuthScreen(false)
  }, [onAuthScreen, status])

  // With onAuthScreen false and the shared route excluded, status can only be 'ready' or a
  // bootstrap step, so this needs no further narrowing.
  const onAuthCanvas = onAuthScreen || (!isSharedRoute && status !== 'ready' && afterAuthScreen)

  // Only reached under onAuthCanvas, so the final fallthrough is the bootstrap step.
  const authScreen = () => {
    if (isMagicLink) return <MagicLink />
    if (isOAuthCallback) return <OAuthCallback />
    // Before the !authenticated branch on purpose: an already-signed-in user must still reach
    // <Demo />'s confirm step (entering the demo signs them out), not be routed past it.
    if (isDemoRoute) return <Demo />
    if (!authenticated) return <SignIn />
    if (failed) return <WorkspaceError message={workspaceError ?? 'No organizations available for this account.'} />
    if (status === 'needs-selection') return <SelectOrg />
    return <AuthPending label="Loading your workspace…" />
  }

  const content = () => {
    if (isSharedRoute) {
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <Route path="/shared/:shareId" component={SharedDashboard} />
        </Suspense>
      )
    }
    // One AuthSplit for every signed-out screen, held at a fixed position so a change of screen
    // swaps only its children. The pages used to bring their own, which meant React tore the
    // canvas down between them: the ground changed twice and the wall's drift restarted.
    // The Suspense sits inside it for the same reason — a page's chunk loads on the canvas.
    if (onAuthCanvas) {
      return (
        <AuthSplit>
          <Suspense fallback={<AuthPending />}>{authScreen()}</Suspense>
        </AuthSplit>
      )
    }
    if (status === 'ready') return <AuthenticatedApp />
    return <LoadingSpinner />
  }

  return (
    <>
      <ThemeSync />
      <SessionUrlGuard />
      {/*
        Unconditional, including on the shared route: it issues no workspace RPCs, so it doesn't
        break that route's rule above — and a signed-in user reading a shared dashboard is a
        session worth seeing. Traits are just thinner there, since bootstrap hasn't run, which is
        also why it's told: waiting for a workspace that is never coming would mean never
        identifying. Kept next to the line that decides it so the two can't drift apart.
      */}
      <AnalyticsIdentity awaitWorkspace={!isSharedRoute} />
      {isSharedRoute ? null : <WorkspaceBootstrap />}
      {content()}
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
