import type React from 'react'

const pages = import.meta.glob('./routegen/**/index.page.tsx', { eager: true }) as {
  [key: string]: { default: React.FC }
}

export const routes: Record<string, { component: React.FC }> = {}

for (const [key, { default: component }] of Object.entries(pages)) {
  const segments = key
    .split('/')
    .slice(2, -1) // strip ./routegen and index.page.tsx
    .map(s => (s.startsWith('[') && s.endsWith(']') ? ':' + s.slice(1, -1) : s))
  const path = '/p/:projectId/' + segments.join('/')
  routes[path] = { component }
}
