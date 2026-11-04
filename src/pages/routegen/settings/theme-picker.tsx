import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { resolvableLibraryAtom } from '@/data/theme.atoms'
import { type GalleryTheme, startingFile } from '@/pages/routegen/settings/gallery-themes'
import ThemeGallery from '@/pages/routegen/settings/theme-gallery'
import type { ThemeActions } from '@/pages/routegen/settings/theme-panel'
import { modeFor, pinOf } from '@/pages/routegen/settings/theme-target'
import { formatReference, parseReference } from '@/theme/reference'

const SET = 'Set as project default'

// Picks a project's default theme, saved from the theme's own button. Every member's browser loads the result, so the
// list is shared: no installed themes, and the URL's host is disclosed. `current` is the reference saved now, and
// `note` is what the saved theme's panel says under its button. A new pick needs no read: it starts on the newest
// major line, the file the catalog carries, and takes that file's one variant if that's all it has.
const ThemePicker = ({
  current,
  saving,
  note,
  onSave,
}: {
  current: string
  saving: boolean
  note?: ReactNode
  onSave: (reference: string) => void
}) => {
  const files = useAtomValue(resolvableLibraryAtom)
  const saved = current ? parseReference(current) : null
  const held = saved && { target: saved.target, family: files.find(entry => entry.id === saved.target)?.family ?? null }

  const actions = (theme: GalleryTheme): ThemeActions => {
    const { family } = theme
    if (!family) return { buttons: [] }
    if (theme.held) return { buttons: [{ id: 'default', label: 'Project default', disabled: true }], note }
    const reference = formatReference({ target: startingFile(theme), pin: pinOf(modeFor(family, null)) })
    return { buttons: [{ id: 'default', label: SET, disabled: saving, onClick: () => onSave(reference) }] }
  }

  return (
    <ThemeGallery
      shared
      held={held}
      fileLabel={SET}
      actions={actions}
      onUseFile={file =>
        onSave(formatReference({ target: file.url, pin: pinOf(modeFor(file.family, file.pin ?? null)) }))
      }
    />
  )
}

export default ThemePicker
