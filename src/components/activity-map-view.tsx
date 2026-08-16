import { Globe, Loader2 } from 'lucide-react'
import ActivityHeatmapMap from '@/components/activity-heatmap-map'
import { Button } from '@/components/ui/button'

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
}

export const ActivityMapView = ({
  countries,
  loading,
  error,
  retry,
  className,
  onCountrySelect,
  selected,
}: ActivityMapViewProps) => {
  const stateClass = className ?? 'absolute inset-0'

  if (loading && countries.length === 0) {
    return (
      <div className={`${stateClass} flex items-center justify-center`}>
        <Loader2 className="size-4 animate-spin text-muted-foreground/70" />
      </div>
    )
  }

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
        <p className="text-sm text-muted-foreground">No location data yet</p>
      </div>
    )
  }

  return (
    <div className={stateClass}>
      <ActivityHeatmapMap countries={countries} onCountrySelect={onCountrySelect} selected={selected} />
    </div>
  )
}
