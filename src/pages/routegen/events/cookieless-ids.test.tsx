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

describe('cookieless ids in the events table', () => {
  it('links both ids for a visitor that resolves to a profile', () => {
    renderRow('user_42')
    expect(screen.getByText('user_42').tagName).toBe('A')
    expect(screen.getByText('0af31c9e').tagName).toBe('A')
  })

  it('drops the profile link for a cookieless visitor', () => {
    renderRow('cookieless-9f21c0de')
    expect(screen.getByText('cookieless-9f21c0de').tagName).not.toBe('A')
  })

  // The non-obvious half: the session route renders inside ProfileShell, so it dead-ends on the
  // same missing profile the distinct-id link does.
  it('drops the session link too', () => {
    renderRow('cookieless-9f21c0de')
    expect(screen.getByText('0af31c9e').tagName).not.toBe('A')
  })
})
