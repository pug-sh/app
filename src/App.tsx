import { isAuthenticatedAtom } from '@/auth/auth.atoms'
import AppSidebar from '@/components/layout/sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { applyTheme, themeAtom } from '@/data/theme.atoms'
import Router from '@/pages/router'
import SignIn from '@/pages/sign-in'
import { useAtomValue } from 'jotai'
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

const App = () => {
  const authenticated = useAtomValue(isAuthenticatedAtom)
  return (
    <>
      <ThemeSync />
      {authenticated ? <AuthenticatedApp /> : <SignIn />}
      <Toaster position='bottom-right' />
    </>
  )
}

export default App
