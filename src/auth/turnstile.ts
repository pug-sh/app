type RenderParams = {
  sitekey: string
  theme?: 'auto' | 'light' | 'dark'
  size?: 'normal' | 'flexible' | 'compact'
  appearance?: 'always' | 'execute' | 'interaction-only'
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: (code: string) => void
  'unsupported-callback'?: () => void
}

export type Turnstile = {
  render: (container: HTMLElement, params: RenderParams) => string | null | undefined
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

// Cloudflare breaks a proxied or cached copy, so it can't be bundled.
const API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<Turnstile> | undefined

export const loadTurnstile = () => {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = (error: Error) => {
      loading = undefined
      script.remove()
      reject(error)
    }
    script.src = API_URL
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile)
      else fail(new Error('Turnstile loaded without its API'))
    }
    script.onerror = () => fail(new Error('Turnstile could not be loaded'))
    document.head.append(script)
  })
  return loading
}
