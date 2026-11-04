import { describe, expect, it } from 'vitest'
import { paintingSlot, requiredMode, resolveSlot, writesTo } from './slots'

describe('paintingSlot', () => {
  it.each([
    ['project', false, 'light', 'project'],
    ['override', true, 'dark', 'project'],
    ['personal', true, 'dark', 'dark'],
    ['personal', true, 'light', 'yours'],
    ['personal', false, 'dark', 'yours'],
  ] as const)('follows what’s painting: %s, split %s, %s', (source, split, mode, slot) => {
    expect(paintingSlot(source, split, mode)).toBe(slot)
  })
})

describe('resolveSlot', () => {
  it('takes the chip someone picked over what’s painting', () => {
    expect(resolveSlot({ picked: 'yours', painting: 'project', split: false, hasProject: true })).toBe('yours')
  })

  it('falls back to Your theme from a chip that isn’t there', () => {
    expect(resolveSlot({ picked: null, painting: 'project', split: false, hasProject: false })).toBe('yours')
    expect(resolveSlot({ picked: 'dark', painting: 'yours', split: false, hasProject: true })).toBe('yours')
  })
})

describe('requiredMode', () => {
  it('requires a mode only once the modes are split', () => {
    expect(requiredMode('yours', false)).toBeUndefined()
    expect(requiredMode('yours', true)).toBe('light')
    expect(requiredMode('dark', true)).toBe('dark')
    expect(requiredMode('project', true)).toBeUndefined()
  })
})

describe('writesTo', () => {
  it('writes one theme to both modes until they’re split', () => {
    expect(writesTo('yours', false)).toBe('both')
    expect(writesTo('yours', true)).toBe('light')
    expect(writesTo('dark', true)).toBe('dark')
  })
})
