import { DEFAULT_AVATARS } from '../data-palette'
import type { ThemeFile } from '../format'

// Pug's look, as data. Light neutrals and the status fills are set as hexes; dark surfaces and secondary
// text are plain greys. Chart-1 and the breakdown colours are the vendored charts' own hues,
// calmed (CHART_DEFAULTS). Status text, heatmaps and name chips are Pug's own.

// Pug in high contrast: roots only, and every other token is solved to the high-contrast targets, headroom over
// validation's floors. Light sits on pure white; dark on a near-black ink ground with light fills carrying dark text,
// so a button reads as a shape against the canvas as well. The tracked builtin-themes.css turns any change into a diff.
const HIGH_RAMPS = {
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

// Pug in colourblind-safe: data colours remapped to Okabe–Ito. Failure and success move to vermillion and blue, the
// pair that stays apart under protan, deutan and tritan vision. The breakdown palette is hand-fitted per mode, because
// the standard light fit caps lightness at 0.52 and flattens the very channel colourblind readers lean on (orange and
// vermillion collapse to ΔE 0.001 under deutan). Light carries six colours: yellow can't be both legible on white and
// still yellow. Domain groups keep Pug's hues.
const OUTCOMES = { failure: '#d55e00', success: '#0072b2' }

export const pug = {
  version: 1,
  name: 'Pug',
  contrast: 'standard',
  variants: {
    light: {
      colors: {
        // The sidebar's grey is the shell the white page panel sits on.
        background: '#ffffff',
        foreground: '#4d4d4d',
        card: '#f7f7fa',
        'card-foreground': '#0d0e10',
        popover: '#ffffff',
        'popover-foreground': '#0d0e10',
        primary: '#5a60c9',
        'primary-foreground': '#ffffff',
        // Blue used AS text (links, tinted icons). Decoupled from primary so each mode can tune it
        // without moving the button fill.
        link: '#5a60c9',
        secondary: '#f2f2f7',
        'secondary-foreground': '#4d4d4d',
        muted: '#f2f2f7',
        'muted-foreground': '#6c6e7f',
        // Fourth ink tier (text-faint): the muted grey stepped lighter. Solid, not alpha: alpha
        // composites to a different weight per mode.
        faint: '#8d8fa1',
        accent: '#f2f2f7',
        'accent-foreground': '#4d4d4d',
        destructive: '#dc2626',
        'destructive-foreground': '#ffffff',
        border: '#e5e5ea',
        input: '#e5e5ea',
        ring: '#5a60c9',
        success: '#10b981',
        warning: '#eab308',
        // Text tier for the semantic hues: a fill and coloured text pull lightness in opposite
        // directions, so each has its own token. Chroma held at the series cap.
        positive: 'oklch(0.431 0.14 145)',
        caution: 'oklch(0.451 0.14 70)',
        negative: 'oklch(0.462 0.14 25)',
        // Semantic chart hues, a touch darker than dark mode to read on the light ground.
        'chart-1': '#666ed8',
        'chart-2': 'oklch(0.6 0.17 145)',
        'chart-3': 'oklch(0.7 0.15 70)',
        'chart-4': 'oklch(0.55 0.16 330)',
        'chart-5': 'oklch(0.58 0.2 25)',
        sidebar: '#f2f2f7',
        'sidebar-foreground': '#0d0e10',
        'sidebar-primary': '#5a60c9',
        'sidebar-primary-foreground': '#ffffff',
        // The active nav item is a small white panel on the shell.
        'sidebar-accent': '#ffffff',
        'sidebar-accent-foreground': '#0d0e10',
        'sidebar-border': '#e5e5ea',
        'sidebar-ring': '#5a60c9',
        'chart-background': '#f7f7fa',
        'chart-foreground': '#0d0e10',
        'chart-foreground-muted': '#6c6e7f',
        'chart-label': '#6c6e7f',
        'chart-line-primary': '#666ed8',
        'chart-line-secondary': 'oklch(0.6 0.17 145)',
        'chart-crosshair': 'oklch(0.4 0.1828 274.34)',
        'chart-grid': '#e5e5ea',
        'chart-brush-border': '#e5e5ea',
        'chart-tooltip-background': '#ffffff',
        'chart-tooltip-foreground': '#0d0e10',
        'chart-tooltip-muted': '#6c6e7f',
        'chart-marker-background': 'oklch(0.97 0.005 265)',
        'chart-marker-border': 'oklch(0.85 0.01 265)',
        'chart-marker-foreground': 'oklch(0.3 0.01 265)',
        'chart-scale-01': 'oklch(0.98 0.003 106)',
        'chart-scale-02': 'oklch(0.92 0.008 106)',
        'chart-scale-03': 'oklch(0.82 0.015 106)',
        'chart-scale-04': 'oklch(0.68 0.02 106)',
        'chart-scale-05': 'oklch(0.55 0.025 106)',
        'chart-scale-pattern-color': 'oklch(0.96 0.005 106)',
        // Retention heatmap, value intensity low to high. Identical in both modes today (a known
        // issue: the pale low end glows on the dark canvas).
        'heat-1': '#dcfce7',
        'heat-2': '#86efac',
        'heat-3': '#4ade80',
        'heat-4': '#16a34a',
        'heat-5': '#15803d',
        'heat-6': '#166534',
        'heat-7': '#14532d',
        'heat-ink-dark': '#14532d',
        'heat-ink-light': '#f8fafc',
        'heat-1-ink': '#14532d',
        'heat-2-ink': '#14532d',
        'heat-3-ink': '#14532d',
        'heat-4-ink': '#f8fafc',
        'heat-5-ink': '#f8fafc',
        'heat-6-ink': '#f8fafc',
        'heat-7-ink': '#f8fafc',
        // Name chips: only L and C are used; the hue comes from the name.
        'identity-surface': 'oklch(0.93 0.035 0)',
        'identity-ink': 'oklch(0.45 0.08 0)',
        'syntax-keyword': 'oklch(0.55 0.16 18)',
        'syntax-string': 'oklch(0.5 0.1 160)',
        'syntax-class': 'oklch(0.52 0.12 255)',
      },
      data: { avatars: DEFAULT_AVATARS },
      modes: {
        'high-contrast': {
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
            ...HIGH_RAMPS,
          },
        },
        colourblind: {
          data: {
            groups: OUTCOMES,
            categorical: ['#005181', '#9e6c00', '#007eb1', '#007655', '#9b4200', '#8a0060'],
          },
        },
      },
    },
    dark: {
      colors: {
        // The sidebar's near-black is the shell; the page panel sits a step above it, cards a step
        // above that.
        background: '#171717',
        // Softer than the off-white that cards, menus and the sidebar keep: at body size it glares
        // on these grounds. Text on fills stays white.
        foreground: 'oklch(0.8 0.006 286)',
        card: '#1d1d1d',
        'card-foreground': '#e5e5ea',
        popover: '#242424',
        'popover-foreground': '#e5e5ea',
        primary: '#5a60c9',
        'primary-foreground': '#ffffff',
        // Lighter than primary, which is too deep to read as text on these grounds.
        link: '#8591f0',
        secondary: '#242424',
        'secondary-foreground': 'oklch(0.8 0.006 286)',
        muted: '#242424',
        'muted-foreground': '#a0a0a0',
        faint: '#6c6e7f',
        // Above popover: menu-item hovers render on popovers.
        accent: '#2e2e2e',
        'accent-foreground': 'oklch(0.8 0.006 286)',
        destructive: '#dc2626',
        'destructive-foreground': '#ffffff',
        success: '#10b981',
        warning: '#eab308',
        // Low chroma on purpose: against a near-grayscale UI a saturated hue shouts on colour alone.
        positive: 'oklch(0.71 0.1 145)',
        caution: 'oklch(0.72 0.1 70)',
        negative: 'oklch(0.7 0.1 25)',
        // Translucent white, so one border reads on the panel, cards and menus.
        // input stays SOLID: form controls use dark:bg-input/30, and /NN multiplies alpha away.
        border: 'oklch(1 0 0 / 0.055)',
        input: '#242424',
        ring: '#8591f0',
        // A rung below body ink: data reads as data, never the loudest thing on the page.
        'chart-1': '#666ed8',
        'chart-2': 'oklch(0.672 0.16 145)',
        'chart-3': 'oklch(0.715 0.15 70)',
        'chart-4': 'oklch(0.65 0.15 330)',
        'chart-5': 'oklch(0.666 0.165 25)',
        sidebar: '#121212',
        'sidebar-foreground': '#e5e5ea',
        'sidebar-primary': '#5a60c9',
        'sidebar-primary-foreground': '#ffffff',
        // The panel's own tone, held below card so the active nav item never outshines content.
        'sidebar-accent': '#171717',
        'sidebar-accent-foreground': '#e5e5ea',
        'sidebar-border': 'oklch(1 0 0 / 0.055)',
        'sidebar-ring': '#8591f0',
        'chart-background': '#1d1d1d',
        'chart-foreground': '#e5e5ea',
        'chart-foreground-muted': '#a0a0a0',
        'chart-label': '#a0a0a0',
        'chart-line-primary': '#666ed8',
        'chart-line-secondary': 'oklch(0.672 0.16 145)',
        'chart-crosshair': 'oklch(0.55 0.02 265)',
        'chart-grid': 'oklch(1 0 0 / 0.055)',
        'chart-brush-border': 'oklch(1 0 0 / 0.055)',
        'chart-tooltip-background': '#242424',
        'chart-tooltip-foreground': '#e5e5ea',
        'chart-tooltip-muted': '#a0a0a0',
        'chart-marker-background': '#242424',
        'chart-marker-border': '#424242',
        'chart-marker-foreground': 'oklch(0.87 0.003 265)',
        'chart-scale-01': 'oklch(0.205 0.028 265)',
        'chart-scale-02': 'oklch(0.32 0.055 265)',
        'chart-scale-03': 'oklch(0.44 0.08 265)',
        'chart-scale-04': 'oklch(0.56 0.105 265)',
        'chart-scale-05': 'oklch(0.7 0.13 265)',
        'chart-scale-pattern-color': 'oklch(0.2 0.012 265)',
        'heat-1': '#dcfce7',
        'heat-2': '#86efac',
        'heat-3': '#4ade80',
        'heat-4': '#16a34a',
        'heat-5': '#15803d',
        'heat-6': '#166534',
        'heat-7': '#14532d',
        'heat-ink-dark': '#14532d',
        'heat-ink-light': '#f8fafc',
        'heat-1-ink': '#14532d',
        'heat-2-ink': '#14532d',
        'heat-3-ink': '#14532d',
        'heat-4-ink': '#f8fafc',
        'heat-5-ink': '#f8fafc',
        'heat-6-ink': '#f8fafc',
        'heat-7-ink': '#f8fafc',
        'identity-surface': 'oklch(0.37 0.045 0)',
        'identity-ink': 'oklch(0.86 0.05 0)',
        'syntax-keyword': 'oklch(0.77 0.13 18)',
        'syntax-string': 'oklch(0.8 0.11 160)',
        'syntax-class': 'oklch(0.8 0.1 255)',
      },
      data: { avatars: DEFAULT_AVATARS },
      modes: {
        'high-contrast': {
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
            ...HIGH_RAMPS,
          },
        },
        colourblind: {
          data: {
            groups: OUTCOMES,
            categorical: ['#56b6ff', '#f9ad00', '#96d7ff', '#00ac7e', '#de6200', '#ff6ec4', '#f5e700'],
          },
        },
      },
    },
  },
} satisfies ThemeFile
