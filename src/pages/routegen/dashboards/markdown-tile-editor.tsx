import { Check, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { InlineEditableText } from './editor-shared'
import type { MarkdownTileInput } from './types'

const AUTOSAVE_DELAY_MS = 700

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

const serializeMarkdownInput = (input: MarkdownTileInput) =>
  JSON.stringify({
    displayName: input.displayName,
    description: input.description,
    body: input.body,
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
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const currentInput = useMemo(
    () => getMarkdownInput({ displayName, description, body }),
    [body, description, displayName],
  )
  const currentKey = useMemo(() => serializeMarkdownInput(currentInput), [currentInput])
  const lastSavedKeyRef = useRef(currentKey)

  const saveCurrent = useCallback(async () => {
    if (currentKey === lastSavedKeyRef.current) {
      setSaveState('saved')
      return true
    }

    setSaveState('saving')
    try {
      await onSubmit(currentInput)
      lastSavedKeyRef.current = currentKey
      setSaveState('saved')
      return true
    } catch {
      setSaveState('error')
      return false
    }
  }, [currentInput, currentKey, onSubmit])

  useEffect(() => {
    if (currentKey === lastSavedKeyRef.current) return
    setSaveState('dirty')
    if (saving) return

    const timeout = window.setTimeout(() => {
      void saveCurrent()
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [currentKey, saveCurrent, saving])

  const handleDone = async () => {
    if (await saveCurrent()) onDone()
  }

  const statusLabel =
    saveState === 'saving' || saving
      ? 'Saving...'
      : saveState === 'error'
        ? 'Save failed'
        : saveState === 'dirty'
          ? 'Unsaved changes'
          : 'Saved'

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
          <Button size="icon-sm" onClick={handleDone} aria-label="Done editing note">
            {saveState === 'saving' || saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleDone} aria-label="Close note editor">
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
          {saveState === 'saving' || saving ? <Loader2 className="size-3 animate-spin" /> : null}
          <span>Markdown supported · {statusLabel}</span>
        </div>
      </div>
    </div>
  )
}
