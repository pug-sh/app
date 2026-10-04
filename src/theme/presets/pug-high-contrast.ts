import type { ThemeFile } from '../format'

// Pug High Contrast — roots only. Every other token is computed from the high-contrast targets
// (WCAG AAA body, AA secondary, 3:1 faint and non-text), and the tracked builtin-themes.css turns any
// change in them into a visible diff. Light sits on pure white; dark on a near-black ink ground with
// light fills carrying dark text, so a button reads as a shape against the canvas as well.

const RAMPS = {
  'heat-1': '#dcfce7',
  'heat-2': '#86efac',
  'heat-3': '#4ade80',
  'heat-4': '#16a34a',
  'heat-5': '#15803d',
  'heat-6': '#166534',
  'heat-7': '#14532d',
  'heat-ink-dark': '#000000',
  'heat-ink-light': '#ffffff',
} as const

export const pugHighContrast = {
  version: 1,
  name: 'Pug High Contrast',
  contrast: 'high',
  variants: {
    light: {
      colors: {
        background: 'oklch(1 0 0)',
        primary: 'oklch(0.45 0.2 265)',
        destructive: 'oklch(0.44 0.18 25)',
        success: 'oklch(0.5 0.15 145)',
        warning: 'oklch(0.62 0.15 70)',
        'chart-1': 'oklch(0.45 0.2 265)',
        'chart-2': 'oklch(0.5 0.15 145)',
        'chart-3': 'oklch(0.58 0.14 70)',
        'chart-4': 'oklch(0.47 0.18 330)',
        'chart-5': 'oklch(0.5 0.19 25)',
        'chart-crosshair': 'oklch(0.25 0.05 265)',
        'chart-scale-01': 'oklch(0.98 0.003 106)',
        'chart-scale-02': 'oklch(0.92 0.008 106)',
        'chart-scale-03': 'oklch(0.82 0.015 106)',
        'chart-scale-04': 'oklch(0.68 0.02 106)',
        'chart-scale-05': 'oklch(0.55 0.025 106)',
        'chart-scale-pattern-color': 'oklch(0.96 0.005 106)',
        ...RAMPS,
      },
    },
    dark: {
      colors: {
        background: 'oklch(0.13 0.01 265)',
        primary: 'oklch(0.82 0.11 265)',
        destructive: 'oklch(0.78 0.13 25)',
        success: 'oklch(0.8 0.14 145)',
        warning: 'oklch(0.85 0.13 80)',
        'chart-1': 'oklch(0.8 0.12 265)',
        'chart-2': 'oklch(0.82 0.14 145)',
        'chart-3': 'oklch(0.86 0.13 80)',
        'chart-4': 'oklch(0.8 0.13 330)',
        'chart-5': 'oklch(0.78 0.14 25)',
        'chart-crosshair': 'oklch(0.85 0.03 265)',
        'chart-scale-01': 'oklch(0.205 0.028 265)',
        'chart-scale-02': 'oklch(0.32 0.055 265)',
        'chart-scale-03': 'oklch(0.44 0.08 265)',
        'chart-scale-04': 'oklch(0.56 0.105 265)',
        'chart-scale-05': 'oklch(0.7 0.13 265)',
        'chart-scale-pattern-color': 'oklch(0.2 0.012 265)',
        ...RAMPS,
      },
    },
  },
} satisfies ThemeFile
