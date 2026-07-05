import { useAtomValue } from 'jotai'
import { type ReactNode, useEffect } from 'react'
import { useLocation, useParams } from 'wouter'
import { isDemoSessionAtom } from '@/auth/demo'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import ProjectLink from '@/components/project-link'
import { cn } from '@/lib/utils'

const SETTINGS_TABS = [
  { path: 'general', label: 'General' },
  { path: 'api-keys', label: 'API Keys' },
  { path: 'account', label: 'Account' },
  { path: 'organization', label: 'Organization' },
] as const

const SettingsLayout = ({ children }: { children: ReactNode }) => {
  const [location, navigate] = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const isDemo = useAtomValue(isDemoSessionAtom)

  // Settings is hidden in the read-only demo — it exposes the shared demo account's email/password
  // and org config. The sidebar entry is dropped (DEMO_HIDDEN_PATHS in sidebar.tsx); this guards a
  // demo visitor who reaches a /settings URL directly (bookmark, typed, or back button).
  useEffect(() => {
    if (isDemo && projectId) navigate(`/p/${projectId}/overview`, { replace: true })
  }, [isDemo, projectId, navigate])

  if (isDemo) return <LoadingSpinner />

  // Active tab comes from the URL segment after /settings/ (source of truth, not state).
  const currentTab = location.match(/\/settings\/([^/]+)/)?.[1]
  const activeTab = SETTINGS_TABS.find(tab => tab.path === currentTab)?.path ?? 'general'

  return (
    <Page title="Settings" description="Manage project settings">
      <div className="border-b border-border mb-8">
        <nav className="-mb-px flex gap-6">
          {SETTINGS_TABS.map(tab => {
            const isActive = tab.path === activeTab
            return (
              <ProjectLink
                key={tab.path}
                href={`/settings/${tab.path}`}
                className={cn(
                  'border-b-2 pb-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </ProjectLink>
            )
          })}
        </nav>
      </div>
      {children}
    </Page>
  )
}

export default SettingsLayout
