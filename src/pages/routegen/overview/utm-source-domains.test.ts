import { describe, expect, it } from 'vitest'
import { utmSourceDomain } from './utm-source-domains'

describe('utmSourceDomain', () => {
  it('maps a known token to its domain', () => {
    expect(utmSourceDomain('google')).toBe('google.com')
    expect(utmSourceDomain('reddit')).toBe('reddit.com')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(utmSourceDomain('  Google ')).toBe('google.com')
  })

  it('normalizes separators so spaced/underscored/hyphenated tokens hit one entry', () => {
    expect(utmSourceDomain('product_hunt')).toBe('producthunt.com')
    expect(utmSourceDomain('product-hunt')).toBe('producthunt.com')
    expect(utmSourceDomain('Product Hunt')).toBe('producthunt.com')
  })

  it('resolves aliases to the same domain', () => {
    expect(utmSourceDomain('hn')).toBe('news.ycombinator.com')
    expect(utmSourceDomain('hackernews')).toBe('news.ycombinator.com')
    expect(utmSourceDomain('ycombinator')).toBe('news.ycombinator.com')
  })

  it('passes a token that is already a domain through as-is (lowercased)', () => {
    expect(utmSourceDomain('news.ycombinator.com')).toBe('news.ycombinator.com')
    expect(utmSourceDomain('Example.COM')).toBe('example.com')
  })

  it('returns undefined for unknown tokens and blanks', () => {
    expect(utmSourceDomain('newsletter')).toBeUndefined()
    expect(utmSourceDomain('some-random-partner')).toBeUndefined()
    expect(utmSourceDomain('')).toBeUndefined()
    expect(utmSourceDomain('   ')).toBeUndefined()
  })
})
