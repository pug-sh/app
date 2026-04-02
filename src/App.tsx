import { isAuthenticatedAtom } from '@/auth/auth.atoms'
import { Button } from '@/components/ui/button'
import AppSidebar from '@/components/layout/sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { applyTheme, themeAtom } from '@/data/theme.atoms'
import { workspaceErrorAtom } from '@/data/workspace.atoms'
import Router from '@/pages/router'
import SignIn from '@/pages/sign-in'
import { useAtomValue } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { useEffect } from 'react'

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
      <AppSidebar />
      <SidebarInset>
        <header className='flex h-12 shrink-0 items-center gap-2 border-b px-4'>
          <SidebarTrigger className='-ml-1' />
        </header>
        <main className='flex-1 min-w-0'>
          <Router />
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
      {!authenticated ? <SignIn /> : workspaceError ? <WorkspaceError message={workspaceError} /> : <AuthenticatedApp />}
      <Toaster position='bottom-right' />
    </>
  )
}

export default App
