import type { ComponentType, LazyExoticComponent } from 'react'
import { lazyWithRetry } from '@/lib/lazy'

type PageModule = { default: ComponentType }

type RouteDef = {
  component: LazyExoticComponent<ComponentType>
}

const pages = import.meta.glob<PageModule>('./routegen/**/index.page.tsx')

export const routes: Record<string, RouteDef> = {}

for (const [key, loader] of Object.entries(pages)) {
  const segments = key
    .split('/')
    .slice(2, -1)
    .map(s => (s.startsWith('[') && s.endsWith(']') ? ':' + s.slice(1, -1) : s))
  const path = '/p/:projectId/' + segments.join('/')
  routes[path] = { component: lazyWithRetry(loader, path) }
}
