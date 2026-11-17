import { useAtomValue, useSetAtom } from 'jotai'
import { ArrowUpRight, Megaphone, Pin } from 'lucide-react'
import { useState } from 'react'
import { trackEvent, trackFeature } from '@/analytics/pug'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { renderMarkdownHTML } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { changelogEntriesAtom, changelogUnreadAtom, markChangelogReadAtom } from './changelog.atoms'
import { type ChangelogEntry, changelogUrl } from './feed'

// A bare feed day is a UTC date: anywhere west of Greenwich would read the day before.
const dayLabel = (day: string) => {
  const date = new Date(day)
  const year = date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : 'numeric'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year, timeZone: 'UTC' })
}

// The ring is the ground's colour, cutting the mark out of the icon it sits on.
const RING = { sidebar: 'ring-sidebar', page: 'ring-background' }

type MarkProps = { className?: string; on?: keyof typeof RING }

const UnreadMark = ({ className, on = 'sidebar' }: MarkProps) => (
  <span aria-hidden className={cn('pointer-events-none relative flex size-2', className)}>
    <span className="absolute inline-flex size-full animate-ping rounded-full bg-link opacity-60 [animation-iteration-count:3] motion-reduce:hidden" />
    <span className={cn('relative inline-flex size-2 rounded-full bg-link ring-2', RING[on])} />
  </span>
)

export const ChangelogUnreadMark = (props: MarkProps) => {
  // Reading the entries loads the feed: on mobile the sidebar's footer sits in a closed, unmounted sheet.
  useAtomValue(changelogEntriesAtom)
  const unread = useAtomValue(changelogUnreadAtom)
  return unread.length > 0 ? <UnreadMark {...props} /> : null
}

// The title's link stretches over the whole row; links in the summary sit above it.
const EntryRow = ({ entry, unread }: { entry: ChangelogEntry; unread: boolean }) => (
  <li className="relative px-3 py-3 transition-colors hover:bg-accent/60">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {unread ? (
        <>
          <span className="size-1.5 shrink-0 rounded-full bg-link" />
          <span className="sr-only">New:</span>
        </>
      ) : null}
      <time dateTime={entry.date} className="shrink-0 tabular-nums">
        {dayLabel(entry.date)}
      </time>
      {entry.tags.length > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">{entry.tags.join(', ')}</span>
        </>
      ) : null}
      {entry.pinned ? <Pin aria-label="Pinned" className="ml-auto size-3 shrink-0" /> : null}
    </div>
    <a
      href={entry.url}
      target="_blank"
      rel="noreferrer"
      onClick={() => trackEvent('changelog_entry_opened', { slug: entry.slug })}
      className="mt-1 block text-sm leading-5 text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
    >
      {entry.title}
    </a>
    {entry.summary ? (
      <div
        className="markdown-body mt-1 text-xs leading-[1.125rem] text-muted-foreground [&_a]:relative [&_a]:z-10 [&_a]:text-link [&_a]:underline-offset-4 [&_a:hover]:underline"
        dangerouslySetInnerHTML={{ __html: renderMarkdownHTML(entry.summary, { newTab: true }) }}
      />
    ) : null}
  </li>
)

export const WhatsNew = ({ className }: { className?: string }) => {
  const entries = useAtomValue(changelogEntriesAtom)
  const unread = useAtomValue(changelogUnreadAtom)
  const markRead = useSetAtom(markChangelogReadAtom)
  // Opening marks everything read, so the list marks what was new when it opened.
  const [unreadAtOpen, setUnreadAtOpen] = useState<string[]>([])

  const changelog = changelogUrl()
  if (!changelog || entries.length === 0) return null

  const onOpenChange = (open: boolean) => {
    if (!open) return
    setUnreadAtOpen(unread.map(entry => entry.slug))
    markRead()
    trackFeature({ featureId: 'changelog.open', featureName: "What's new" })
  }

  const listed = [...entries.filter(entry => entry.pinned), ...entries.filter(entry => !entry.pinned)]
  const label = unread.length > 0 ? `What's new, ${unread.length} unread` : "What's new"

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger
        title={label}
        aria-label={label}
        className={cn(
          'flex h-7 items-center gap-2 rounded-md px-1.5 text-sm text-muted-foreground outline-hidden ring-sidebar-ring transition-colors hover:text-foreground focus-visible:ring-2 data-popup-open:text-foreground',
          className,
        )}
      >
        <span className="relative flex">
          <Megaphone className="size-4" />
          {unread.length > 0 ? <UnreadMark className="absolute -top-1 -right-1" /> : null}
        </span>
        <span className="group-data-[collapsible=icon]:hidden">What's new</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={6} className="w-80 gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What's new</span>
          <a
            href={changelog}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-xs text-link underline-offset-4 hover:underline"
          >
            Full changelog
            <ArrowUpRight className="size-3" />
          </a>
        </div>
        <ul className="max-h-[min(28rem,70svh)] divide-y divide-border/50 overflow-y-auto">
          {listed.map(entry => (
            <EntryRow key={entry.slug} entry={entry} unread={unreadAtOpen.includes(entry.slug)} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
