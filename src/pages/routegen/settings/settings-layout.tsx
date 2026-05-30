import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import Page from '@/components/layout/page'
import ProjectLink from '@/components/project-link'
import { cn } from '@/lib/utils'

const SETTINGS_TABS = [
  { path: 'general', label: 'General' },
  { path: 'account', label: 'Account' },
  { path: 'organization', label: 'Organization' },
] as const

const SettingsLayout = ({ children }: { children: ReactNode }) => {
  const [location] = useLocation()

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
