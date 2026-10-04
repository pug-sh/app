import { describe, expect, it } from 'vitest'
import series from '@/theme/__fixtures__/series.json'
import { compileDataPalette } from '@/theme/data-palette'
import { PUG_CANVAS } from '@/theme/fit'
import { fadedSeriesColor, getIndexedColor, getSeriesColor, setSeriesPalette } from './event-colors'

// Golden: every colour the series palette hands out matches what the pre-refactor code produced,
// byte for byte, in both modes.
describe.each(['light', 'dark'] as const)('series colours on Pug %s', polarity => {
  const golden = series[polarity]
  setSeriesPalette(compileDataPalette(undefined, polarity, 'standard', PUG_CANVAS[polarity]))

  it('match today for every named, family and unmapped event', () => {
    setSeriesPalette(compileDataPalette(undefined, polarity, 'standard', PUG_CANVAS[polarity]))
    for (const [name, line] of Object.entries(golden.named)) {
      expect(getSeriesColor(name), name).toEqual({ line, fill: `${line}1a`, dot: line })
    }
  })

  it('match today for generic labels and breakdown indices', () => {
    setSeriesPalette(compileDataPalette(undefined, polarity, 'standard', PUG_CANVAS[polarity]))
    golden.generic.forEach((line, i) => expect(getSeriesColor(`Step ${i + 1}`, i).line).toBe(line))
    golden.indexed.forEach((line, i) => expect(getIndexedColor(i).line).toBe(line))
  })
})

it('fades a reference series with alpha', () => {
  expect(fadedSeriesColor({ line: '#2563eb', fill: '#2563eb1a', dot: '#2563eb' })).toEqual({
    line: '#2563eb99',
    fill: '#2563eb1a',
    dot: '#2563eb99',
  })
})
