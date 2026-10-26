import { Globe, Loader2 } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Button } from '@/components/ui/button'

const ActivityHeatmapMap = lazy(() => import('@/components/activity-heatmap-map'))

export type CountryActivity = {
  iso: string
  count: number
}

type ActivityMapViewProps = {
  countries: readonly CountryActivity[]
  loading: boolean
  error: string | null
  retry: () => void
  className?: string
  onCountrySelect?: (alpha2: string) => void
  selected?: readonly string[]
  emptyQualifier?: string
}

const Spinner = ({ className }: { className: string }) => (
  <div className={`${className} flex items-center justify-center`}>
    <Loader2 className="size-4 animate-spin text-muted-foreground/70" />
  </div>
)

export const ActivityMapView = ({
  countries,
  loading,
  error,
  retry,
  className,
  onCountrySelect,
  selected,
  emptyQualifier,
}: ActivityMapViewProps) => {
  const stateClass = className ?? 'absolute inset-0'

  if (loading && countries.length === 0) return <Spinner className={stateClass} />

  if (error) {
    return (
      <div className={`${stateClass} flex flex-col items-center justify-center gap-2 text-center`}>
        <Globe className="size-7 opacity-15" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => retry()}>
          Retry
        </Button>
      </div>
    )
  }

  if (countries.length === 0) {
    return (
      <div className={`${stateClass} flex flex-col items-center justify-center text-center`}>
        <Globe className="mb-2 size-7 opacity-15" />
        <p className="text-sm text-muted-foreground">
          {['No location data in this period', emptyQualifier].filter(Boolean).join(' ')}
        </p>
      </div>
    )
  }

  return (
    <div className={stateClass}>
      <Suspense fallback={<Spinner className="absolute inset-0" />}>
        <ActivityHeatmapMap countries={countries} onCountrySelect={onCountrySelect} selected={selected} />
      </Suspense>
    </div>
  )
}
