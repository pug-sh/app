import { useAtomValue, useSetAtom } from 'jotai'
import { Trash2, Upload } from 'lucide-react'
import { Fragment, useRef, useState } from 'react'
import { toast } from 'sonner'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import {
  installedThemesAtom,
  installThemeAtom,
  removeThemeAtom,
  STORAGE_REFUSED,
  themeLibraryAtom,
} from '@/data/theme.atoms'
import { cn } from '@/lib/utils'
import { type Issue, MAX_THEME_BYTES, tooLargeIssue } from '@/theme/format'
import { checkInstall, type InstallCheck, type LibraryEntry } from '@/theme/library'
import { POLARITIES } from '@/theme/tokens'

const REFUSAL = {
  invalid: 'This file can’t be installed.',
  duplicate: 'Already installed.',
  full: 'Remove a theme to install another.',
} as const

type Pending = { text: string; check: InstallCheck }

const HEADER = 'py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider'

const modesOf = (entry: LibraryEntry) =>
  entry.family ? POLARITIES.filter(p => entry.family?.variants[p]).join(' · ') : '—'

// What a theme's checks come to, for its row: null when it passed cleanly.
const checksLabel = (entry: LibraryEntry) => {
  if (!entry.family) return 'Can’t be used'
  const warnings = entry.issues.filter(i => i.severity === 'warning').length
  if (warnings === 0) return null
  return warnings === 1 ? '1 warning' : `${warnings} warnings`
}

// What a file's warnings are about. An ignored key is not a contrast problem — telling someone a
// file with a typo'd key "may be hard to read" installs it as a copy of Pug.
const warningSummary = (issues: Issue[]) => {
  const lines: string[] = []
  if (issues.some(issue => issue.rule !== 'V12')) {
    lines.push('This theme has warnings. It still works, but some colours may be hard to read.')
  }
  if (issues.some(issue => issue.rule === 'V12')) lines.push('Parts of this file were ignored — they’re listed below.')
  return lines.join(' ')
}

const IssueList = ({ issues }: { issues: Issue[] }) => (
  <ul className="space-y-1 text-xs">
    {issues.map((issue, i) => (
      <li key={i} className={issue.severity === 'error' ? 'text-negative' : 'text-caution'}>
        {issue.path && <span className="font-mono">{issue.path}: </span>}
        {issue.message}
      </li>
    ))}
  </ul>
)

// Confirmation by button state, not a dialog: the first click arms it, the second removes.
const RemoveButton = ({ onRemove }: { onRemove: () => void }) => {
  const [armed, setArmed] = useState(false)
  return (
    <Button
      variant="ghost"
      size="xs"
      aria-label={armed ? 'Confirm remove' : 'Remove theme'}
      onClick={() => (armed ? onRemove() : setArmed(true))}
      onBlur={() => setArmed(false)}
      onMouseLeave={() => setArmed(false)}
      className={cn(
        'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        armed && 'text-negative opacity-100',
      )}
    >
      {armed ? 'Remove?' : <Trash2 />}
    </Button>
  )
}

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

const InstalledThemes = () => {
  const installed = useAtomValue(installedThemesAtom)
  const entries = useAtomValue(themeLibraryAtom).filter(entry => !entry.builtin)
  const install = useSetAtom(installThemeAtom)
  const remove = useSetAtom(removeThemeAtom)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  // The row whose issues are open — expanded in place, one at a time.
  const [openId, setOpenId] = useState<string | null>(null)

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
    if (file.size > MAX_THEME_BYTES) {
      setPending({ text: '', check: { ok: false, reason: 'invalid', issues: [tooLargeIssue()] } })
      return
    }
    const text = await file.text()
    const check = checkInstall(text, installed)
    if (check.ok && check.issues.length === 0) commit(text)
    else setPending({ text, check })
  }

  return (
    <section>
      <SectionHeader title="Installed" count={entries.length} description="Theme files you’ve added to this browser." />
      {entries.length > 0 && (
        <table className="mb-4 w-full">
          <thead>
            <tr className="border-b border-border/50">
              <th className={HEADER}>Name</th>
              <th className={HEADER}>Modes</th>
              <th className={HEADER}>Checks</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => {
              const label = checksLabel(entry)
              const open = openId === entry.id
              return (
                <Fragment key={entry.id}>
                  <tr className="group border-b border-border/50 transition-colors hover:bg-muted/40">
                    <td className="py-2 text-sm">
                      {entry.name}
                      {entry.author && <span className="text-muted-foreground"> · {entry.author}</span>}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{modesOf(entry)}</td>
                    <td className="py-2 text-xs">
                      {label === null && <span className="text-muted-foreground">Passed</span>}
                      {label !== null && (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={`theme-issues-${entry.id}`}
                          onClick={() => setOpenId(open ? null : entry.id)}
                          className={cn(
                            'underline-offset-4 hover:underline',
                            entry.family ? 'text-caution' : 'text-negative',
                          )}
                        >
                          {label}
                        </button>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <RemoveButton
                        onRemove={() => {
                          if (!remove(entry.id)) toast.error(STORAGE_REFUSED)
                        }}
                      />
                    </td>
                  </tr>
                  {open && (
                    <tr id={`theme-issues-${entry.id}`} className="border-b border-border/50">
                      <td colSpan={4} className="pt-1 pb-3">
                        <IssueList issues={entry.issues} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
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
        <InstallReport pending={pending} onInstall={() => commit(pending.text)} onDismiss={() => setPending(null)} />
      )}
    </section>
  )
}

export default InstalledThemes
