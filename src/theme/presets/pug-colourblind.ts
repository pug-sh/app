import type { ThemeFile } from '../format'
import { pug } from './pug'

// Pug's colourblind-safe block as a theme of its own, with its data colours read from pug.ts.
export const pugColourblind = {
  version: 1,
  name: 'Pug Colourblind-safe',
  contrast: 'standard',
  variants: {
    light: { data: pug.variants.light.modes.colourblind.data },
    dark: { data: pug.variants.dark.modes.colourblind.data },
  },
} satisfies ThemeFile
