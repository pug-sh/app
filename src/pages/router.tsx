import { activeProjectAtom, projectsAtom } from '@/data/workspace.atoms'
import { useAtom, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { Route, Switch, useLocation, useParams } from 'wouter'
import { routes } from './routes'

const ProjectSync = ({ children }: { children: React.ReactNode }) => {
  const { projectId } = useParams<{ projectId: string }>()
  const [activeProject, setActiveProject] = useAtom(activeProjectAtom)
  const projects = useAtomValue(projectsAtom)

  useEffect(() => {
    if (!projectId || projects.length === 0) return
    if (activeProject?.id === projectId) return
    const match = projects.find(p => p.id === projectId)
    if (match) {
      setActiveProject(match)
    }
  }, [projectId, projects, activeProject, setActiveProject])

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

  return null
}

const Router = () => {
  return (
    <Switch>
      {Object.entries(routes).map(([path, { component: Component }]) => (
        <Route key={path} path={path}>
          <ProjectSync>
            <Component />
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
