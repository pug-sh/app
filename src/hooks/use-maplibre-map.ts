import { useAtomValue } from 'jotai'
import { Map as MapLibreMap, type MapOptions, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { compiledThemeAtom } from '@/data/theme.atoms'

// v6 otherwise resolves the worker next to its own chunk, where Vite never emits it.
setWorkerUrl(workerUrl)

// --- The active theme, as the maps need it ---

// Memoised on the compiled theme, so map effects keyed on it run on any theme change — two dark
// themes included — and on nothing else.
export const useMapTheme = () => {
  const compiled = useAtomValue(compiledThemeAtom)
  return useMemo(
    () => ({
      dark: compiled.polarity === 'dark',
      vars: compiled.vars,
      cardL: compiled.tokens.card.l,
      neutralHue: compiled.tokens.background.h,
    }),
    [compiled],
  )
}

// --- Map instance lifecycle ---

type Options = Omit<MapOptions, 'container'>

// Creates a MapLibre map into a ref'd container on mount and tears it down on unmount.
// `ready` flips true once the map's first `load` event fires. The options are captured once
// (on mount); change the style/paint imperatively via mapRef afterwards.
export const useMaplibreMap = (options: Options) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const optionsRef = useRef(options)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new MapLibreMap({ container, ...optionsRef.current })
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
