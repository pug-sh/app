// The official repository in tests: Clay as published, and list.json around it.

export const LIST_URL = 'https://themes.pug.sh/list.json'

export const clayFile = (release: string, light = '#f3eee4') => ({
  $schema: 'https://themes.pug.sh/schema/v1.json',
  version: 1,
  name: 'Clay',
  metadata: { author: 'Pug', description: 'Warm linen paper.', created: '2026-10-13', release },
  variants: { light: { colors: { background: light } }, dark: { colors: { background: '#1e1b2e' } } },
})

export const listOf = (...themes: { slug: string; releases: string[]; latest: unknown }[]) =>
  JSON.stringify({ version: 1, themes })

/** Clay with two major lines: 2.0.0 is the latest, 1.1.0 the newest 1.x. */
export const CLAY_LIST = listOf({ slug: 'clay', releases: ['2.0.0', '1.1.0', '1.0.0'], latest: clayFile('2.0.0') })
