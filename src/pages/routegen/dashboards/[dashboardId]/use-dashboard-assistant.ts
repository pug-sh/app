import { useAtomValue } from 'jotai'
import { useCallback, useRef, useState } from 'react'
import { Message_Role, type TileOp } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { dashboardAssistantRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { summarizeOp } from '../assistant-ops'

export interface AssistantOpSummary {
  id: string
  text: string
  flagged: boolean
  tileId?: string
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ops: AssistantOpSummary[]
}

const randomId = () => Math.random().toString(36).slice(2, 10)

export const useDashboardAssistant = ({
  draft,
  onApplyOp,
}: {
  draft: Dashboard
  onApplyOp: (op: TileOp) => string | undefined
}) => {
  const client = useAtomValue(dashboardAssistantRPCAtom)
  const projectHeader = useAtomValue(projectHeaderAtom)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // History round-trips through the client every turn (the service is
  // stateless) — kept in a ref, not state, since it never drives a render on
  // its own; the messages list already re-renders for the same events.
  const historyRef = useRef<{ role: Message_Role; content: string }[]>([])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return

      setError(null)
      setStreaming(true)
      setStreamingText('')
      setMessages(current => [...current, { id: randomId(), role: 'user', content: trimmed, ops: [] }])

      const ops: AssistantOpSummary[] = []
      let assistantText = ''
      try {
        const stream = client.turn(
          {
            state: { messages: historyRef.current.map(m => ({ role: m.role, content: m.content })), draft },
            message: trimmed,
          },
          { headers: projectHeader },
        )
        for await (const resp of stream) {
          if (resp.chunk.case === 'text') {
            assistantText += resp.chunk.value
            setStreamingText(assistantText)
          } else if (resp.chunk.case === 'op') {
            const tileId = onApplyOp(resp.chunk.value)
            const { text: summaryText, flagged } = summarizeOp(resp.chunk.value)
            ops.push({ id: randomId(), text: summaryText, flagged, tileId })
          } else if (resp.chunk.case === 'done') {
            for (const failed of resp.chunk.value.failed) {
              ops.push({
                id: randomId(),
                text: `Couldn't build "${failed.intent}": ${failed.violations.join('; ')}`,
                flagged: false,
              })
            }
          }
        }
        historyRef.current = [
          ...historyRef.current,
          { role: Message_Role.USER, content: trimmed },
          { role: Message_Role.ASSISTANT, content: assistantText },
        ]
        setMessages(current => [...current, { id: randomId(), role: 'assistant', content: assistantText, ops }])
      } catch (err) {
        // Ops already applied before the failure are not rolled back — each is
        // an independent edit, not part of a transaction (see design doc).
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setStreaming(false)
        setStreamingText('')
      }
    },
    [client, projectHeader, streaming, draft, onApplyOp],
  )

  return { messages, streamingText, streaming, error, sendMessage }
}
