import { Check, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toastRPCError } from '@/lib/rpc-error'
import { InlineEditableText } from './editor-shared'
import type { MarkdownTileInput } from './types'

const markdownSchema = z.object({
  displayName: z.string().trim().optional(),
  description: z.string().trim().optional(),
  body: z.string().trim().min(1, 'Markdown body is required'),
})

const getMarkdownInput = ({
  displayName,
  description,
  body,
}: {
  displayName: string
  description: string
  body: string
}): MarkdownTileInput => ({
  displayName: displayName.trim() || 'Text note',
  description: description.trim(),
  body,
})

export const MarkdownTileEditor = ({
  tile,
  saving,
  onDone,
  onSubmit,
}: {
  tile?: DashboardTile
  saving: boolean
  onDone: () => void
  onSubmit: (input: MarkdownTileInput) => Promise<void>
}) => {
  const [displayName, setDisplayName] = useState(tile?.displayName ?? '')
  const [description, setDescription] = useState(tile?.description ?? '')
  const [body, setBody] = useState(tile?.content.case === 'markdown' ? tile.content.value.body : '')
  const handleSave = async () => {
    const parsed = markdownSchema.safeParse({ displayName, description, body })
    if (!parsed.success) {
      toastRPCError(new Error(parsed.error.issues[0]?.message ?? 'Invalid tile'), 'Invalid tile')
      return
    }

    try {
      await onSubmit(
        getMarkdownInput({
          displayName: parsed.data.displayName ?? '',
          description: parsed.data.description ?? '',
          body: parsed.data.body,
        }),
      )
      onDone()
    } catch {
      // onSubmit already reports the failure.
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <InlineEditableText
            value={displayName}
            onChange={setDisplayName}
            placeholder="Untitled note"
            className="min-h-8 text-lg font-semibold outline-hidden"
          />
          <InlineEditableText
            value={description}
            onChange={setDescription}
            placeholder="Add a description"
            multiline
            className="min-h-5 text-sm text-muted-foreground outline-hidden"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon-sm" onClick={handleSave} disabled={saving} aria-label="Save text note">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDone} disabled={saving} aria-label="Close note editor">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write markdown content..."
          className="min-h-48"
        />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Markdown supported</span>
        </div>
      </div>
    </div>
  )
}
