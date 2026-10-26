import { create } from '@bufbuild/protobuf'
import type { Client } from '@connectrpc/connect'
import { expect, it, vi } from 'vitest'
import {
  type InsightsService,
  InsightType,
  QueryRequestSchema,
  type QueryResponse,
  QueryResponseSchema,
} from './genproto/shared/insights/v1/insights_pb'
import { queryInsights } from './insights-query'

const headers = { 'x-project-id': 'p1' }

const fakeRpc = () => {
  const sent: AbortSignal[] = []
  let answer = (_response: QueryResponse) => {}
  const query = vi.fn((_request: unknown, options: { signal: AbortSignal }) => {
    sent.push(options.signal)
    return new Promise<QueryResponse>(resolve => {
      answer = resolve
    })
  })
  return {
    rpc: { query } as unknown as Client<typeof InsightsService>,
    query,
    sent,
    answer: (r: QueryResponse) => answer(r),
  }
}

const request = () => create(QueryRequestSchema, { spec: { insightType: InsightType.TRENDS } })

it('sends one request for the same query asked twice at once', async () => {
  const { rpc, query, answer } = fakeRpc()

  const first = queryInsights(rpc, request(), headers, new AbortController().signal)
  const second = queryInsights(rpc, request(), headers, new AbortController().signal)
  const response = create(QueryResponseSchema)
  answer(response)

  expect(query).toHaveBeenCalledTimes(1)
  expect(await first).toBe(response)
  expect(await second).toBe(response)
})

it('cancels a shared request only once every asker has left', async () => {
  const { rpc, query, sent } = fakeRpc()
  const left = new AbortController()
  const stayed = new AbortController()

  const leaving = queryInsights(rpc, request(), headers, left.signal)
  queryInsights(rpc, request(), headers, stayed.signal).catch(() => {})
  left.abort()

  await expect(leaving).rejects.toBeDefined()
  expect(sent[0].aborted).toBe(false)

  stayed.abort()
  expect(sent[0].aborted).toBe(true)

  const next = new AbortController()
  queryInsights(rpc, request(), headers, next.signal).catch(() => {})
  expect(query).toHaveBeenCalledTimes(2)
  next.abort()
})

it('sends nothing for a caller that has already left', async () => {
  const { rpc, query } = fakeRpc()
  const left = new AbortController()
  left.abort()

  const asked = queryInsights(rpc, request(), headers, left.signal)

  expect(query).not.toHaveBeenCalled()
  await expect(asked).rejects.toBe(left.signal.reason)
})
