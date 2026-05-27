import type { ComponentType, RefObject } from 'react'
import { useEffect, useState } from 'react'

// Wraps a Responsive grid component so its `width` prop tracks the supplied
// page-level ref instead of the grid container's own width. This decouples grid
// breakpoint resolution from the side panel's open/closed state — opening the
// panel narrows the grid's DOM container but the user's chosen breakpoint stays
// the page's outer width.
export function withPageWidth<P extends { width?: number }>(
  Wrapped: ComponentType<P>,
  pageRef: RefObject<HTMLElement | null>,
): ComponentType<Omit<P, 'width'>> {
  return function PageWidthGrid(props: Omit<P, 'width'>) {
    const [width, setWidth] = useState<number>(() => pageRef.current?.clientWidth ?? 1200)

    useEffect(() => {
      const el = pageRef.current
      if (!el) return
      setWidth(el.clientWidth)
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          setWidth(entry.contentRect.width)
        }
      })
      observer.observe(el)
      return () => observer.disconnect()
    }, [pageRef])

    return <Wrapped {...(props as P)} width={width} />
  }
}
