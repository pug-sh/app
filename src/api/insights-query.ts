import type { Client } from '@connectrpc/connect'
import { stringifyQueryKey } from '@/hooks/use-debounced-query'
import type { InsightsService, QueryRequest, QueryResponse } from './genproto/shared/insights/v1/insights_pb'

type Shared = { response: Promise<QueryResponse>; controller: AbortController; waiters: number }

const inFlight = new Map<string, Shared>()

const forget = (key: string, entry: Shared) => {
  if (inFlight.get(key) === entry) inFlight.delete(key)
}

// Tiles asking the same question at once share one request, cancelled only when every asker has left.
export const queryInsights = (
  rpc: Client<typeof InsightsService>,
  request: QueryRequest,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
) => {
  if (signal.aborted) return Promise.reject<QueryResponse>(signal.reason)
  const key = stringifyQueryKey({ headers, request })
  let entry = inFlight.get(key)
  if (!entry) {
    const controller = new AbortController()
    const started = { response: rpc.query(request, { headers, signal: controller.signal }), controller, waiters: 0 }
    started.response.then(
      () => forget(key, started),
      () => forget(key, started),
    )
    inFlight.set(key, started)
    entry = started
  }

  const shared = entry
  shared.waiters++
  return new Promise<QueryResponse>((resolve, reject) => {
    const leave = () => {
      shared.waiters--
      if (shared.waiters === 0) {
        shared.controller.abort()
        forget(key, shared)
      }
      reject(signal.reason)
    }
    signal.addEventListener('abort', leave, { once: true })
    shared.response.then(resolve, reject).finally(() => signal.removeEventListener('abort', leave))
  })
}
