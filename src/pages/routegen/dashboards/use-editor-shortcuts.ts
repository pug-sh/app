import { useEffect } from 'react'

// Editor keyboard shortcuts + an unsaved-changes guard, both scoped to edit mode.
// Esc is intentionally non-destructive (deselect only) — exiting edit stays explicit.
export const useEditorShortcuts = ({
  active,
  dirty,
  onSave,
  onDeselect,
  onAdd,
  onUndo,
  onRedo,
}: {
  active: boolean
  dirty: boolean
  onSave: () => void
  onDeselect: () => void
  onAdd: () => void
  onUndo: () => void
  onRedo: () => void
}) => {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      // Undo (mod+Z) / redo (mod+Shift+Z, or mod+Y on Windows). While a text field is
      // focused, defer to the browser's native text undo so editing a tile title with
      // Ctrl+Z reverts the typing, not a tile move.
      if (mod && (event.key.toLowerCase() === 'z' || (event.key.toLowerCase() === 'y' && !event.shiftKey))) {
        const target = event.target as HTMLElement | null
        if (target?.closest('input, textarea, [contenteditable="true"]')) return
        event.preventDefault()
        if (event.key.toLowerCase() === 'y' || event.shiftKey) onRedo()
        else onUndo()
        return
      }
      if (mod && event.key.toLowerCase() === 's') {
        if (!dirty) return // nothing to save — leave the browser's default alone
        event.preventDefault() // beat the browser's native "save page" dialog
        onSave()
        return
      }
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onAdd()
        return
      }
      if (event.key === 'Escape') {
        onDeselect()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, dirty, onSave, onDeselect, onAdd, onUndo, onRedo])

  useEffect(() => {
    if (!active || !dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active, dirty])
}
