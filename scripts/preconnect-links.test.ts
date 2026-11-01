// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { preconnectLinks } from './preconnect-links'

const PUG = '<link rel="preconnect" href="https://pug.sh" />'
const DOCS = '<link rel="preconnect" href="https://docs.pug.sh" />'
const map = (origin: string) => `<link rel="preconnect" href="${origin}" crossorigin />`

describe('preconnectLinks', () => {
  it.each([
    [{}, []],
    [{ VITE_PUG_SERVICES_ENABLED: 'false' }, []],
    [{ VITE_PUG_SERVICES_ENABLED: ' true ' }, [PUG, DOCS]],
    [{ VITE_MAP_ASSETS_URL: 'https://maps.internal/assets/' }, [map('https://maps.internal')]],
    [{ VITE_MAP_ASSETS_URL: 'not a url' }, []],
    // A host:port with no scheme parses as a scheme of its own, whose origin is the string 'null'.
    [{ VITE_MAP_ASSETS_URL: 'maps.internal:8443/assets' }, []],
    [
      { VITE_PUG_SERVICES_ENABLED: 'true', VITE_MAP_ASSETS_URL: 'https://maps.pug.sh' },
      [PUG, DOCS, map('https://maps.pug.sh')],
    ],
  ])('for %j', (env, expected) => {
    expect(preconnectLinks(env)).toEqual(expected)
  })
})
