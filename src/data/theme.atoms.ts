import { atomWithStorage } from 'jotai/utils'

export type Theme = 'light' | 'dark' | 'system'

export const themeAtom = atomWithStorage<Theme>('cotton:theme', 'system')

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}
