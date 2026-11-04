import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { majorLines, resolveTrack, type Track, updateNotice } from '@/theme/repository'

export const segment = (pressed: boolean) =>
  cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    pressed ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
  )

// How a reference follows an official theme: its latest release, a major line, or one release. Follow and
// Only open a single-level menu once there's more than one line or release to choose between.
const ThemeUpdates = ({
  releases,
  track,
  label = 'Updates',
  onChange,
}: {
  releases: string[]
  track: Track
  label?: string
  onChange: (track: Track) => void
}) => {
  const lines = majorLines(releases)
  const now = resolveTrack(releases, track)
  const followed = track.kind === 'major' ? track.major : (lines[0]?.major ?? 1)
  const follow = `Follow ${followed}.x`
  const only = track.kind === 'exact' ? `Only ${track.release}` : 'Only one release'
  const notice = updateNotice(releases, track)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Updates</span>
        <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            aria-pressed={track.kind === 'latest'}
            onClick={() => onChange({ kind: 'latest' })}
            className={segment(track.kind === 'latest')}
          >
            Latest
          </button>
          {lines.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-pressed={track.kind === 'major'}
                    className={segment(track.kind === 'major')}
                  />
                }
              >
                {follow}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={track.kind === 'major' ? String(track.major) : ''}
                  onValueChange={value => onChange({ kind: 'major', major: Number(value) })}
                >
                  {lines.map(line => (
                    <DropdownMenuRadioItem key={line.major} value={String(line.major)} closeOnClick>
                      {line.major}.x, now {line.release}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              aria-pressed={track.kind === 'major'}
              onClick={() => onChange({ kind: 'major', major: followed })}
              className={segment(track.kind === 'major')}
            >
              {follow}
            </button>
          )}
          {releases.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-pressed={track.kind === 'exact'}
                    className={segment(track.kind === 'exact')}
                  />
                }
              >
                {only}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={track.kind === 'exact' ? track.release : ''}
                  onValueChange={value => onChange({ kind: 'exact', release: String(value) })}
                >
                  {releases.map(release => (
                    <DropdownMenuRadioItem key={release} value={release} closeOnClick>
                      {release}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              aria-pressed={track.kind === 'exact'}
              onClick={() => onChange({ kind: 'exact', release: releases[0] })}
              className={segment(track.kind === 'exact')}
            >
              {only}
            </button>
          )}
        </div>
        {now && <span className="text-xs text-muted-foreground">now {now}</span>}
      </div>
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
    </div>
  )
}

export default ThemeUpdates
