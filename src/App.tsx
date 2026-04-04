import { isAuthenticatedAtom } from '@/auth/auth.atoms'
import LoadingSpinner from '@/components/loading-spinner'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { applyTheme, themeAtom } from '@/data/theme.atoms'
import { workspaceErrorAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'

const AppSidebar = lazy(() => import('@/components/layout/sidebar'))
const Router = lazy(() => import('@/pages/router'))
const SignIn = lazy(() => import('@/pages/sign-in'))

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

const AuthenticatedApp = () => {
  return (
    <SidebarProvider>
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <SidebarInset>
        <div className='fixed top-3 left-3 z-30'>
          <SidebarTrigger />
        </div>
        <main className='flex-1 min-w-0'>
          <Suspense fallback={<LoadingSpinner />}>
            <Router />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

const WorkspaceError = ({ message }: { message: string }) => (
  <div className='min-h-screen flex items-center justify-center'>
    <div className='text-center'>
      <AlertCircle className='w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30' />
      <p className='text-sm font-medium mb-1'>Unable to load workspace</p>
      <p className='text-xs text-muted-foreground mb-4 max-w-xs'>{message}</p>
      <Button variant='outline' size='sm' onClick={() => window.location.reload()}>
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
      {!authenticated
        ? (
          <Suspense fallback={<LoadingSpinner />}>
            <SignIn />
          </Suspense>
        )
        : workspaceError ? <WorkspaceError message={workspaceError} /> : <AuthenticatedApp />}
      <Toaster position='bottom-right' />
    </>
  )
}

export default App
