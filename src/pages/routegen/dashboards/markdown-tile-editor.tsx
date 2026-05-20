import { Check, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toastRPCError } from '@/lib/rpc-error'
import { InlineEditableText } from './editor-shared'

const markdownSchema = z.object({
  displayName: z.string().trim().optional(),
  description: z.string().trim().optional(),
  body: z.string().trim().min(1, 'Markdown body is required'),
})

export const MarkdownTileEditor = ({
  tile,
  saving,
  onCancel,
  onSubmit,
}: {
  tile?: DashboardTile
  saving: boolean
  onCancel: () => void
  onSubmit: (input: { displayName: string; description: string; body: string }) => Promise<void>
}) => {
  const [displayName, setDisplayName] = useState(tile?.displayName ?? '')
  const [description, setDescription] = useState(tile?.description ?? '')
  const [body, setBody] = useState(tile?.content.case === 'markdown' ? tile.content.value.body : '')

  const handleSubmit = async () => {
    const parsed = markdownSchema.safeParse({ displayName, description, body })
    if (!parsed.success) {
      toastRPCError(new Error(parsed.error.issues[0]?.message ?? 'Invalid tile'), 'Invalid tile')
      return
    }

    await onSubmit({
      displayName: parsed.data.displayName || 'Text note',
      description: parsed.data.description ?? '',
      body: parsed.data.body,
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <InlineEditableText
            value={displayName}
            onChange={setDisplayName}
            placeholder="Untitled note"
            disabled={saving}
            className="min-h-8 text-lg font-semibold outline-hidden"
          />
          <InlineEditableText
            value={description}
            onChange={setDescription}
            placeholder="Add a description"
            disabled={saving}
            multiline
            className="min-h-5 text-sm text-muted-foreground outline-hidden"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            onClick={handleSubmit}
            disabled={saving}
            aria-label={tile ? 'Save text note' : 'Add text note'}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onCancel} disabled={saving} aria-label="Close note editor">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <Textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Write markdown content..."
        disabled={saving}
        className="min-h-48"
      />
    </div>
  )
}
