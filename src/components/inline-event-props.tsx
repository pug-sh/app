import { type ReactElement, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Item = { key: string; element: ReactElement }

export const InlineEventProps = ({
  headline,
  headlinePairs,
  props,
}: {
  headline: string | null
  headlinePairs: [string, string][]
  props: [string, string][]
}) => {
  const items: Item[] = useMemo(() => {
    if (headline) {
      return [
        {
          key: 'headline',
          element: (
            <span
              className="text-[11px] font-mono text-foreground whitespace-nowrap"
              title={headlinePairs.map(([k, v]) => `${k}: ${v}`).join(' · ')}
            >
              {headline}
            </span>
          ),
        },
      ]
    }
    return [
      ...headlinePairs.map(([k, v]) => ({
        key: `hp:${k}`,
        element: (
          <span className="text-[11px] whitespace-nowrap" title={`${k}: ${v}`}>
            <span className="text-muted-foreground">{k}: </span>
            <span className="font-mono text-foreground">{v}</span>
          </span>
        ),
      })),
      ...props.map(([k, v]) => ({
        key: `p:${k}`,
        element: (
          <span className="text-[11px] text-muted-foreground whitespace-nowrap" title={`${k}: ${v}`}>
            {k}: <span className="font-mono">{v}</span>
          </span>
        ),
      })),
    ]
  }, [headline, headlinePairs, props])

  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(items.length)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || items.length === 0) return

    const measure = () => {
      const containerRight = container.getBoundingClientRect().right
      const children = Array.from(container.children) as HTMLElement[]
      let cutoff = children.length
      for (let i = 0; i < children.length; i++) {
        if (children[i].getBoundingClientRect().right > containerRight + 0.5) {
          cutoff = i
          break
        }
      }
      setVisibleCount(cutoff)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => ro.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <div ref={containerRef} className="flex items-center gap-2 overflow-hidden">
      {items.map((item, i) => (
        <span key={item.key} className={cn('shrink-0', i >= visibleCount && 'invisible')}>
          {item.element}
        </span>
      ))}
    </div>
  )
}
