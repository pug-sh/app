import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTurnstile, type Turnstile } from './turnstile'

describe('loadTurnstile', () => {
  afterEach(() => {
    window.turnstile = undefined
  })

  // Not inserted, so happy-dom never fetches from Cloudflare.
  const captureScripts = () => {
    const scripts: HTMLScriptElement[] = []
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      scripts.push(nodes[0] as HTMLScriptElement)
    })
    return scripts
  }

  it("loads Cloudflare's own copy once, and again after a failed load", async () => {
    const scripts = captureScripts()
    const api: Turnstile = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() }

    const first = loadTurnstile()
    expect(loadTurnstile()).toBe(first)
    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')

    scripts[0].onerror?.(new Event('error'))
    await expect(first).rejects.toThrow('Turnstile could not be loaded')

    const second = loadTurnstile()
    expect(scripts).toHaveLength(2)
    window.turnstile = api
    scripts[1].onload?.(new Event('load'))
    await expect(second).resolves.toBe(api)
  })
})
