import { describe, expect, it } from 'vitest'
import { isRepositoryRelease, isSlug, SCHEMA_URL } from './repository'

describe('the repository convention', () => {
  it('takes slugs by the built-in id rule, except reserved ones', () => {
    expect(isSlug('clay')).toBe(true)
    expect(isSlug('warm-linen-2')).toBe(true)
    for (const bad of ['', 'Clay', 'clay_2', 'clay.json', 'a'.repeat(65), 'schema']) expect(isSlug(bad)).toBe(false)
  })

  it('starts a repository’s releases at major 1', () => {
    expect(isRepositoryRelease({ major: 1, minor: 0, patch: 0 })).toBe(true)
    expect(isRepositoryRelease({ major: 0, minor: 9, patch: 0 })).toBe(false)
  })

  it('serves the schema from the official repository', () => {
    expect(SCHEMA_URL).toBe('https://themes.pug.sh/schema/v1.json')
  })
})
