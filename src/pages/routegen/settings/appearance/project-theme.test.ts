import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import type { FetchStatus } from '@/data/theme.atoms'
import { chooseTheme } from '@/theme/choice'
import { buildLibrary } from '@/theme/library'
import { projectTheme, skippedOverride } from './project-theme'

const FILE = 'https://themes.pug.sh/paper/theme.json'
const failed: Record<string, FetchStatus> = { [FILE]: { state: 'failed', reason: 'status', status: 404 } }

const inputs = (defaultTheme: string, override?: string, statuses: Record<string, FetchStatus> = {}) => {
  const library = buildLibrary([])
  const personal = { light: 'pug', dark: 'pug' }
  return {
    project: create(ProjectSchema, { id: 'p1', displayName: 'Acme', defaultTheme }),
    override,
    choice: chooseTheme({ override, projectDefault: defaultTheme, personal, library }),
    library,
    statuses,
  }
}

describe('projectTheme', () => {
  it('reads an override', () => {
    expect(projectTheme(inputs('', 'pug-colourblind'))).toEqual({
      holds: 'pug-colourblind',
      chip: 'Pug Colourblind-safe',
      sentence: 'Using Pug Colourblind-safe in this project.',
    })
  })

  it('reads a default, and holds it', () => {
    expect(projectTheme(inputs('pug-colourblind#dark'))).toEqual({
      holds: 'pug-colourblind#dark',
      chip: 'Default: Pug Colourblind-safe',
      sentence: 'Project default: Pug Colourblind-safe, always dark',
    })
  })

  it('reads no theme of its own', () => {
    expect(projectTheme(inputs(''))).toEqual({
      chip: 'Same as your theme',
      sentence: 'No project default, using your theme',
    })
  })

  it('reads a default still on its way', () => {
    expect(projectTheme(inputs(FILE))).toMatchObject({ chip: 'Loading…', sentence: 'Loading this project’s theme…' })
  })

  it('reads a default that failed', () => {
    expect(projectTheme(inputs(FILE, undefined, failed))).toMatchObject({
      chip: 'Couldn’t load',
      sentence: 'Couldn’t load this project’s theme. Showing your theme instead.',
    })
  })
})

describe('skippedOverride', () => {
  it('says which theme paints when an override can’t be read', () => {
    expect(skippedOverride(inputs('pug', FILE, failed))).toBe(
      'paper, latest hasn’t loaded, so the project default is showing instead.',
    )
    expect(skippedOverride(inputs('', FILE, failed))).toBe(
      'paper, latest hasn’t loaded, so your theme is showing instead.',
    )
    expect(skippedOverride(inputs('', 'pug-missing'))).toBe(
      'pug-missing can’t be used, so your theme is showing instead.',
    )
  })

  it('says nothing while an override loads, or once it paints', () => {
    expect(skippedOverride(inputs('', FILE, { [FILE]: { state: 'loading' } }))).toBeNull()
    expect(skippedOverride(inputs('', 'pug-colourblind'))).toBeNull()
  })
})
