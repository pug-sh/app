import { Code, ConnectError } from '@connectrpc/connect'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TileOp } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { dashboardAssistantRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { rpcErrorMessage } from '@/lib/rpc-error'
import { type AssistantOpSummary, summarizeOp } from '../assistant-ops'

export type AssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  ops: (AssistantOpSummary & { id: string })[]
}

const randomId = () => Math.random().toString(36).slice(2, 10)

// The chat state machine behind the assistant panel. It lives in the editor hook, not the
// panel, so the transcript survives the panel closing. The service keeps the message history
// under conversationId; only the draft round-trips each turn.
export const useDashboardAssistant = ({
  draft,
  onApplyOp,
}: {
  draft: Dashboard | null
  onApplyOp: (op: TileOp) => string | null
}) => {
  const client = useAtomValue(dashboardAssistantRPCAtom)
  const projectHeader = useAtomValue(projectHeaderAtom)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const conversationIdRef = useRef(crypto.randomUUID())
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => abortRef.current?.abort(), [])

  // Drops any in-flight turn and starts a fresh conversation (a new edit session).
  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    conversationIdRef.current = crypto.randomUUID()
    setMessages([])
    setStreamingText('')
    setStreaming(false)
    setError(null)
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !draft || abortRef.current) return
      const controller = new AbortController()
      abortRef.current = controller
      setError(null)
      setStreaming(true)
      setStreamingText('')
      setMessages(current => [...current, { id: randomId(), role: 'user', content: trimmed, ops: [] }])

      const ops: AssistantMessage['ops'] = []
      let assistantText = ''
      try {
        const stream = client.turn(
          { conversationId: conversationIdRef.current, state: { draft }, message: trimmed },
          { headers: projectHeader, signal: controller.signal },
        )
        for await (const resp of stream) {
          if (resp.chunk.case === 'text') {
            assistantText += resp.chunk.value
            setStreamingText(assistantText)
          } else if (resp.chunk.case === 'op') {
            const tileId = onApplyOp(resp.chunk.value)
            ops.push({ id: randomId(), ...summarizeOp(resp.chunk.value, tileId) })
          } else if (resp.chunk.case === 'done') {
            for (const failed of resp.chunk.value.failed) {
              ops.push({
                id: randomId(),
                kind: 'failed',
                text: `Couldn't build "${failed.intent}": ${failed.violations.join('; ')}`,
              })
            }
          }
        }
      } catch (err) {
        if (!(err instanceof ConnectError && err.code === Code.Canceled)) {
          console.error('assistant turn failed:', err)
          setError(rpcErrorMessage(err, err instanceof Error ? err.message : 'Something went wrong'))
        }
      } finally {
        // A reset mid-turn already cleaned up; otherwise keep whatever landed — the ops are in the draft.
        if (abortRef.current === controller) {
          abortRef.current = null
          if (assistantText || ops.length > 0) {
            setMessages(current => [...current, { id: randomId(), role: 'assistant', content: assistantText, ops }])
          }
          setStreaming(false)
          setStreamingText('')
        }
      }
    },
    [client, projectHeader, draft, onApplyOp],
  )

  return { messages, streamingText, streaming, error, sendMessage, stop, reset }
}
