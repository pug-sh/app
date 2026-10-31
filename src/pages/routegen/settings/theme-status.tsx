import type { FetchStatus } from '@/data/theme.atoms'
import { IssueList } from '@/pages/routegen/settings/theme-issues'
import type { LibraryEntry } from '@/theme/library'
import { isUrlTarget, parseReference } from '@/theme/reference'
import { OFFICIAL_REPOSITORY, parseThemeFileUrl, readOfficial } from '@/theme/repository'

export const MODE = { follow: 'follows each member’s mode', light: 'always light', dark: 'always dark' } as const

/** A file by name and release: "Clay 1.0.0". */
export const fileName = ({ name, release }: Pick<LibraryEntry, 'name' | 'release'>) =>
  release ? `${name} ${release}` : name

// A reference in words: its theme's name, the file's host, and its mode. An official theme reads by how it
// follows and what it is now, or by its slug until it loads, and drops the host once it has. Null for none,
// a reference this build can't read, or an id it doesn't have.
export const describeReference = (value: string, library: LibraryEntry[]) => {
  const reference = parseReference(value)
  if (!reference) return null
  const mode = MODE[reference.pin ?? 'follow']
  const entry = library.find(e => e.id === reference.target)
  const official = parseThemeFileUrl(OFFICIAL_REPOSITORY, reference.target)
  if (official && entry?.family) {
    return { name: readOfficial(entry.family.name, official.track, entry.family.release), host: undefined, mode }
  }
  const host = isUrlTarget(reference.target) ? new URL(reference.target).host : undefined
  const name = official ? readOfficial(entry?.name ?? official.slug, official.track) : (entry?.name ?? host)
  if (!name) return null
  return { name, host, mode }
}

// How the last fetch of a reference's file went this session, when it names a file.
export const statusOf = (value: string, statuses: Record<string, FetchStatus>) => {
  const reference = parseReference(value)
  if (!reference || !isUrlTarget(reference.target) || !Object.hasOwn(statuses, reference.target)) return undefined
  return statuses[reference.target]
}

const FAILED: Record<Extract<FetchStatus, { state: 'failed' }>['reason'], string> = {
  network: 'the host couldn’t be reached, or it doesn’t let other sites read the file (CORS)',
  timeout: 'the host took too long to answer',
  status: 'the host didn’t return the file',
  'too-large': 'the file is over 64 KB',
  insecure: 'only https URLs can be used',
  invalid: 'the file has errors',
}

// A file's last check: still running, its warnings, or why it failed, and how to try again if that's offered.
export const FetchStatusLine = ({ status, onRetry }: { status: FetchStatus; onRetry?: () => void }) => {
  if (status.state === 'loading') return <p className="mt-1 text-xs text-muted-foreground">Checking the file…</p>
  if (status.state === 'ok') {
    if (status.warnings === 0) return null
    const count = status.warnings === 1 ? '1 warning' : `${status.warnings} warnings`
    return <p className="mt-1 text-xs text-caution">The file has {count}.</p>
  }
  let reason = FAILED[status.reason]
  if (status.reason === 'status' && status.status) reason = `the host answered ${status.status}`
  return (
    <div className="mt-1 space-y-1">
      <p className="text-xs text-negative">
        Last check failed: {reason}.{' '}
        {onRetry && (
          <button type="button" onClick={onRetry} className="text-link hover:underline underline-offset-4">
            Try again
          </button>
        )}
      </p>
      {status.issues && status.issues.length > 0 && <IssueList issues={status.issues} />}
    </div>
  )
}
