import { type ComponentType, lazy, type ReactNode, Suspense, useEffect, useState } from 'react'

// Lazy because App imports this shell eagerly — bundled in, the wall rides the entry chunk on every
// authenticated load for decoration only a signed-out desktop visitor sees. A chunk that never
// arrives leaves the ground bare rather than throwing sign-in into main.tsx's error boundary.
const AuthWall = lazy(async (): Promise<{ default: ComponentType }> => {
  try {
    return { default: (await import('@/auth/auth-wall')).AuthWall }
  } catch (err) {
    // The fallback is deliberate, a module-evaluation bug inside the wall is not — say which happened.
    console.error('auth wall chunk failed to load', err)
    return { default: () => null }
  }
})

// Shared by sign-in and the org picker, which App renders into the same slot back to back — one
// layout is what keeps the wall running across that swap instead of remounting it.
export const AuthSplit = ({ children }: { children: ReactNode }) => {
  // The wall is `hidden lg:block`, which still mounts 1500 nodes a phone never paints.
  // Not useIsMobile: that breaks at 768px, so 768-1023px would pay the cost in full.
  const [wallVisible, setWallVisible] = useState(() => window.matchMedia('(min-width: 64rem)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 64rem)')
    const onChange = () => setWallVisible(mq.matches)
    // Re-read at commit: the initializer ran a paint ago, and only future events land after this.
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    // auth-surface lifts the page's whole surface ramp a step above the app canvas in light
    // mode; both halves read it, so the wall's cards and vignette come along.
    <div className="auth-surface min-h-screen bg-background lg:flex">
      {/* Left — content directly on the canvas. No card and no colour change at the midpoint:
          the wall vignettes into this same background, so the halves share one surface.
          min-w-0 lets this flex item shrink below the GIS button's width instead of overflowing. */}
      <div className="relative z-10 flex min-h-screen min-w-0 flex-1 flex-col px-6 py-10 lg:w-1/2">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center justify-center gap-2.5">
              <img src="/logo.svg" alt="" className="h-8 w-8" />
              <span className="text-lg font-medium tracking-tight">Pug</span>
            </div>
            {/* Reserved, because this column is vertically centred: without it a short state — a
                spinner, an error — collapses the block and drops the logo ~170px on the way past.
                Sized to the sign-in form, the tallest thing that routinely renders here. */}
            <div className="min-h-88">{children}</div>
          </div>
        </div>

        <p className="text-center text-xs text-faint">
          by{' '}
          <a
            href="https://tshoka.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline-offset-4 hover:underline"
          >
            tshoka
          </a>
        </p>
      </div>

      {/* Right — the product itself, drifting. Desktop only: it's decoration, and the rotated
          wall has no useful small-screen form. */}
      <div className="relative hidden lg:block lg:w-1/2">
        {wallVisible && (
          <Suspense fallback={null}>
            <AuthWall />
          </Suspense>
        )}
      </div>
    </div>
  )
}
