import createGlobe from 'cobe'
import { Facehash } from 'facehash'
import { useEffect, useMemo, useRef } from 'react'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { COUNTRY_CENTROIDS } from '@/components/country-centroids'
import { formatCountryName } from '@/lib/live-visitors'
import { structGet } from '@/lib/struct'

type Props = {
  visitors: ActivityEvent[]
  focusedIso?: string | null
  selectedDistinctId?: string | null
  onSelectVisitor?: (distinctId: string) => void
}

type CountryMarker = {
  iso: string
  primaryDistinctId: string
  visitorIds: string[]
  count: number
  lat: number
  lng: number
}

type Projected = { x: number; y: number; visible: boolean }

// Bright, saturated palette so faces pop against the light cobe globe.
const VIBRANT_COLORS = [
  '#f43f5e',
  '#fb923c',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

/** Mirrors cobe's internal lat/lng → 2D projection so we can position HTML overlays. */
const project = (lat: number, lng: number, phi: number, theta: number, ratio: number): Projected => {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180 - Math.PI
  const cosLat = Math.cos(latRad)
  const tx = -cosLat * Math.cos(lngRad)
  const ty = Math.sin(latRad)
  const tz = cosLat * Math.sin(lngRad)
  const r = 0.85
  const sx = tx * r
  const sy = ty * r
  const sz = tz * r

  const cosT = Math.cos(theta)
  const cosP = Math.cos(phi)
  const sinT = Math.sin(theta)
  const sinP = Math.sin(phi)

  const cc = cosP * sx + sinP * sz
  const ss = sinP * sinT * sx + cosT * sy - cosP * sinT * sz
  const zz = -sinP * cosT * sx + sinT * sy + cosP * cosT * sz

  const visible = zz >= 0 || cc * cc + ss * ss >= 0.64

  return {
    x: (cc / ratio + 1) / 2,
    y: (-ss + 1) / 2,
    visible,
  }
}

const TWO_PI = Math.PI * 2

const shortestPhi = (current: number, desired: number) => {
  let diff = (desired - current) % TWO_PI
  if (diff > Math.PI) diff -= TWO_PI
  if (diff < -Math.PI) diff += TWO_PI
  return current + diff
}

const LiveGlobe = ({ visitors, focusedIso = null, selectedDistinctId = null, onSelectVisitor }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const markerRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const markersRef = useRef<CountryMarker[]>([])

  const phiRef = useRef(0)
  const thetaRef = useRef(0.22)
  const targetPhiRef = useRef(0)
  const targetThetaRef = useRef(0.22)
  const focusedRef = useRef(false)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, phi: 0, theta: 0 })

  const markers = useMemo<CountryMarker[]>(() => {
    const byCountry = new Map<string, ActivityEvent[]>()
    for (const v of visitors) {
      const c = structGet(v.autoProperties, '$country')
      if (!c) continue
      const iso = c.toUpperCase()
      if (!COUNTRY_CENTROIDS[iso]) continue
      const arr = byCountry.get(iso) ?? []
      arr.push(v)
      byCountry.set(iso, arr)
    }
    const result: CountryMarker[] = []
    for (const [iso, vs] of byCountry) {
      const [lng, lat] = COUNTRY_CENTROIDS[iso]
      result.push({
        iso,
        primaryDistinctId: vs[0].distinctId,
        visitorIds: vs.map(v => v.distinctId),
        count: vs.length,
        lat,
        lng,
      })
    }
    return result
  }, [visitors])

  markersRef.current = markers

  useEffect(() => {
    if (focusedIso && COUNTRY_CENTROIDS[focusedIso]) {
      const [lng, lat] = COUNTRY_CENTROIDS[focusedIso]
      const lngRad = (lng * Math.PI) / 180
      const latRad = (lat * Math.PI) / 180
      targetPhiRef.current = shortestPhi(phiRef.current, -Math.PI / 2 - lngRad)
      targetThetaRef.current = Math.max(-0.55, Math.min(0.55, latRad))
      focusedRef.current = true
    } else {
      focusedRef.current = false
      targetThetaRef.current = 0.22
    }
  }, [focusedIso])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let width = container.offsetWidth
    let height = container.offsetHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: width * dpr,
      height: height * dpr,
      phi: 0,
      theta: 0.22,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 1.35,
      baseColor: [0.92, 0.93, 0.95],
      markerColor: [0.06, 0.72, 0.45],
      glowColor: [0.96, 0.98, 1],
      markers: [],
    })

    const onResize = () => {
      width = container.offsetWidth
      height = container.offsetHeight
      globe.update({ width: width * dpr, height: height * dpr })
    }
    window.addEventListener('resize', onResize)

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      draggingRef.current = true
      focusedRef.current = false
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        phi: phiRef.current,
        theta: thetaRef.current,
      }
      container.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const phi = dragStartRef.current.phi + dx * 0.005
      const theta = Math.max(-0.55, Math.min(0.55, dragStartRef.current.theta + dy * 0.003))
      phiRef.current = phi
      thetaRef.current = theta
      targetPhiRef.current = phi
      targetThetaRef.current = theta
    }

    const endDrag = (e: PointerEvent) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      if (container.hasPointerCapture(e.pointerId)) {
        container.releasePointerCapture(e.pointerId)
      }
      canvas.style.cursor = 'grab'
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', endDrag)
    container.addEventListener('pointercancel', endDrag)

    let raf = 0
    const tick = () => {
      if (!focusedRef.current && !draggingRef.current) {
        targetPhiRef.current -= 0.0016
      }
      if (!draggingRef.current) {
        phiRef.current += (targetPhiRef.current - phiRef.current) * 0.07
        thetaRef.current += (targetThetaRef.current - thetaRef.current) * 0.07
      }

      globe.update({ phi: phiRef.current, theta: thetaRef.current })

      const ratio = width / Math.max(1, height)
      for (const m of markersRef.current) {
        const el = markerRefs.current.get(m.iso)
        if (!el) continue
        const pos = project(m.lat, m.lng, phiRef.current, thetaRef.current, ratio)
        el.style.left = `${(pos.x * 100).toFixed(3)}%`
        el.style.top = `${(pos.y * 100).toFixed(3)}%`
        if (pos.visible) {
          el.style.opacity = '1'
          el.style.pointerEvents = 'auto'
        } else {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
        }
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    canvas.style.opacity = '0'
    const fadeIn = window.setTimeout(() => {
      canvas.style.opacity = '1'
    }, 80)

    return () => {
      window.clearTimeout(fadeIn)
      window.removeEventListener('resize', onResize)
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', endDrag)
      container.removeEventListener('pointercancel', endDrag)
      cancelAnimationFrame(raf)
      globe.destroy()
    }
  }, [])

  return (
    <div ref={containerRef} className="relative h-full w-full touch-none">
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          opacity: 0,
          transition: 'opacity 700ms ease',
          cursor: 'grab',
        }}
      />
      <div className="pointer-events-none absolute inset-0">
        {markers.map(m => {
          const selected = selectedDistinctId !== null && m.visitorIds.includes(selectedDistinctId)
          return (
            <button
              key={m.iso}
              type="button"
              ref={el => {
                if (el) markerRefs.current.set(m.iso, el)
                else markerRefs.current.delete(m.iso)
              }}
              onClick={() => onSelectVisitor?.(m.primaryDistinctId)}
              aria-label={`${m.count} visitor${m.count === 1 ? '' : 's'} from ${formatCountryName(m.iso)}`}
              title={`${formatCountryName(m.iso)} — ${m.count} live`}
              style={{
                position: 'absolute',
                opacity: 0,
                transition: 'opacity 220ms ease',
                transform: 'translate(-50%, -50%)',
              }}
              className="group/marker"
            >
              <span
                className={`relative block rounded-full ring-[3px] shadow-lg transition-transform duration-200 group-hover/marker:scale-110 ${
                  selected
                    ? 'z-20 ring-emerald-500 scale-110 shadow-emerald-500/50'
                    : 'z-10 ring-white shadow-black/15'
                }`}
              >
                <Facehash
                  name={m.primaryDistinctId}
                  size={44}
                  showInitial={false}
                  intensity3d="dramatic"
                  interactive={false}
                  colors={VIBRANT_COLORS}
                  className="block rounded-full"
                />
                {m.count > 1 && (
                  <span className="absolute -bottom-1.5 -right-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background ring-2 ring-background">
                    {m.count}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default LiveGlobe
