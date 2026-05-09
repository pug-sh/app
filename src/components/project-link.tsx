import { Link } from 'wouter'
import { useProjectPrefix } from '@/lib/project-path'

const ProjectLink = (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => {
  const prefix = useProjectPrefix()
  const { href, ...rest } = props
  return <Link href={`${prefix}${href}`} {...rest} />
}

export default ProjectLink
