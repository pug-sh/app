import LoadingSpinner from '@/components/loading-spinner'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectsAtom } from '@/data/workspace.atoms'
import { useAtom, useAtomValue } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { Component, useEffect, useState, type ReactNode } from 'react'
import { Route, Switch, useLocation, useParams } from 'wouter'
import { routes } from './routes'

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
        <div className='flex flex-col items-center justify-center py-24'>
          <AlertCircle className='w-10 h-10 mb-4 text-muted-foreground opacity-30' />
          <p className='text-sm font-medium mb-1'>Something went wrong on this page</p>
          <Button
            variant='outline'
            size='sm'
            className='mt-2'
            onClick={() => this.setState({ hasError: false })}
          >
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
  const [notFound, setNotFound] = useState(false)
  const [, navigate] = useLocation()

  useEffect(() => {
    if (!projectId || projects.length === 0) return
    if (activeProject?.id === projectId) { setNotFound(false); return }
    const match = projects.find(p => p.id === projectId)
    if (match) {
      setActiveProject(match)
      setNotFound(false)
    } else {
      setNotFound(true)
    }
  }, [projectId, projects, activeProject, setActiveProject])

  if (notFound) {
    return (
      <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
        <p className='text-sm font-medium mb-1'>Project not found</p>
        <p className='text-xs mb-3'>This project may have been removed or you don't have access.</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className='text-xs text-primary hover:underline underline-offset-4 cursor-pointer'
        >
          Go to overview
        </button>
      </div>
    )
  }

  return <>{children}</>
}

const ProjectRedirect = () => {
  const [, navigate] = useLocation()
  const activeProject = useAtomValue(activeProjectAtom)

  useEffect(() => {
    if (activeProject) {
      navigate(`/p/${activeProject.id}/overview`, { replace: true })
    }
  }, [activeProject, navigate])

  if (!activeProject) return <LoadingSpinner />
  return null
}

const Router = () => {
  return (
    <Switch>
      {Object.entries(routes).map(([path, { component: Component }]) => (
        <Route key={path} path={path}>
          <ProjectSync>
            <RouteErrorBoundary>
              <Component />
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
