import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Turnstile } from './turnstile'

const load = vi.hoisted(() => vi.fn())
vi.mock('./turnstile', () => ({ loadTurnstile: () => load() }))

const { useTurnstile } = await import('./use-turnstile')

type Params = Parameters<Turnstile['render']>[1]

const fakeTurnstile = () => {
  const fake = {
    params: undefined as Params | undefined,
    render: vi.fn((_container: HTMLElement, params: Params) => {
      fake.params = params
      return 'widget-1'
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  return fake
}

const mount = async (siteKey = 'site-key') => {
  const turnstile = fakeTurnstile()
  load.mockResolvedValue(turnstile)
  const hook = renderHook(() => useTurnstile(siteKey))
  let detach: (() => void) | undefined
  await act(async () => {
    detach = hook.result.current.ref(document.createElement('div'))
  })
  return { turnstile, take: () => hook.result.current.take(), detach: () => detach?.() }
}

const settledSoon = async (promise: Promise<unknown>) => {
  let settled = false
  promise.then(() => (settled = true))
  await new Promise(resolve => setTimeout(resolve, 0))
  return settled
}

describe('useTurnstile', () => {
  it('hands each token out once, and asks the widget for the next', async () => {
    const { turnstile, take } = await mount()
    expect(turnstile.params).toMatchObject({ sitekey: 'site-key', appearance: 'interaction-only' })

    turnstile.params?.callback?.('first')
    await expect(take()).resolves.toBe('first')
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1')

    const next = take()
    expect(await settledSoon(next)).toBe(false)
    turnstile.params?.callback?.('second')
    await expect(next).resolves.toBe('second')
  })

  it('never hands out an expired token', async () => {
    const { turnstile, take } = await mount()

    turnstile.params?.callback?.('stale')
    turnstile.params?.['expired-callback']?.()
    const next = take()
    turnstile.params?.callback?.('fresh')

    await expect(next).resolves.toBe('fresh')
  })

  it('gives up when the widget fails, and asks it again on the next try', async () => {
    const { turnstile, take } = await mount()

    const waiting = take()
    turnstile.params?.['error-callback']?.('600010')
    await expect(waiting).resolves.toBeNull()

    const retry = take()
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1')
    turnstile.params?.callback?.('after-retry')
    await expect(retry).resolves.toBe('after-retry')
  })

  it("gives up when Cloudflare's script can't load", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    load.mockRejectedValue(new Error('Turnstile could not be loaded'))
    const hook = renderHook(() => useTurnstile('site-key'))
    await act(async () => {
      hook.result.current.ref(document.createElement('div'))
    })

    await expect(hook.result.current.take()).resolves.toBeNull()
    expect(logged).toHaveBeenCalledWith('Turnstile could not start', expect.any(Error))
  })

  it('loads nothing and sends an empty token without a site key', async () => {
    const hook = renderHook(() => useTurnstile(''))
    hook.result.current.ref(document.createElement('div'))

    await expect(hook.result.current.take()).resolves.toBe('')
    expect(load).not.toHaveBeenCalled()
  })

  it('removes the widget with its element, along with its token', async () => {
    const { turnstile, take, detach } = await mount()

    turnstile.params?.callback?.('orphaned')
    detach()
    turnstile.params?.callback?.('late')

    expect(turnstile.remove).toHaveBeenCalledWith('widget-1')
    expect(await settledSoon(take())).toBe(false)
  })
})
