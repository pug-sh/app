import type { ComponentType, LazyExoticComponent } from 'react'
import { lazyWithRetry } from '@/lib/lazy'

type PageModule = { default: ComponentType }

type RouteDef = {
  component: LazyExoticComponent<ComponentType>
}

const pages = import.meta.glob<PageModule>('./routegen/**/index.page.tsx')

export const routes: Record<string, RouteDef> = {}

const isDynamicSegment = (segment: string) => segment.startsWith('[') && segment.endsWith(']')

const compareRouteKeys = (a: string, b: string) => {
  const aSegments = a.split('/').slice(2, -1)
  const bSegments = b.split('/').slice(2, -1)
  const sharedLength = Math.min(aSegments.length, bSegments.length)

  for (let i = 0; i < sharedLength; i++) {
    const aDynamic = isDynamicSegment(aSegments[i])
    const bDynamic = isDynamicSegment(bSegments[i])
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1
  }

  if (aSegments.length !== bSegments.length) return bSegments.length - aSegments.length
  return a.localeCompare(b)
}

for (const [key, loader] of Object.entries(pages).sort(([a], [b]) => compareRouteKeys(a, b))) {
  const path =
    '/p/:projectId/' +
    key
      .split('/')
      .slice(2, -1)
      .map(s => (isDynamicSegment(s) ? ':' + s.slice(1, -1) : s))
      .join('/')

  routes[path] = { component: lazyWithRetry(loader, path) }
}
