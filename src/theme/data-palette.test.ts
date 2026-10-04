import { describe, expect, it } from 'vitest'
import { fromHex } from '../lib/color/oklch'
import { parseColor } from '../lib/color/parse'
import { ANCHORS, compileDataPalette, EVENT_COLORS, groupOf } from './data-palette'
import { bandShift, PUG_CANVAS } from './fit'
import { GROUPS } from './tokens'

const color = (s: string) => parseColor(s) as NonNullable<ReturnType<typeof parseColor>>
const spec = (over: Partial<Parameters<typeof compileDataPalette>[0] & object> = {}) => ({
  groups: {},
  events: {},
  adapt: true,
  ...over,
})

describe('event groups', () => {
  it('puts every named event in exactly one group', () => {
    for (const event of Object.keys(EVENT_COLORS)) expect(GROUPS).toContain(groupOf(event))
  })

  it('files crossovers under failure/success, not their domain', () => {
    expect(groupOf('payment_failed')).toBe('failure')
    expect(groupOf('invoice_paid')).toBe('success')
    expect(groupOf('subscription_started')).toBe('billing')
    expect(groupOf('coupon_applied')).toBe('commerce')
    expect(groupOf('feature_used')).toBe('lifecycle')
  })
})

describe('compileDataPalette', () => {
  it('places the fit exactly on Pug canvases', () => {
    expect(bandShift('light', PUG_CANVAS.light)).toBe(0)
    expect(bandShift('dark', PUG_CANVAS.dark)).toBe(0)
  })

  // Every group, not just a vivid one: the near-grey workspace and files anchors once had their
  // chroma scaled through a floor, so neither promise held for them.
  it.each(GROUPS)('treats %s set to its own anchor as no change', group => {
    const anchor = EVENT_COLORS[ANCHORS[group]]
    const moved = compileDataPalette(
      spec({ groups: { [group]: fromHex(anchor) } }),
      'light',
      'standard',
      PUG_CANVAS.light,
    )
    const base = compileDataPalette(undefined, 'light', 'standard', PUG_CANVAS.light)
    const members = Object.keys(EVENT_COLORS).filter(event => groupOf(event) === group)
    for (const event of members) expect(moved.events[event]).toEqual(base.events[event])
    expect(moved.families).toEqual(base.families)
  })

  it.each(GROUPS)("lands %s's anchor exactly on the theme's value", group => {
    const data = spec({ groups: { [group]: color('#2563eb') }, adapt: false })
    expect(compileDataPalette(data, 'light', 'standard', PUG_CANVAS.light).events[ANCHORS[group]].line).toBe('#2563eb')
  })

  it('moves every member of a group and nothing outside it', () => {
    const data = spec({ groups: { failure: color('#d55e00') }, adapt: false })
    const moved = compileDataPalette(data, 'light', 'standard', PUG_CANVAS.light)
    expect(moved.events.payment_failed.line).toBe('#d55e00')
    expect(moved.events.rage_click.line).not.toBe(EVENT_COLORS.rage_click)
    expect(moved.events.subscription_started.line).toBe(EVENT_COLORS.subscription_started)
  })

  it('lets an event override beat its group', () => {
    const data = spec({
      groups: { failure: color('#d55e00') },
      events: { payment_failed: color('#123456') },
      adapt: false,
    })
    expect(compileDataPalette(data, 'dark', 'standard', PUG_CANVAS.dark).events.payment_failed.line).toBe('#123456')
  })

  it('uses categorical colours exactly as given', () => {
    const data = spec({ categorical: [color('#005181'), color('#9e6c00'), color('#007eb1')] })
    const palette = compileDataPalette(data, 'light', 'standard', PUG_CANVAS.light)
    expect(palette.categorical.map(c => c.line)).toEqual(['#005181', '#9e6c00', '#007eb1'])
  })

  it('re-fits the default breakdown palette to a canvas other than Pug', () => {
    const pug = compileDataPalette(undefined, 'dark', 'standard', PUG_CANVAS.dark)
    const lighter = compileDataPalette(undefined, 'dark', 'standard', color('oklch(0.32 0.01 265)'))
    expect(lighter.categorical[0].line).not.toBe(pug.categorical[0].line)
  })
})
