import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IssueList, warningSummary } from '@/pages/routegen/settings/theme-issues'
import ThemePreview from '@/pages/routegen/settings/theme-preview'
import { compileOnce } from '@/theme/compile'
import type { ThemeFamily } from '@/theme/format'
import type { RemoteId } from '@/theme/library'
import { type PastedTheme, resolvePastedTheme } from '@/theme/remote'
import { defaultRepository, repositoryLabel } from '@/theme/repository'
import { POLARITIES, type Polarity } from '@/theme/tokens'

export type CheckedFile = { url: RemoteId; pin?: Polarity; family: ThemeFamily }

type Failure = Extract<PastedTheme, { ok: false }>

const FAILURE: Record<Failure['reason'], string> = {
  'not-a-url': 'Enter an https URL.',
  insecure: 'Only https URLs can be used.',
  network: 'Couldn’t reach the host, or it doesn’t let other sites read the file (CORS).',
  timeout: 'Couldn’t load it. The host took too long to answer.',
  status: 'The host didn’t return the file.',
  'too-large': 'Theme files are limited to 64 KB.',
  'not-json': 'That URL doesn’t return a theme file.',
}

// The short form only means something in a repository this build reads.
const placeholder = (repository: string | null) =>
  repository ? `${repositoryLabel(repository)}/name, or a link to a theme file` : 'A link to a theme file'

const failureMessage = (failure: Failure) => {
  if (failure.reason === 'status' && failure.status) return `The host answered ${failure.status}.`
  return FAILURE[failure.reason]
}

const Report = ({
  result,
  disclosure,
  requires,
  onUse,
}: {
  result: PastedTheme
  disclosure: boolean
  requires?: Polarity
  onUse: (file: CheckedFile) => void
}) => {
  if (!result.ok) return <p className="text-xs text-negative">{failureMessage(result)}</p>
  const { check, url, pin } = result
  if (!check.ok) {
    return (
      <div className="space-y-2">
        <p className="text-sm">This file can’t be used.</p>
        <IssueList issues={check.issues} />
      </div>
    )
  }
  const { family, issues } = check
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {POLARITIES.filter(polarity => family.variants[polarity]).map(polarity => (
          <figure key={polarity} className="w-36 space-y-1">
            <span className="block h-20 overflow-hidden rounded-md">
              <ThemePreview compiled={compileOnce({ id: url, builtin: false, family, polarity })} />
            </span>
            <figcaption className="text-xs text-muted-foreground">
              {family.name}, {polarity}
            </figcaption>
          </figure>
        ))}
      </div>
      {issues.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm">{warningSummary(issues)}</p>
          <IssueList issues={issues} />
        </div>
      )}
      {disclosure && (
        <p className="text-xs text-muted-foreground">Members’ browsers will load this file from {new URL(url).host}.</p>
      )}
      {requires && !family.variants[requires] ? (
        <p className="text-xs text-muted-foreground">
          {family.name} has no {requires} variant.
        </p>
      ) : (
        <Button size="sm" variant="outline" onClick={() => onUse({ url, pin, family })}>
          Use this theme
        </Button>
      )}
    </div>
  )
}

// Checks a pasted URL from this browser, the origin members' browsers fetch from too, and reports it.
const ThemeUrlField = ({
  disclosure,
  label = 'Theme URL',
  requires,
  onUse,
}: {
  disclosure: boolean
  label?: string
  requires?: Polarity
  onUse: (file: CheckedFile) => void
}) => {
  const [input, setInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<PastedTheme | null>(null)

  // Check is disabled while one runs, which blocks Enter too, so checks never overlap.
  const check = async () => {
    setChecking(true)
    setResult(await resolvePastedTheme(input))
    setChecking(false)
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={event => {
          event.preventDefault()
          void check()
        }}
      >
        <Input
          aria-label={label}
          placeholder={placeholder(defaultRepository())}
          value={input}
          onChange={event => setInput(event.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" disabled={checking || input.trim() === ''}>
          {checking && <Loader2 className="animate-spin" />}
          Check
        </Button>
      </form>
      {result && (
        <div role="status">
          <Report result={result} disclosure={disclosure} requires={requires} onUse={onUse} />
        </div>
      )}
    </div>
  )
}

export default ThemeUrlField
