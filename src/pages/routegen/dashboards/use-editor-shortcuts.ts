import { useEffect } from 'react'

// Editor keyboard shortcuts + an unsaved-changes guard, both scoped to edit mode.
// Esc is intentionally non-destructive (deselect only) — exiting edit stays explicit.
export const useEditorShortcuts = ({
  active,
  dirty,
  onSave,
  onDeselect,
  onAdd,
}: {
  active: boolean
  dirty: boolean
  onSave: () => void
  onDeselect: () => void
  onAdd: () => void
}) => {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault() // beat the browser's native "save page" dialog
        if (dirty) onSave()
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
  }, [active, dirty, onSave, onDeselect, onAdd])

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
