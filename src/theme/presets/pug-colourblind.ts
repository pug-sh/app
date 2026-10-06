import type { ThemeFile } from '../format'

// Pug Colourblind-safe — Pug's UI with the data colours remapped (Okabe–Ito). Failure and success move
// to vermillion and blue, the pair that stays apart under protan, deutan and tritan vision; the
// breakdown palette is hand-fitted per mode, because the standard light fit caps lightness at 0.52
// and flattens the very channel colourblind readers lean on (orange and vermillion collapse to
// ΔE 0.001 under deutan). Light carries six colours — yellow can't be both legible on white and
// still yellow. Domain groups keep Pug's hues.

const groups = { failure: '#d55e00', success: '#0072b2' }

export const pugColourblind = {
  version: 1,
  name: 'Pug Colourblind-safe',
  contrast: 'standard',
  variants: {
    light: {
      data: {
        groups,
        categorical: ['#005181', '#9e6c00', '#007eb1', '#007655', '#9b4200', '#8a0060'],
      },
    },
    dark: {
      data: {
        groups,
        categorical: ['#56b6ff', '#f9ad00', '#96d7ff', '#00ac7e', '#de6200', '#ff6ec4', '#f5e700'],
      },
    },
  },
} satisfies ThemeFile
