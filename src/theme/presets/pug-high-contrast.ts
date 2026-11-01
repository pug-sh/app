import type { ThemeFile } from '../format'
import { pug } from './pug'

// Pug's high-contrast block as a theme of its own, with its roots read from pug.ts.
export const pugHighContrast = {
  version: 1,
  name: 'Pug High Contrast',
  contrast: 'high',
  variants: {
    light: { colors: pug.variants.light.modes['high-contrast'].colors },
    dark: { colors: pug.variants.dark.modes['high-contrast'].colors },
  },
} satisfies ThemeFile
