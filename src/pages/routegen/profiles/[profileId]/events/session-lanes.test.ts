import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import { ActivityEventSchema } from '@/api/genproto/shared/activity/v1/activity_pb'
import { computeSessionLanes } from './index.page'

const event = (sessionId: string, referrerDomain = '') =>
  create(ActivityEventSchema, { sessionId, autoProperties: { $referrerDomain: referrerDomain } })

describe('session lane referrer', () => {
  // Ordered newest-first, as the feed returns them.
  it("takes each lane's own entry event, not the newest one", () => {
    const lanes = computeSessionLanes([
      event('s1', ''),
      event('s2', ''),
      event('s1', 'google.com'),
      event('s2', 'bing.com'),
    ])
    expect(lanes.map(l => [l.sessionId, l.referrer])).toEqual([
      ['s1', 'google.com'],
      ['s2', 'bing.com'],
    ])
  })
})

describe('session lane labels', () => {
  it('keeps a one-event lane clear of the lane it interleaves', () => {
    const lanes = computeSessionLanes([event('s1'), event('s1'), event('s2'), event('s1'), event('s1'), event('s1')])
    for (const lane of lanes) {
      expect(lane.labelIdx).toBeGreaterThanOrEqual(lane.firstIdx)
      expect(lane.labelIdx).toBeLessThanOrEqual(lane.lastIdx)
    }
    const [a, b] = lanes.map(l => l.labelIdx)
    expect(Math.abs(a - b)).toBeGreaterThan(1)
  })

  // Three events leave nowhere to put two labels a clear row apart.
  it('drops the referrer when a label lands next to another', () => {
    const lanes = computeSessionLanes([event('s1'), event('s2', 'bing.com'), event('s1', 'google.com')])
    expect(lanes.map(l => l.referrer)).toEqual([undefined, undefined])
  })
})
