import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { toast } from 'sonner'
import { Can } from '@/auth/can'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import {
  activeOverrideAtom,
  fetchStatusAtom,
  resolvableLibraryAtom,
  STORAGE_REFUSED,
  setProjectOverrideAtom,
  themeChoiceAtom,
} from '@/data/theme.atoms'
import { activeProjectAtom, saveProjectThemeAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import { cn } from '@/lib/utils'
import ThemePicker from '@/pages/routegen/settings/theme-picker'
import { describeReference, FetchStatusLine, fileName, statusOf } from '@/pages/routegen/settings/theme-status'
import { ignoredPin, missingMode } from '@/theme/choice'
import { parseReference } from '@/theme/reference'
import DefaultThemeControls from './default-theme-controls'

// Everyone sees the project's default theme; admins (project:update) set it, and every change saves at once.
const DefaultTheme = () => {
  const project = useAtomValue(activeProjectAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const choice = useAtomValue(themeChoiceAtom)
  const override = useAtomValue(activeOverrideAtom)
  const save = useSetAtom(saveProjectThemeAtom)
  const setOverride = useSetAtom(setProjectOverrideAtom)
  const [saving, setSaving] = useState(false)
  const [armed, setArmed] = useState(false)
  if (!project) return null

  const current = project.defaultTheme
  const described = describeReference(current, library)
  const status = statusOf(current, statuses)
  const ignored = ignoredPin(current, library)
  // Members differ in mode, so this says who lands on Pug. A pin that went wrong has its own line.
  const missing = ignored ? null : missingMode(current, library)
  const file = library.find(entry => entry.id === parseReference(current)?.target)
  let summary = 'No default. Members see their own theme.'
  if (described) {
    const where = described.host && described.host !== described.name ? ` (${described.host})` : ''
    summary = `${described.name}${where}, ${described.mode}`
  } else if (current !== '') {
    summary = 'The saved default can’t be used. Members see their own theme.'
  }

  // This browser's own pick for the project paints over the default, so whoever saves one may not see it.
  const showDefault = () => {
    if (!setOverride({ projectId: project.id, reference: null })) toast.error(STORAGE_REFUSED)
  }
  const hidden = choice.source === 'override' && override !== undefined && described && (
    <p className="text-xs text-muted-foreground">
      You picked {describeReference(override, library)?.name ?? 'another theme'} for this project in Appearance, so
      that’s what you see.{' '}
      <button type="button" onClick={showDefault} className="text-link hover:underline underline-offset-4">
        Show the default
      </button>
    </p>
  )

  const run = async (reference: string) => {
    setSaving(true)
    try {
      await save(reference)
    } catch (err) {
      toastRPCError(err, 'Couldn’t save the default theme')
    } finally {
      setSaving(false)
      setArmed(false)
    }
  }

  return (
    <section>
      <SectionHeader title="Default theme" description="What members see in this project unless they pick their own" />
      <p className="text-sm">{summary}</p>
      {status && <FetchStatusLine status={status} />}
      {ignored && (
        <p className="mt-1 text-xs text-caution">
          Pinned to {ignored}, but the file has no {ignored} variant, so it follows each member’s mode.
        </p>
      )}
      {missing && file && (
        <p className="mt-1 text-xs text-caution">
          {fileName(file)} has no {missing} variant, so members in {missing} see Pug.
        </p>
      )}
      {hidden && <div className="mt-1">{hidden}</div>}
      <Can action="update" resource="project">
        <div className="mt-4 space-y-4">
          {described && (
            <DefaultThemeControls current={current} saving={saving} onSave={reference => void run(reference)} />
          )}
          {current !== '' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => (armed ? void run('') : setArmed(true))}
              onBlur={() => setArmed(false)}
              className={cn(armed && 'text-negative')}
            >
              {armed ? 'Clear the default?' : 'Clear default'}
            </Button>
          )}
          <ThemePicker
            current={current}
            saving={saving}
            note={
              <>
                {status && <FetchStatusLine status={status} />}
                {hidden}
              </>
            }
            onSave={reference => void run(reference)}
          />
        </div>
      </Can>
    </section>
  )
}

export default DefaultTheme
