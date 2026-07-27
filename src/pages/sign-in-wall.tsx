import { useAtomValue } from 'jotai'
import { type CSSProperties, Fragment, memo, type ReactNode } from 'react'
import { resolvedThemeAtom } from '@/data/theme.atoms'
import { getIndexedColor, getSeriesColor } from '@/lib/event-colors'

// Decorative stand-ins for real dashboard tiles — hand-drawn SVG, never the vendored charts:
// this sits behind a rotation at low contrast, so it must not pull in a chart runtime or any data.

// Must match the viewBox on the <svg> that renders the path.
const SPARK_W = 104
const SPARK_H = 30

const sparkPath = (points: number[]) => {
  const min = Math.min(...points)
  const span = Math.max(...points) - min || 1
  return points
    .map(
      (p, i) =>
        `${i ? 'L' : 'M'}${((i / (points.length - 1)) * SPARK_W).toFixed(1)} ${(SPARK_H - ((p - min) / span) * SPARK_H).toFixed(1)}`,
    )
    .join(' ')
}

// Light leans on the drop shadow for lift; dark drops it and carries elevation in the fill
// instead (--card already sits above the canvas), since a shadow reads as nothing on dark.
const Shell = ({ children }: { children: ReactNode }) => (
  <div className="mb-4 w-[192px] rounded-xl border border-border bg-card/80 p-3 shadow-[0_10px_30px_-18px_oklch(0_0_0/0.45)] dark:bg-card dark:shadow-none">
    {children}
  </div>
)

const Kicker = ({ children }: { children: ReactNode }) => (
  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</span>
)

const TrendCard = ({
  event,
  label,
  value,
  delta,
  points,
}: {
  event: string
  label: string
  value: string
  delta: string
  points: number[]
}) => {
  const c = getSeriesColor(event)
  const line = sparkPath(points)
  return (
    <Shell>
      <Kicker>Trends</Kicker>
      <p className="mt-1 text-sm text-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg tabular-nums">{value}</span>
        <span className="text-xs tabular-nums" style={{ color: c.line }}>
          {delta}
        </span>
      </div>
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="mt-2 h-8 w-full" aria-hidden>
        <path d={`${line} L${SPARK_W} ${SPARK_H} L0 ${SPARK_H} Z`} fill={c.fill} />
        <path d={line} fill="none" stroke={c.line} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Shell>
  )
}

const FunnelCard = ({ label, steps }: { label: string; steps: number[] }) => {
  const c = getSeriesColor('checkout_started')
  return (
    <Shell>
      <Kicker>Funnel</Kicker>
      <p className="mt-1 mb-2 text-sm text-foreground">{label}</p>
      <div className="space-y-1.5">
        {steps.map((pct, i) => (
          <div key={`${i}-${pct}`} className="flex items-center gap-2">
            <div className="h-3 rounded-sm" style={{ width: `${pct}%`, backgroundColor: c.line, opacity: 0.75 }} />
            <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
          </div>
        ))}
      </div>
    </Shell>
  )
}

// Cells ramp on the brand token, not a series color: real retention heatmaps are
// value-intensity based, and the slate that `signup` legitimately resolves to reads as drab.
const RetentionCard = ({ cells }: { cells: number[] }) => (
  <Shell>
    <Kicker>Retention</Kicker>
    <p className="mt-1 mb-2 text-sm text-foreground">Weekly cohorts</p>
    <div className="grid grid-cols-6 gap-1">
      {cells.map((v, i) => (
        <div key={`${i}-${v}`} className="aspect-square rounded-sm bg-primary" style={{ opacity: 0.14 + v * 0.66 }} />
      ))}
    </div>
  </Shell>
)

const TopKCard = ({ label, rows }: { label: string; rows: { name: string; pct: number }[] }) => (
  <Shell>
    <Kicker>Breakdown</Kicker>
    <p className="mt-1 mb-2 text-sm text-foreground">{label}</p>
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        // Indexed, not name-based: breakdown values carry no semantic identity, and these three
        // hash to one bucket in the fallback palette (CLAUDE.md names this exact trio).
        const c = getIndexedColor(i)
        return (
          <div key={r.name} className="relative flex items-center justify-between rounded-sm px-1.5 py-0.5">
            <div
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{ width: `${r.pct}%`, backgroundColor: c.fill }}
            />
            <span className="relative text-xs text-foreground">{r.name}</span>
            <span className="relative text-xs text-muted-foreground tabular-nums">{r.pct}%</span>
          </div>
        )
      })}
    </div>
  </Shell>
)

const EventCard = ({
  event,
  property,
  value,
  time,
}: {
  event: string
  property: string
  value: string
  time: string
}) => {
  const c = getSeriesColor(event)
  return (
    <Shell>
      <div className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.dot }} />
        <span className="truncate font-mono text-xs" style={{ color: c.line }}>
          {event}
        </span>
        <span className="ml-auto shrink-0 text-xs text-faint tabular-nums">{time}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">{property}</span>
        <span className="text-xs text-faint">=</span>
        <span className="truncate font-mono text-xs text-foreground">{value}</span>
      </div>
    </Shell>
  )
}

