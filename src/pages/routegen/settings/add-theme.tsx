import { useAtomValue, useSetAtom } from 'jotai'
import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { installedThemesAtom, installThemeAtom, STORAGE_REFUSED } from '@/data/theme.atoms'
import { IssueList, warningSummary } from '@/pages/routegen/settings/theme-issues'
import ThemeUrlField, { type CheckedFile } from '@/pages/routegen/settings/theme-url-field'
import { MAX_THEME_BYTES, tooLargeIssue } from '@/theme/format'
import { checkInstall, type InstallCheck } from '@/theme/library'
import type { Polarity } from '@/theme/tokens'

const REFUSAL = {
  invalid: 'This file can’t be installed.',
  duplicate: 'Already installed.',
  full: 'Remove a theme to install another.',
} as const

type Pending = { text: string; check: InstallCheck }

const InstallReport = ({
  pending,
  onInstall,
  onDismiss,
}: {
  pending: Pending
  onInstall: () => void
  onDismiss: () => void
}) => {
  const { check } = pending
  return (
    <div className="mt-4 space-y-2" role="status">
      <p className="text-sm">{check.ok ? warningSummary(check.issues) : REFUSAL[check.reason]}</p>
      {check.issues.length > 0 && <IssueList issues={check.issues} />}
      <div className="flex gap-2">
        {check.ok && (
          <Button size="sm" onClick={onInstall}>
            Install anyway
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {check.ok ? 'Cancel' : 'Dismiss'}
        </Button>
      </div>
    </div>
  )
}

// One way in for a theme from elsewhere: a link, which applies to the current target, and, unless the list is shared,
// a file, which adds to Installed.
const AddTheme = ({
  shared,
  requires,
  onUseFile,
}: {
  shared: boolean
  requires?: Polarity
  onUseFile: (file: CheckedFile) => void
}) => {
  const installed = useAtomValue(installedThemesAtom)
  const install = useSetAtom(installThemeAtom)
  const fileRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef(0)
  const [pending, setPending] = useState<Pending | null>(null)

  const commit = (text: string) => {
    const result = install(text)
    if (result.ok) {
      toast.success(`Installed ${result.name}`)
      setPending(null)
    } else if (result.reason === 'storage') {
      toast.error(STORAGE_REFUSED)
    } else {
      setPending({ text, check: result })
    }
  }

  const onFile = async (file: File | undefined) => {
    // Cleared so picking the same file again still fires a change.
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    const seq = ++pickRef.current
    if (file.size > MAX_THEME_BYTES) {
      setPending({ text: '', check: { ok: false, reason: 'invalid', issues: [tooLargeIssue()] } })
      return
    }
    const text = await file.text()
    // Reads finish in any order: a large file picked first can land after a small one picked next,
    // and would replace that pick's report, or install itself over it.
    if (seq !== pickRef.current) return
    const check = checkInstall(text, installed)
    if (check.ok && check.issues.length === 0) commit(text)
    else setPending({ text, check })
  }

  return (
    <div className="mb-4 space-y-3">
      <ThemeUrlField disclosure={shared} requires={requires} onUse={onUseFile} />
      {!shared && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            aria-label="Theme file"
            className="hidden"
            onChange={event => onFile(event.target.files?.[0])}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload />
            Install from file…
          </Button>
          {pending && (
            <InstallReport
              pending={pending}
              onInstall={() => commit(pending.text)}
              onDismiss={() => setPending(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default AddTheme
