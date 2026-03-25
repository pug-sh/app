import { useProjectPrefix } from '@/lib/project-path'
import { Link } from 'wouter'

const ProjectLink = (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => {
  const prefix = useProjectPrefix()
  const { href, ...rest } = props
  return <Link href={`${prefix}${href}`} {...rest} />
}

export default ProjectLink
