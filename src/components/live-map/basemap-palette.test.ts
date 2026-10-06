import { describe, expect, it, vi } from 'vitest'
import { formatColor, parseColor } from '@/lib/color/parse'
import { BUILTINS } from '@/theme/builtin'

// The real cssColorToRgb paints a canvas; return values unchanged so the oklch strings compare.
vi.mock('@/lib/maplibre', () => ({ cssColorToRgb: (value: string) => value }))

const { basemapPalette, DARK_BASEMAP, rebaseDarkEntry } = await import('./basemap-palette')

const canonical = (value: string) => formatColor(parseColor(value) as NonNullable<ReturnType<typeof parseColor>>)
const pugDark = BUILTINS.pug.variants.dark?.colors

describe('the dark basemap', () => {
  it('is exactly today’s palette on Pug dark', () => {
    const palette = basemapPalette({
      dark: true,
      cardL: pugDark?.card?.l as number,
      neutralHue: pugDark?.background?.h as number,
    }) as Record<string, string | Record<string, string>>
    for (const [key, value] of Object.entries(DARK_BASEMAP)) {
      const got = palette[key]
      if (typeof value === 'string') expect(canonical(got as string), key).toBe(canonical(value))
      else
        for (const [k, v] of Object.entries(value))
          expect(canonical((got as Record<string, string>)[k]), `${key}.${k}`).toBe(canonical(v))
    }
  })

  it('seats itself on another dark canvas, keeping water and vegetation hues', () => {
    expect(rebaseDarkEntry('oklch(0.285 0.008 265)', 0.255, 300)).toBe('oklch(0.325 0.008 300)')
    expect(rebaseDarkEntry('oklch(0.235 0.018 235)', 0.255, 300)).toBe('oklch(0.275 0.018 235)')
  })

  it('leaves light to protomaps', () => {
    expect(basemapPalette({ dark: false, cardL: 0.958, neutralHue: 265 })).toEqual({})
  })
})
