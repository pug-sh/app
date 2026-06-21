import { useAtomValue } from 'jotai'
import maplibregl, { type MapOptions } from 'maplibre-gl'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type Theme, themeAtom } from '@/data/theme.atoms'

// --- Resolved dark mode (shared by both maps + theme-aware styling) ---

const subscribeDark = (onStoreChange: () => void) => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onStoreChange()
  mq.addEventListener('change', handler)
  const obs = new MutationObserver(handler)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => {
    mq.removeEventListener('change', handler)
    obs.disconnect()
  }
}

const getResolvedDark = (theme: Theme) => {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return document.documentElement.classList.contains('dark')
}

export const useResolvedDark = () => {
  const theme = useAtomValue(themeAtom)
  return useSyncExternalStore(
    subscribeDark,
    () => getResolvedDark(theme),
    () => false,
  )
}

// --- Map instance lifecycle ---

type Options = Omit<MapOptions, 'container'>

// Creates a MapLibre map into a ref'd container on mount and tears it down on unmount.
// `ready` flips true once the map's first `load` event fires. The options are captured once
// (on mount); change the style/paint imperatively via mapRef afterwards.
export const useMaplibreMap = (options: Options) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const optionsRef = useRef(options)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({ container, ...optionsRef.current })
    mapRef.current = map
    const onLoad = () => setReady(true)
    map.on('load', onLoad)

    return () => {
      map.off('load', onLoad)
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  return { containerRef, mapRef, ready }
}
