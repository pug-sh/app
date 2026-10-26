import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VisitorPopover } from './map-popover'
import type { VisitorMapMarker } from './markers'

const marker = (distinctId: string): VisitorMapMarker => ({
  distinctId,
  identity: { label: distinctId, isFallback: true },
  iso: 'IN',
  page: '/pricing',
  kind: 'page_view',
  detail: '/pricing',
  device: '',
  lat: 0,
  lng: 0,
  offsetLat: 0,
  offsetLng: 0,
})

const profileHref = (distinctId: string) => `/p/p1/profiles/${distinctId}`

describe('visitor popover footer', () => {
  it('links a cookieless visitor to its visitor page', () => {
    render(<VisitorPopover marker={marker('cookieless-9f21c0de')} journey={[]} profileHref={profileHref} />)
    const link = screen.getByText('View visitor →').closest('a')
    expect(link?.getAttribute('href')).toBe('/p/p1/profiles/cookieless-9f21c0de')
  })

  it('links anyone else to their profile', () => {
    render(<VisitorPopover marker={marker('user_42')} journey={[]} profileHref={profileHref} />)
    expect(screen.getByText('View profile →').closest('a')?.getAttribute('href')).toBe('/p/p1/profiles/user_42')
  })
})
