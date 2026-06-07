import { describe, expect, it } from 'bun:test'
import { resolveIdentity } from '../src/pages/routegen/profiles/_identity'

const base = { id: 'pid_123', externalId: '', properties: undefined }

describe('resolveIdentity', () => {
  it('resolves the name by key priority, not object order', () => {
    const id = resolveIdentity({ ...base, properties: { display_name: 'Display', name: 'Ada' } })
    expect(id.name).toBe('Ada')
    expect(id.isFallback).toBe(false)
  })

  it('joins first_name + last_name when no single name key is present', () => {
    const id = resolveIdentity({ ...base, properties: { first_name: 'Rachel', last_name: 'Thompson' } })
    expect(id.name).toBe('Rachel Thompson')
    expect(id.isFallback).toBe(false)
  })

  it('uses first_name alone when last_name is absent', () => {
    expect(resolveIdentity({ ...base, properties: { first_name: 'Rachel' } }).name).toBe('Rachel')
  })

  it('prefers a single name key over first_name/last_name', () => {
    const id = resolveIdentity({ ...base, properties: { name: 'Ada', first_name: 'Rachel', last_name: 'Thompson' } })
    expect(id.name).toBe('Ada')
  })

  it('resolves email and avatar independently (incl. profile_image_uri)', () => {
    const id = resolveIdentity({
      ...base,
      properties: { email: 'ada@example.com', profile_image_uri: 'https://img/a.png' },
    })
    expect(id.email).toBe('ada@example.com')
    expect(id.avatarUrl).toBe('https://img/a.png')
  })

  it('resolves $-prefixed system traits', () => {
    const id = resolveIdentity({ ...base, properties: { $name: 'Sys', $email: 's@x.com', $avatar: 'u' } })
    expect(id).toMatchObject({ name: 'Sys', email: 's@x.com', avatarUrl: 'u' })
  })

  it('falls back to externalId then id when no name trait, flagging isFallback', () => {
    expect(resolveIdentity({ id: 'pid_1', externalId: 'ext_9', properties: {} })).toMatchObject({
      name: 'ext_9',
      isFallback: true,
    })
    expect(resolveIdentity({ id: 'pid_1', externalId: '', properties: {} })).toMatchObject({
      name: 'pid_1',
      isFallback: true,
    })
  })

  it('omits email/avatar when their traits are absent', () => {
    const id = resolveIdentity({ ...base, properties: { name: 'Ada' } })
    expect(id.email).toBeUndefined()
    expect(id.avatarUrl).toBeUndefined()
  })

  it('treats empty-string traits as absent', () => {
    const id = resolveIdentity({ ...base, properties: { name: '', email: '' } })
    expect(id.name).toBe('pid_123')
    expect(id.isFallback).toBe(true)
    expect(id.email).toBeUndefined()
  })

  it('uses externalId (then id) as the stable colorSeed regardless of name', () => {
    expect(resolveIdentity({ id: 'pid', externalId: 'ext', properties: { name: 'Ada' } }).colorSeed).toBe('ext')
    expect(resolveIdentity({ id: 'pid', externalId: '', properties: { name: 'Ada' } }).colorSeed).toBe('pid')
  })
})
