import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { compiledTheme, type GalleryTheme, sourceLabel, tunedIn } from '@/pages/routegen/settings/gallery-themes'
import ThemeDetails from '@/pages/routegen/settings/theme-details'
import { IssueList, warningSummary } from '@/pages/routegen/settings/theme-issues'
import ThemeLargePreview from '@/pages/routegen/settings/theme-large-preview'
import ThemePreview from '@/pages/routegen/settings/theme-preview'
import { fileName } from '@/pages/routegen/settings/theme-status'
import { shownPolarity } from '@/pages/routegen/settings/theme-target'
import { ACCESS_MODES, type AccessMode, POLARITIES, type Polarity } from '@/theme/tokens'

const MODE_LABEL = { light: 'Light', dark: 'Dark' } as const

const VERSIONS = [
  { access: ACCESS_MODES[0], label: 'Standard' },
  { access: ACCESS_MODES[1], label: 'High contrast' },
  { access: ACCESS_MODES[2], label: 'Colourblind' },
  { access: ACCESS_MODES[3], label: 'Both' },
]

const sameAccess = (a: AccessMode, b: AccessMode) => a.contrast === b.contrast && a.vision === b.vision

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
      className={cn(armed && 'text-negative')}
    >
      {armed ? 'Remove?' : <Trash2 />}
    </Button>
  )
}

// The close look at one theme, in place under its tile. Looking writes nothing, so it can't cost anyone a saved
// release, mode or choice: flipping a version only changes what's shown here, and it opens on the version the member
// sees. `heldLabel` is what the button reads on a theme the slot already holds. Without one it keeps working, since
// General can choose the saved theme again.
const ThemePanel = ({
  theme,
  polarity,
  access,
  id,
  useLabel,
  heldLabel,
  onUse,
  onRemove,
  onClose,
}: {
  theme: GalleryTheme
  polarity: Polarity
  access: AccessMode
  id: string
  useLabel: string
  heldLabel?: string
  onUse: () => void
  onRemove?: () => void
  onClose: () => void
}) => {
  const [flip, setFlip] = useState<{ polarity: Polarity; access: AccessMode } | null>(null)
  const { family, entry, source, name } = theme
  const issues = entry?.issues ?? []
  const installed = source === 'installed'
  const inUse = theme.held && heldLabel !== undefined
  const shown = family && (flip ?? { polarity: shownPolarity(family, polarity), access })

  return (
    <div
      id={id}
      role="region"
      aria-label={`${name} details`}
      className="col-span-full space-y-3 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-3">
        {family ? (
          <ThemeDetails
            family={family}
            source={sourceLabel(source)}
            name={installed && entry ? fileName(entry) : undefined}
          />
        ) : (
          <p className="text-sm font-medium">{name}</p>
        )}
        <Button variant="ghost" size="xs" onClick={onClose}>
          Close
        </Button>
      </div>
      {family && shown && (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <ThemeLargePreview compiled={compiledTheme({ ...theme, family }, shown.polarity, shown.access)} />
          <div className="grid grid-cols-2 gap-2">
            {POLARITIES.map(mode => (
              <div key={mode} className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{MODE_LABEL[mode]}</p>
                {family.variants[mode] ? (
                  VERSIONS.map(version => {
                    const selected = shown.polarity === mode && sameAccess(shown.access, version.access)
                    const isStandard = version.access === ACCESS_MODES[0]
                    return (
                      <button
                        key={version.label}
                        type="button"
                        aria-pressed={selected}
                        aria-label={isStandard ? `Show ${mode}` : `Show ${mode}, ${version.label.toLowerCase()}`}
                        onClick={() => setFlip({ polarity: mode, access: version.access })}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 rounded-md border p-1 text-left text-xs transition-colors',
                          selected ? 'border-ring ring-1 ring-ring' : 'border-border hover:border-muted-foreground/50',
                        )}
                      >
                        <span className="block h-10 w-14 shrink-0 overflow-hidden rounded-sm">
                          <ThemePreview compiled={compiledTheme({ ...theme, family }, mode, version.access)} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{version.label}</span>
                          {tunedIn(family, mode, version.access) && (
                            <span className="block text-muted-foreground">tuned</span>
                          )}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No {mode} version. Pug shows in {mode}.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {installed && family && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {issues.length === 0 ? 'Checks passed.' : warningSummary(issues)}
          </p>
          {issues.length > 0 && <IssueList issues={issues} />}
        </div>
      )}
      {!family && <IssueList issues={issues} />}
      <div className="flex items-center justify-between gap-2">
        {family && (
          <Button size="sm" disabled={inUse} focusableWhenDisabled onClick={onUse} className="aria-disabled:opacity-50">
            {inUse ? heldLabel : useLabel}
          </Button>
        )}
        {installed && onRemove && (
          <span className="ml-auto">
            <RemoveButton onRemove={onRemove} />
          </span>
        )}
      </div>
    </div>
  )
}

export default ThemePanel