// One deck; each column takes it at a different rotation so no two columns read alike.
// Built per render, not hoisted: a hoisted element is referentially stable, so React bails out
// of re-rendering it and the inline getSeriesColor() fills freeze on a theme toggle.
const buildDeck = () => [
  <TrendCard
    key="t1"
    event="signup"
    label="Signups"
    value="1,284"
    delta="+12.4%"
    points={[8, 11, 9, 14, 13, 18, 17, 23, 26]}
  />,
  <EventCard key="e1" event="page_view" property="$browser" value="Chrome" time="2m ago" />,
  <FunnelCard key="f1" label="Checkout" steps={[100, 62, 38, 24]} />,
  <EventCard key="e2" event="checkout_completed" property="$os" value="iOS" time="5m ago" />,
  <RetentionCard
    key="r1"
    cells={[1, 0.82, 0.6, 0.44, 0.3, 0.22, 1, 0.74, 0.52, 0.38, 0.26, 0.16, 1, 0.88, 0.66, 0.48, 0.34, 0.24]}
  />,
  <TopKCard
    key="k1"
    label="Top sources"
    rows={[
      { name: 'github', pct: 46 },
      { name: 'newsletter', pct: 31 },
      { name: 'twitter', pct: 23 },
    ]}
  />,
  <EventCard key="e3" event="signup" property="$utmSource" value="github" time="11m ago" />,
  <TrendCard
    key="t2"
    event="page_view"
    label="Active users"
    value="8,431"
    delta="+3.1%"
    points={[14, 13, 16, 15, 19, 18, 22, 21, 24]}
  />,
  <EventCard key="e4" event="payment_failed" property="plan" value="pro" time="18m ago" />,
  <TrendCard
    key="t3"
    event="checkout_completed"
    label="Revenue"
    value="$21.7k"
    delta="+8.6%"
    points={[6, 9, 8, 12, 16, 15, 19, 24, 28]}
  />,
]

// Each column renders the deck COPIES times and the track scrolls by exactly one copy, so the
// loop is seamless only while one copy is taller than the column. A copy is ~1325px and the
// column is 150vh, so 2 copies drained visibly above a ~883px window; 3 clears any real display.
const COPIES = [0, 1, 2]

// Slow and desynchronised — this is a background, so nothing should read as busy.
// Five columns: at 1440x900, rotating -35° needs ~1100px of wall to cover the panel's corners,
// which four at this width don't reach. Wider viewports need more; the edge fade covers the rest.
const COLUMNS = [
  { offset: 0, duration: '84s', delay: '0s', direction: 'normal' },
  { offset: 2, duration: '68s', delay: '-19s', direction: 'reverse' },
  { offset: 4, duration: '96s', delay: '-8s', direction: 'normal' },
  { offset: 6, duration: '74s', delay: '-31s', direction: 'reverse' },
  { offset: 8, duration: '88s', delay: '-44s', direction: 'normal' },
]

// memo: this is an unmemoized child of SignIn, so without it every keystroke-free form
// interaction re-renders 150 cards. The theme subscription below still re-renders it on toggle.
export const SignInWall = memo(() => {
  // Subscribing to the theme is what re-renders the deck on toggle, so the inline
  // getSeriesColor() fills re-resolve; the glow also wants more presence on dark.
  const resolvedTheme = useAtomValue(resolvedThemeAtom)
  const glow = resolvedTheme === 'dark' ? '22%' : '14%'
  const deck = buildDeck()

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(900px 620px at 32% 18%, color-mix(in oklab, var(--primary) ${glow}, transparent), transparent 62%),
            radial-gradient(720px 520px at 78% 88%, color-mix(in oklab, var(--primary) ${glow}, transparent), transparent 62%)`,
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center [transform:rotate(-35deg)_scale(1.25)]">
        <div className="flex gap-4">
          {COLUMNS.map(col => {
            const cards = [...deck.slice(col.offset), ...deck.slice(0, col.offset)]
            return (
              <div key={col.offset} className="h-[150vh] w-[192px] overflow-hidden">
                <div
                  className="signin-wall-track flex flex-col"
                  style={
                    {
                      animationDuration: col.duration,
                      animationDelay: col.delay,
                      animationDirection: col.direction,
                      // The keyframe scrolls by one copy: calc(-100% / copies). Kept in CSS so the
                      // count and the loop distance can't drift apart.
                      '--wall-copies': COPIES.length,
                    } as CSSProperties
                  }
                >
                  {COPIES.map(copy => (
                    <Fragment key={copy}>{cards}</Fragment>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Each edge holds opaque for a band before it ramps: starting the ramp at the container
          edge leaves the glow part-masked there, which reads as a crisp line against the form. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, var(--background) 0%, var(--background) 4%, transparent 26%, transparent 76%, var(--background) 97%, var(--background) 100%),
            linear-gradient(to right, var(--background) 0%, var(--background) 10%, transparent 44%, transparent 86%, var(--background) 100%)`,
        }}
      />
    </div>
  )
})
SignInWall.displayName = 'SignInWall'
