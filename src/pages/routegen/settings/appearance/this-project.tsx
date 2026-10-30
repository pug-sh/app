import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
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
import { activeProjectAtom } from '@/data/workspace.atoms'
import ThemePicker from '@/pages/routegen/settings/theme-picker'
import { describeReference, FetchStatusLine, MODE, statusOf } from '@/pages/routegen/settings/theme-status'

const ThisProject = () => {
  const project = useAtomValue(activeProjectAtom)
  const choice = useAtomValue(themeChoiceAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const override = useAtomValue(activeOverrideAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const setOverride = useSetAtom(setProjectOverrideAtom)
  if (!project) return null

  const apply = (reference: string | null) => {
    if (!setOverride({ projectId: project.id, reference })) toast.error(STORAGE_REFUSED)
  }
  const projectDefault = describeReference(project.defaultTheme, library)
  const defaultStatus = statusOf(project.defaultTheme, statuses)
  const overrideStatus = override === undefined ? undefined : statusOf(override, statuses)

  let summary = 'No project default, using your theme'
  if (choice.source === 'override') {
    const using = override === undefined ? null : describeReference(override, library)
    summary = `Using ${using?.name ?? library.find(entry => entry.id === choice.selection.light)?.name} in this project.`
  } else if (choice.source === 'project' && projectDefault) {
    summary = `Project default: ${projectDefault.name}, ${MODE[choice.pin ?? 'follow']}`
  } else if (projectDefault?.host && defaultStatus?.state !== 'failed') {
    summary = 'Loading this project’s theme…'
  } else if (project.defaultTheme !== '') {
    summary = 'Couldn’t load this project’s theme. Showing your theme instead.'
  }

  return (
    <section>
      <SectionHeader title="This project" description={`${project.displayName}, in this browser`} />
      <p className="text-sm">{summary}</p>
      {overrideStatus && <FetchStatusLine status={overrideStatus} />}
      {override !== undefined && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => apply(null)}>
          {projectDefault ? 'Back to project default' : 'Back to your theme'}
        </Button>
      )}
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Use a different theme here</p>
        <ThemePicker shared={false} followLabel="Follow my mode" saveLabel="Use in this project" onSave={apply} />
      </div>
    </section>
  )
}

export default ThisProject
