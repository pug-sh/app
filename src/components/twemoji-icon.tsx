import { useState } from 'react'
import { twemojiSrc, usesTwemoji } from '@/lib/twemoji'
import { cn } from '@/lib/utils'

type TwemojiIconProps = {
  emoji: string
  className?: string
  size?: number
}

export const TwemojiIcon = ({ emoji, className, size = 16 }: TwemojiIconProps) => {
  const [failed, setFailed] = useState(false)
  if (!emoji || !usesTwemoji(emoji) || failed) return null

  return (
    <img
      src={twemojiSrc(emoji)}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    />
  )
}
