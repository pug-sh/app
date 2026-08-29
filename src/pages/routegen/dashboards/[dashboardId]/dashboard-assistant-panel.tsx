import { AlertCircle, Check, Loader2, Sparkles, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AssistantMessage, useDashboardAssistant } from './use-dashboard-assistant'

const OpRow = ({ op, onOpenTile }: { op: AssistantMessage['ops'][number]; onOpenTile: (tileId: string) => void }) => {
  if (op.kind === 'applied') {
    return (
      <div className="mt-1.5 flex items-start gap-1.5 text-muted-foreground text-xs">
        <Check className="mt-0.5 size-3 shrink-0" />
        <span>{op.text}</span>
      </div>
    )
  }
  return (
    <div
      className={`mt-1.5 flex items-start gap-1.5 text-xs ${op.kind === 'flagged' ? 'text-caution' : 'text-negative'}`}
    >
      <AlertCircle className="mt-0.5 size-3 shrink-0" />
      <span>{op.text}</span>
      {op.kind === 'flagged' ? (
        <button
          type="button"
          onClick={() => onOpenTile(op.tileId)}
          className="shrink-0 text-link underline-offset-4 hover:underline"
        >
          open tile
        </button>
      ) : null}
    </div>
  )
}

export const DashboardAssistantPanel = ({
  assistant,
  onOpenTile,
  onClose,
}: {
  assistant: ReturnType<typeof useDashboardAssistant>
  onOpenTile: (tileId: string) => void
  onClose: () => void
}) => {
  const { messages, streamingText, streaming, error, sendMessage, stop } = assistant
  const [input, setInput] = useState('')
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const transcript = transcriptRef.current
    if (transcript) transcript.scrollTop = transcript.scrollHeight
  }, [messages, streamingText])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (streaming || !input.trim()) return
    const text = input
    setInput('')
    void sendMessage(text)
  }

  return (
    <aside
      aria-label="Assistant"
      className="sticky top-16 flex max-h-[calc(100svh-5rem)] w-80 shrink-0 flex-col self-start border-border/60 border-l bg-background"
    >
      <div className="flex items-center justify-between gap-2 border-border/60 border-b px-4 py-3">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Sparkles className="size-3.5" />
          Ask AI
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close assistant">
          <X className="size-4" />
        </Button>
      </div>

      <div ref={transcriptRef} role="log" className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        {messages.length === 0 && !streaming ? (
          <p className="text-muted-foreground text-sm">
            Describe the dashboard you want — e.g. "show weekly active users by country".
          </p>
        ) : null}
        {messages.map(message => (
          <div key={message.id}>
            <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </div>
            {message.content ? <p className="mt-1 text-sm">{message.content}</p> : null}
            {message.ops.map(op => (
              <OpRow key={op.id} op={op} onOpenTile={onOpenTile} />
            ))}
          </div>
        ))}
        {streaming ? (
          <div>
            <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">Assistant</div>
            <p className="mt-1 text-sm">
              {streamingText}
              <Loader2 className="ml-1 inline size-3 animate-spin" />
            </p>
          </div>
        ) : null}
        {error ? <p className="text-negative text-xs">{error}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-border/60 border-t p-3">
        <Input
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder="Ask the assistant…"
          maxLength={10000}
        />
        {streaming ? (
          <Button size="sm" variant="secondary" type="button" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button size="sm" type="submit" disabled={!input.trim()}>
            Send
          </Button>
        )}
      </form>
    </aside>
  )
}
