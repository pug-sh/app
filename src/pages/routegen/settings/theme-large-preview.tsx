import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { CompiledTheme } from '@/theme/compile'

const AREA = 'M0,62 L9,58 L18,60 L27,48 L36,50 L45,36 L54,40 L63,26 L72,30 L81,18 L90,22 L100,12'
const AREA2 = 'M0,72 L9,70 L18,66 L27,68 L36,60 L45,62 L54,54 L63,56 L72,50 L81,52 L90,44 L100,46'

const NAV = ['Insights', 'Dashboards', 'Profiles']
// Fixed sample values, never customer data.
const FIGURES = [
  { label: 'Active users', value: '12,480', delta: '+8.2%', tone: 'text-positive' },
  { label: 'Events', value: '1.2M', delta: '+3.1%', tone: 'text-positive' },
  { label: 'Churn', value: '2.4%', delta: '+0.6%', tone: 'text-negative' },
]

// A miniature dashboard, the close look at a theme. Its root carries every token, so the plain token classes inside
// read this theme's colours, not the page's: the mapping is `@theme inline`, so a utility reads the variable where
// it's used. No `dark:` classes in here, since the page's mode says nothing about this theme.
const ThemeLargePreview = ({ compiled }: { compiled: Pick<CompiledTheme, 'vars' | 'data'> }) => {
  const [first, second] = compiled.data.categorical

  return (
    <div
      aria-hidden
      style={compiled.vars as CSSProperties}
      className="flex h-60 overflow-hidden rounded-lg border border-border bg-background text-xs text-foreground"
    >
      <div className="w-24 shrink-0 space-y-1 bg-sidebar p-2 text-sidebar-foreground">
        <p className="px-1.5 py-1 font-medium">Pug</p>
        <p className="rounded-md bg-sidebar-accent px-1.5 py-1 text-sidebar-accent-foreground">Overview</p>
        {NAV.map(item => (
          <p key={item} className="px-1.5 py-1">
            {item}
          </p>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-base">Overview</span>
          <span className="shrink-0 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground">
            New dashboard
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {FIGURES.map(({ label, value, delta, tone }) => (
            <div key={label} className="min-w-0">
              <p className="truncate text-muted-foreground">{label}</p>
              <p className="text-sm tabular-nums">{value}</p>
              <p className={cn('tabular-nums', tone)}>{delta}</p>
            </div>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 rounded-md border border-border bg-card p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">Signups by week</span>
            <span className="shrink-0 text-link">View insight</span>
          </div>
          <svg viewBox="0 0 100 80" preserveAspectRatio="none" className="min-h-0 w-full flex-1">
            <path d={`${AREA} L100,80 L0,80 Z`} fill={first.line} opacity=".16" />
            <path d={AREA} fill="none" stroke={first.line} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <path d={AREA2} fill="none" stroke={second.line} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default ThemeLargePreview
