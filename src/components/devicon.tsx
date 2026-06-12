import { useState } from 'react'
import { deviconSrc } from '@/lib/devicon-assets'
import type { DeviconName } from '@/lib/devicon-map'
import { cn } from '@/lib/utils'

type DeviconProps = {
  name: DeviconName
  className?: string
  size?: number
}

export const Devicon = ({ name, className, size = 16 }: DeviconProps) => {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  return (
    <img
      src={deviconSrc(name)}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('inline-block shrink-0 saturate-[0.5] opacity-95', className)}
      style={{ width: size, height: size }}
    />
  )
}
