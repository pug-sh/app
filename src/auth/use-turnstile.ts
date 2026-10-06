import { useAtomValue } from 'jotai'
import { useCallback, useRef } from 'react'
import { resolvedThemeAtom } from '@/data/theme.atoms'
import { loadTurnstile, type Turnstile } from './turnstile'

type State = {
  widget?: { turnstile: Turnstile; id: string }
  token: string
  failed: boolean
  waiting: ((token: string | null) => void)[]
}

export const useTurnstile = (siteKey: string) => {
  const theme = useAtomValue(resolvedThemeAtom)
  const state = useRef<State>({ token: '', failed: false, waiting: [] }).current

  const ref = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container || !siteKey) return
      let live = true
      const fail = () => {
        if (!live) return
        state.token = ''
        state.failed = true
        for (const resolve of state.waiting.splice(0)) resolve(null)
      }
      loadTurnstile()
        .then(turnstile => {
          if (!live) return
          const id = turnstile.render(container, {
            sitekey: siteKey,
            theme,
            size: 'flexible',
            appearance: 'interaction-only',
            callback: token => {
              if (!live) return
              state.failed = false
              const next = state.waiting.shift()
              if (next) next(token)
              else state.token = token
            },
            'expired-callback': () => {
              if (live) state.token = ''
            },
            'error-callback': fail,
            'unsupported-callback': fail,
          })
          if (!id) throw new Error('Turnstile rendered no widget')
          state.widget = { turnstile, id }
        })
        .catch(error => {
          console.error('Turnstile could not start', error)
          fail()
        })
      return () => {
        live = false
        state.widget?.turnstile.remove(state.widget.id)
        state.widget = undefined
        state.token = ''
        state.failed = false
      }
    },
    [siteKey, theme, state],
  )

  const take = async () => {
    if (!siteKey) return ''
    let token: string | null = state.token
    state.token = ''
    if (!token) {
      if (state.failed) {
        if (!state.widget) return null
        // Some errors never retry on their own.
        state.failed = false
        state.widget.turnstile.reset(state.widget.id)
      }
      token = await new Promise<string | null>(resolve => state.waiting.push(resolve))
      if (token === null) return null
    }
    // Single use, whatever the server answers.
    state.widget?.turnstile.reset(state.widget.id)
    return token
  }

  return { ref, take }
}
