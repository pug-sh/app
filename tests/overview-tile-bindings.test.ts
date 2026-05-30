import assert from 'node:assert/strict'
import test from 'node:test'
import { composeFunnelSteps, pickBindings } from '../src/pages/routegen/overview/tile-bindings.ts'

test('uses purchase as the conversion binding when purchased is absent', () => {
  const bindings = pickBindings([
    { name: 'page_viewed', count: 20n },
    { name: 'signup', count: 5n },
    { name: 'purchase', count: 3n },
  ])

  assert.equal(bindings?.conversionLike, 'purchase')
  assert.deepEqual(bindings ? composeFunnelSteps(bindings) : [], ['page_viewed', 'signup', 'purchase'])
})
