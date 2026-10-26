import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

// Drawn in a map's place when MapLibre can't get a WebGL2 context. Everything around the map still
// works, so this only says what's missing. `compact` drops the globe, for a note that has to fit a band.
export const MapUnavailable = ({ className, compact = false }: { className?: string; compact?: boolean }) => (
  <div className={cn('flex h-full w-full flex-col items-center justify-center px-4 text-center', className)}>
    {!compact && <Globe className="mb-2 size-7 opacity-15" />}
    <p className="text-sm text-muted-foreground">Map unavailable in this browser</p>
    <p className="text-xs text-muted-foreground">It needs WebGL2, which is turned off or not supported here.</p>
  </div>
)
