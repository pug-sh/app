import type { CompiledTheme } from '@/theme/compile'

const CHART = 'M46,88 L62,82 L78,85 L94,73 L110,76 L126,63 L142,69 L158,56 L188,60'

// A tiny Pug drawn from a theme's own compiled variant, so it can preview themes that aren't active. One drawing
// that fills whatever box it's given. SVG attributes, not inline styles: happy-dom drops oklch() from a style, so a
// test couldn't see what's drawn.
const ThemePreview = ({ compiled }: { compiled: Pick<CompiledTheme, 'vars' | 'data'> }) => {
  const { vars, data } = compiled
  const line = data.categorical[0].line
  const item = vars['--sidebar-foreground']
  return (
    <svg aria-hidden viewBox="0 0 200 112" preserveAspectRatio="none" className="block size-full">
      <rect width="200" height="112" fill={vars['--background']} />
      <rect width="34" height="112" fill={vars['--sidebar']} />
      <rect x="7" y="12" width="20" height="3" rx="1.5" fill={item} opacity=".4" />
      <rect x="7" y="20" width="20" height="3" rx="1.5" fill={item} />
      <rect x="7" y="28" width="20" height="3" rx="1.5" fill={item} opacity=".4" />
      <rect x="7" y="36" width="20" height="3" rx="1.5" fill={item} opacity=".4" />
      <rect x="44" y="13" width="64" height="5" rx="2.5" fill={vars['--foreground']} />
      <rect x="136" y="9" width="54" height="13" rx="4" fill={vars['--primary']} />
      <rect x="147" y="14.5" width="32" height="2" rx="1" fill={vars['--primary-foreground']} />
      <rect x="44" y="28" width="66" height="3" rx="1.5" fill={vars['--link']} />
      <rect
        x="44.5"
        y="38.5"
        width="145"
        height="64"
        rx="4"
        fill={vars['--card']}
        stroke={vars['--border']}
        vectorEffect="non-scaling-stroke"
      />
      <path d={`${CHART} L188,101 L46,101 Z`} fill={line} opacity=".16" />
      <path d={CHART} fill="none" stroke={line} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default ThemePreview
