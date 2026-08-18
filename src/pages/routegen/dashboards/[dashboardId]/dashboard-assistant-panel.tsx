import { Loader2, Sparkles, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import type { TileOp } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AssistantOpSummary } from './use-dashboard-assistant'
import { useDashboardAssistant } from './use-dashboard-assistant'

const OpRow = ({ op, onOpenTile }: { op: AssistantOpSummary; onOpenTile: (tileId: string) => void }) => (
  <div className={`mt-1.5 flex items-center gap-1.5 text-xs ${op.flagged ? 'text-caution' : 'text-muted-foreground'}`}>
    <span aria-hidden>{op.flagged ? '⚠' : '✓'}</span>
    <span>{op.text}</span>
    {op.flagged && op.tileId ? (
      <button
        type="button"
        onClick={() => onOpenTile(op.tileId as string)}
        className="text-link underline-offset-4 hover:underline"
      >
        open tile
      </button>
    ) : null}
  </div>
)

export const DashboardAssistantPanel = ({
  draft,
  onApplyOp,
  onOpenTile,
  onClose,
}: {
  draft: Dashboard
  onApplyOp: (op: TileOp) => string | undefined
  onOpenTile: (tileId: string) => void
  onClose: () => void
}) => {
  const { messages, streamingText, streaming, error, sendMessage } = useDashboardAssistant({ draft, onApplyOp })
  const [input, setInput] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!input.trim() || streaming) return
    const text = input
    setInput('')
    void sendMessage(text)
  }

  return (
    <aside className="sticky top-16 flex max-h-[calc(100svh-5rem)] w-80 shrink-0 flex-col self-start border-border/60 border-l bg-background">
      <div className="flex items-center justify-between gap-2 border-border/60 border-b px-4 py-3">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Sparkles className="size-3.5" />
          Ask AI
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close assistant">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
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
            <p className="mt-1 text-sm">{message.content}</p>
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
          disabled={streaming}
        />
        <Button size="sm" type="submit" disabled={streaming || !input.trim()}>
          Send
        </Button>
      </form>
    </aside>
  )
}
