import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainFavicon } from './domain-favicon'

describe('DomainFavicon', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('asks the favicon service for a domain', () => {
    const { container } = render(<DomainFavicon domain="news.example.com" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://favicons.pug.sh/news.example.com')
  })

  it('draws the globe and requests nothing in an air-gapped build', () => {
    vi.stubEnv('VITE_PUG_SERVICES_ENABLED', '')
    const { container } = render(<DomainFavicon domain="news.example.com" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg.lucide-globe')).not.toBeNull()
  })
})
