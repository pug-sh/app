import { DEFAULT_AVATARS, FALLBACK_COLORS } from '../data-palette'
import { fitFor } from '../fit'
import type { ThemeFile } from '../format'
import type { TokenName } from '../tokens'

// Pug — today's look, as data. Every token is explicit in both modes, so resolving Pug changes
// nothing; the golden fixtures pin these values to what index.css held before the refactor.
//
// Light is the reference mode and is considered finished; dark is solved against it. Every neutral
// sits at hue 265. Contrast between the modes was matched with APCA (offline, in design tooling):
// WCAG is polarity-blind, and matching it across modes structurally under-delivers dark. The shipped
// dark ladder sits two notches below APCA parity — parity read as hot.

export const pug = {
  version: 1,
  name: 'Pug',
  contrast: 'standard',
  variants: {
    light: {
      colors: {
        // Shift these together — moving one alone collides with its neighbour. .auth-surface
        // (PUG_AUTH_SURFACE below) shadows them on the sign-in pages: re-solve it whenever they move.
        background: 'oklch(0.943 0.005 265)',
        foreground: 'oklch(0.365 0.006 265)',
        card: 'oklch(0.958 0.004 265)',
        'card-foreground': 'oklch(0.365 0.006 265)',
        popover: 'oklch(0.958 0.004 265)',
        'popover-foreground': 'oklch(0.365 0.006 265)',
        primary: 'oklch(0.55 0.18 265)',
        'primary-foreground': 'oklch(0.98 0.005 265)',
        // Blue used AS text (links, tinted icons). Decoupled from primary so each mode can tune it
        // without moving the button fill.
        link: 'oklch(0.456 0.18 265)',
        secondary: 'oklch(0.911 0.008 265)',
        'secondary-foreground': 'oklch(0.402 0.008 265)',
        muted: 'oklch(0.911 0.008 265)',
        // Coupled to the surface ramp — retune whenever it moves.
        'muted-foreground': 'oklch(0.49 0.008 265)',
        // Fourth ink tier (text-faint) — timestamps, counts, hints. Solid, not alpha: alpha
        // composites to a different weight per mode.
        faint: 'oklch(0.611 0.008 265)',
        accent: 'oklch(0.911 0.008 265)',
        'accent-foreground': 'oklch(0.402 0.008 265)',
        destructive: 'oklch(0.55 0.2 25)',
        'destructive-foreground': 'oklch(0.98 0.005 25)',
        border: 'oklch(0.876 0.006 265)',
        input: 'oklch(0.876 0.006 265)',
        ring: 'oklch(0.55 0.18 265)',
        success: 'oklch(0.6 0.17 145)',
        warning: 'oklch(0.7 0.15 70)',
        // Text tier for the three semantic fills — same split as link vs primary, since a fill and
        // coloured text pull lightness in opposite directions. Chroma held at the series cap.
        positive: 'oklch(0.431 0.14 145)',
        caution: 'oklch(0.451 0.14 70)',
        negative: 'oklch(0.462 0.14 25)',
        // Semantic chart hues, a touch darker than dark mode to read on the light ground.
        'chart-1': 'oklch(0.55 0.18 265)',
        'chart-2': 'oklch(0.6 0.17 145)',
        'chart-3': 'oklch(0.7 0.15 70)',
        'chart-4': 'oklch(0.55 0.16 330)',
        'chart-5': 'oklch(0.58 0.2 25)',
        sidebar: 'oklch(0.926 0.005 265)',
        'sidebar-foreground': 'oklch(0.353 0.006 265)',
        'sidebar-primary': 'oklch(0.55 0.18 265)',
        'sidebar-primary-foreground': 'oklch(0.98 0.005 265)',
        'sidebar-accent': 'oklch(0.911 0.008 265)',
        'sidebar-accent-foreground': 'oklch(0.402 0.008 265)',
        'sidebar-border': 'oklch(0.886 0.005 265)',
        'sidebar-ring': 'oklch(0.55 0.18 265)',
        'chart-background': 'oklch(0.943 0.005 265)',
        'chart-foreground': 'oklch(0.365 0.006 265)',
        'chart-foreground-muted': 'oklch(0.49 0.008 265)',
        'chart-label': 'oklch(0.49 0.008 265)',
        'chart-line-primary': 'oklch(0.55 0.18 265)',
        'chart-line-secondary': 'oklch(0.6 0.17 145)',
        'chart-crosshair': 'oklch(0.4 0.1828 274.34)',
        'chart-grid': 'oklch(0.876 0.006 265)',
        'chart-brush-border': 'oklch(0.876 0.006 265)',
        'chart-tooltip-background': 'oklch(0.958 0.004 265)',
        'chart-tooltip-foreground': 'oklch(0.365 0.006 265)',
        'chart-tooltip-muted': 'oklch(0.49 0.008 265)',
        'chart-marker-background': 'oklch(0.97 0.005 265)',
        'chart-marker-border': 'oklch(0.85 0.01 265)',
        'chart-marker-foreground': 'oklch(0.3 0.01 265)',
        'chart-scale-01': 'oklch(0.98 0.003 106)',
        'chart-scale-02': 'oklch(0.92 0.008 106)',
        'chart-scale-03': 'oklch(0.82 0.015 106)',
        'chart-scale-04': 'oklch(0.68 0.02 106)',
        'chart-scale-05': 'oklch(0.55 0.025 106)',
        'chart-scale-pattern-color': 'oklch(0.96 0.005 106)',
        // Retention heatmap — value intensity, low to high. Identical in both modes today (a known
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
        // Name chips: only L and C are used — the hue comes from the name.
        'identity-surface': 'oklch(0.93 0.035 0)',
        'identity-ink': 'oklch(0.45 0.08 0)',
        'syntax-keyword': 'oklch(0.55 0.16 18)',
        'syntax-string': 'oklch(0.5 0.1 160)',
        'syntax-class': 'oklch(0.52 0.12 255)',
      },
      data: { categorical: FALLBACK_COLORS.map(fitFor('light', 'standard')), avatars: DEFAULT_AVATARS },
    },
    dark: {
      colors: {
        // Ground is an ink blue-black, not a grey: chroma rides up as lightness comes down so the deep
        // surfaces read as a material. Ink stays near-neutral so text never takes the cast.
        // EXPERIMENT: canvas pinned to the card tone — one flat plane, regions defined by hairlines
        // rather than elevation. Revert background to 0.175 0.014 to restore the elevated look.
        background: 'oklch(0.215 0.013 265)',
        foreground: 'oklch(0.818 0.004 265)',
        card: 'oklch(0.215 0.013 265)',
        'card-foreground': 'oklch(0.818 0.004 265)',
        popover: 'oklch(0.242 0.013 265)',
        'popover-foreground': 'oklch(0.818 0.004 265)',
        // Deep + saturated: white text clears AA.
        primary: 'oklch(0.55 0.175 265)',
        'primary-foreground': 'oklch(0.985 0.005 265)',
        link: 'oklch(0.685 0.135 265)',
        // The floor is accent keeping its gap over popover: menu-item hovers render on popovers.
        secondary: 'oklch(0.252 0.014 265)',
        'secondary-foreground': 'oklch(0.779 0.005 265)',
        muted: 'oklch(0.252 0.014 265)',
        'muted-foreground': 'oklch(0.709 0.006 265)',
        faint: 'oklch(0.605 0.007 265)',
        accent: 'oklch(0.285 0.016 265)',
        // Capped below foreground: solving it flat pushes chip ink past body ink.
        'accent-foreground': 'oklch(0.779 0.005 265)',
        destructive: 'oklch(0.55 0.175 25)',
        'destructive-foreground': 'oklch(0.985 0.005 25)',
        success: 'oklch(0.62 0.15 145)',
        warning: 'oklch(0.72 0.14 70)',
        // Seated at the secondary rung on purpose, with chroma well under the fills': against a
        // near-grayscale UI a saturated hue shouts on colour alone, at any lightness.
        positive: 'oklch(0.71 0.1 145)',
        caution: 'oklch(0.72 0.1 70)',
        negative: 'oklch(0.7 0.1 25)',
        // Translucent so it takes the tint of whatever surface it sits on; call sites dim it further.
        // input stays SOLID: form controls use dark:bg-input/30, and /NN multiplies alpha away.
        border: 'oklch(0.68 0.022 265 / 0.22)',
        input: 'oklch(0.252 0.014 265)',
        ring: 'oklch(0.62 0.15 265)',
        // A rung below body ink — data reads as data, never the loudest thing on the page.
        'chart-1': 'oklch(0.66 0.165 265)',
        'chart-2': 'oklch(0.672 0.16 145)',
        'chart-3': 'oklch(0.715 0.15 70)',
        'chart-4': 'oklch(0.65 0.15 330)',
        'chart-5': 'oklch(0.666 0.165 25)',
        sidebar: 'oklch(0.158 0.014 265)',
        'sidebar-foreground': 'oklch(0.8 0.005 265)',
        // Must match primary — white text on it is sub-AA otherwise.
        'sidebar-primary': 'oklch(0.55 0.175 265)',
        'sidebar-primary-foreground': 'oklch(0.985 0.005 265)',
        // Seated on the sidebar and held below card, so the active pill can never outshine content;
        // the active item is marked by its ink — which sits above body ink here, deliberately.
        'sidebar-accent': 'oklch(0.205 0.016 265)',
        'sidebar-accent-foreground': 'oklch(0.86 0.004 265)',
        'sidebar-border': 'oklch(0.68 0.022 265 / 0.14)',
        'sidebar-ring': 'oklch(0.62 0.15 265)',
        'chart-background': 'oklch(0.215 0.013 265)',
        'chart-foreground': 'oklch(0.818 0.004 265)',
        'chart-foreground-muted': 'oklch(0.709 0.006 265)',
        'chart-label': 'oklch(0.709 0.006 265)',
        'chart-line-primary': 'oklch(0.66 0.165 265)',
        'chart-line-secondary': 'oklch(0.672 0.16 145)',
        'chart-crosshair': 'oklch(0.55 0.02 265)',
        'chart-grid': 'oklch(0.68 0.022 265 / 0.22)',
        'chart-brush-border': 'oklch(0.68 0.022 265 / 0.22)',
        'chart-tooltip-background': 'oklch(0.242 0.013 265)',
        'chart-tooltip-foreground': 'oklch(0.818 0.004 265)',
        'chart-tooltip-muted': 'oklch(0.709 0.006 265)',
        'chart-marker-background': 'oklch(0.242 0.013 265)',
        'chart-marker-border': 'oklch(0.36 0.016 265)',
        'chart-marker-foreground': 'oklch(0.87 0.003 265)',
        // Heatmap ramp — low end seated just above the canvas so near-empty cells read as surface.
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
      data: { categorical: FALLBACK_COLORS.map(fitFor('dark', 'standard')), avatars: DEFAULT_AVATARS },
    },
  },
} satisfies ThemeFile

// The sign-in pages' light ground — a third ramp shadowing light mode. Tuned to be read in fragments
// between tiles; a full-screen field of the canvas reads as gray paper. Re-solved against the new
// ground, holding the app's ratios to within 0.01. Pug-only: not part of the public format.
// Only these nine are re-solved: popover, secondary, muted, accent and ring keep light mode's values,
// and nothing on the sign-in pages uses them yet. --popover at 0.958 sits below this 0.985 ground, so
// a popover added there would invert the elevation ramp — re-solve them at that point.
export const PUG_AUTH_SURFACE: Partial<Record<TokenName, string>> = {
  background: 'oklch(0.985 0.002 265)',
  card: 'oklch(0.998 0.002 265)',
  foreground: 'oklch(0.395 0.006 265)',
  'muted-foreground': 'oklch(0.519 0.008 265)',
  faint: 'oklch(0.642 0.008 265)',
  link: 'oklch(0.484 0.18 265)',
  negative: 'oklch(0.491 0.14 25)',
  border: 'oklch(0.916 0.006 265)',
  input: 'oklch(0.916 0.006 265)',
}
