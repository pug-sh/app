import { describe, expect, it } from 'vitest'

describe('the test environment', () => {
  it('never reaches the network: a test that wants an answer stubs fetch', async () => {
    await expect(fetch('https://themes.pug.sh/list.json')).rejects.toThrow('fetch isn’t stubbed in this test')
  })
})
