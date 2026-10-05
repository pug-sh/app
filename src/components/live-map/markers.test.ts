import { describe, expect, it } from 'vitest'
import { entrySignature, type MapEntry } from './markers'

const cluster: MapEntry = {
  type: 'cluster',
  groupKey: 'IN',
  iso: 'IN',
  count: 12,
  topKind: 'page_view',
  kinds: [{ name: 'page_view', count: 12 }],
  lat: 21,
  lng: 78,
}

const visitor: MapEntry = {
  type: 'visitor',
  distinctId: 'd-1',
  identity: { label: 'd-1', isFallback: true },
  iso: 'IN',
  page: '/pricing',
  kind: 'page_view',
  detail: 'Viewed /pricing',
  device: 'Desktop',
  lat: 21,
  lng: 78,
  offsetLat: 0,
  offsetLng: 0,
}

// A marker re-renders only when its signature changes, and its ring and halo take their colour from
// the active theme. Without the theme in the signature, a theme switch leaves every marker on the
// map in the old palette until its data happens to change.
describe('entrySignature', () => {
  it.each([
    ['cluster', cluster],
    ['visitor', visitor],
  ])('changes with the theme for a %s', (_, entry) => {
    expect(entrySignature(entry, null, null, 'rev-a')).not.toBe(entrySignature(entry, null, null, 'rev-b'))
  })

  it('stays put when nothing it draws changed', () => {
    expect(entrySignature(visitor, null, null, 'rev-a')).toBe(entrySignature({ ...visitor }, null, null, 'rev-a'))
  })
})
