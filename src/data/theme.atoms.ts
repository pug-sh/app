import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export type Theme = 'light' | 'dark' | 'system'

export const themeAtom = atomWithStorage<Theme>('pug:theme', 'system')

// OS-level preference, kept live via matchMedia so 'system' resolves reactively.
const systemDarkAtom = atom(typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
systemDarkAtom.onMount = set => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => set(mq.matches)
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}

// The concrete light/dark currently in effect (resolves 'system'). Drives the
// JS-computed event-series palette, which can't ride the .dark CSS class.
export const resolvedThemeAtom = atom<'light' | 'dark'>(get => {
  const theme = get(themeAtom)
  if (theme === 'dark' || theme === 'light') return theme
  return get(systemDarkAtom) ? 'dark' : 'light'
})

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}
