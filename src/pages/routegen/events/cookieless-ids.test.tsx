import { create } from '@bufbuild/protobuf'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActivityEventSchema } from '@/api/genproto/shared/activity/v1/activity_pb'
import { EventRow } from './index.page'

const SESSION_ID = '0af31c9e-7b2d-4c1a-9f83-1e5d6a0b4c22'

const renderRow = (distinctId: string) =>
  render(
    <table>
      <tbody>
        <EventRow event={create(ActivityEventSchema, { distinctId, sessionId: SESSION_ID, kind: 'page_view' })} />
      </tbody>
    </table>,
  )

const hrefOf = (text: string) => screen.getByText(text).closest('a')?.getAttribute('href')

describe('cookieless ids in the events table', () => {
  it('links both ids for a visitor that resolves to a profile', () => {
    renderRow('user_42')
    expect(hrefOf('user_42')).toBe('/profiles/user_42/events')
    expect(hrefOf('0af31c9e')).toBe(`/profiles/user_42/sessions/${SESSION_ID}`)
  })

  it('links a cookieless visitor to its visitor page', () => {
    renderRow('cookieless-9f21c0de')
    expect(hrefOf('cookieless-9f21c0de')).toBe('/profiles/cookieless-9f21c0de/events')
    expect(screen.getByText('cookieless-9f21c0de').getAttribute('title')).toContain('Cookieless visitor')
  })

  it("links a cookieless visitor's session", () => {
    renderRow('cookieless-9f21c0de')
    expect(hrefOf('0af31c9e')).toBe(`/profiles/cookieless-9f21c0de/sessions/${SESSION_ID}`)
  })
})
