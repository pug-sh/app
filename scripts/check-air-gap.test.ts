// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { airGapProblems } from './check-air-gap'

describe('airGapProblems', () => {
  const bundle = (text: string) => [
    { path: 'assets/a.js', text },
    { path: 'index.html', text: '<head></head>' },
  ]

  it('passes a bundle that only links out', () => {
    expect(airGapProblems(bundle('`https://docs.pug.sh/sdks`'))).toEqual([])
  })

  it.each(['themes.pug.sh', 'favicons.pug.sh'])('names the file holding %s', host => {
    expect(airGapProblems(bundle(`\`https://${host}\``))).toEqual([`assets/a.js holds ${host}`])
  })

  it('names a preconnect left in index.html', () => {
    const files = [{ path: 'index.html', text: '<link rel="preconnect" href="https://pug.sh" />' }]
    expect(airGapProblems(files)).toEqual(['index.html has a preconnect'])
  })
})
