import { expect, it, vi } from 'vitest'

// Every compile throws: the library must contain the damage, not propagate it into the atoms.
vi.mock('./compile', async importOriginal => ({
  ...(await importOriginal<typeof import('./compile')>()),
  compileVariant: () => {
    throw new Error('engine bug')
  },
}))

const { buildLibrary, chooseActive } = await import('./library')

it('keeps a theme the engine cannot compile out of use, and falls back to Pug', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const grape = {
    id: 'installed-grape' as const,
    text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
    hash: 'grape',
    installedAt: 0,
    source: 'file' as const,
  }
  const library = buildLibrary([grape])
  expect(library.find(e => e.id === grape.id)).toMatchObject({
    family: null,
    issues: [{ severity: 'error', message: 'This theme couldn’t be compiled' }],
  })
  const active = chooseActive({
    polarity: 'dark',
    selection: { light: 'pug', dark: grape.id },
    autoContrast: false,
    moreContrast: false,
    library,
  })
  expect(active.id).toBe('pug')
})
