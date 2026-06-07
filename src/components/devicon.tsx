import type { DeviconName } from '@/lib/devicon-map'
import { deviconSrc } from '@/lib/devicon-assets'
import { cn } from '@/lib/utils'

type DeviconProps = {
  name: DeviconName
  className?: string
  size?: number
}

export const Devicon = ({ name, className, size = 16 }: DeviconProps) => (
  <img
    src={deviconSrc(name)}
    alt=""
    aria-hidden
    draggable={false}
    className={cn('inline-block shrink-0 saturate-[0.5] opacity-95', className)}
    style={{ width: size, height: size }}
  />
)
