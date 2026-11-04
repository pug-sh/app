import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, Plus } from 'lucide-react'
import { Fragment, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  accessModeAtom,
  removeThemeAtom,
  resolvableLibraryAtom,
  resolvedThemeAtom,
  STORAGE_REFUSED,
} from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import AddTheme from '@/pages/routegen/settings/add-theme'
import {
  canSift,
  type GalleryTheme,
  galleryThemes,
  groupThemes,
  type Held,
  isFlat,
  liveFilters,
  siftThemes,
  sourceLabel,
  type ThemeFilters,
  type ThemeSource,
} from '@/pages/routegen/settings/gallery-themes'
import ThemePanel from '@/pages/routegen/settings/theme-panel'
import ThemeTile from '@/pages/routegen/settings/theme-tile'
import { segment } from '@/pages/routegen/settings/theme-updates'
import type { CheckedFile } from '@/pages/routegen/settings/theme-url-field'
import { defaultRepository } from '@/theme/repository'
import type { Polarity } from '@/theme/tokens'

const ORDERS: [ThemeFilters['order'], string][] = [
  ['grouped', 'Grouped'],
  ['colour', 'By colour'],
  ['az', 'A to Z'],
]

// The one theme list on a page. It draws gallery-themes' model and owns only view state, so nothing here persists and
// looking around writes nothing: `onUse` and `onUseFile` hand a choice to the host, which decides what that means.
const ThemeGallery = ({
  held,
  requires,
  shared = false,
  useLabel,
  heldLabel,
  onUse,
  onUseFile,
}: {
  held: Held | null
  requires?: Polarity
  shared?: boolean
  useLabel: string
  heldLabel?: string
  onUse: (theme: GalleryTheme) => void
  onUseFile: (file: CheckedFile) => void
}) => {
  const library = useAtomValue(resolvableLibraryAtom)
  const catalog = useAtomValue(themeCatalogAtom)
  const mode = useAtomValue(resolvedThemeAtom)
  const access = useAtomValue(accessModeAtom)
  const removeTheme = useSetAtom(removeThemeAtom)
  const columns = useIsMobile() ? 2 : 3
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<ThemeFilters['source']>('all')
  const [order, setOrder] = useState<ThemeFilters['order']>('grouped')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState<ThemeSource[]>([])
  const openTile = useRef<HTMLButtonElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const polarity = requires ?? mode
  const themes = galleryThemes({ held, requires, shared, library, catalog: catalog.themes })
  // Read through liveFilters, never the state: a filter whose control has gone mustn't go on hiding themes.
  const filters = liveFilters(themes, { query, source, order })
  const repository = defaultRepository()
  const sources = [...new Set(themes.map(theme => theme.source))]
  const sourceCount = (name: ThemeSource) => themes.filter(theme => theme.source === name).length
  const sourceText = (name: ThemeFilters['source']) =>
    name === 'all' ? `All sources (${themes.length})` : `${sourceLabel(name)} (${sourceCount(name)})`

  const close = () => {
    setOpenKey(null)
    openTile.current?.focus()
  }

  const remove = (theme: GalleryTheme) => {
    if (!removeTheme(theme.id)) {
      toast.error(STORAGE_REFUSED)
      return
    }
    setOpenKey(null)
    addButton.current?.focus()
  }

  const toggleGroup = (name: ThemeSource) =>
    setExpanded(open => (open.includes(name) ? open.filter(other => other !== name) : [...open, name]))

  // The panel sits straight after its tile, so it's next in tab order. The dense grid lands it under the tile's row at
  // any column count, and the row's later tiles backfill above it.
  const grid = (list: GalleryTheme[], flat: boolean) => (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-3 md:grid-cols-3">
      {list.map(theme => {
        const open = openKey === theme.key
        return (
          <Fragment key={theme.key}>
            <ThemeTile
              ref={open ? openTile : undefined}
              theme={theme}
              polarity={polarity}
              access={access}
              open={open}
              panelId={panelId}
              source={flat ? sourceLabel(theme.source) : undefined}
              onToggle={() => setOpenKey(open ? null : theme.key)}
            />
            {open && (
              <ThemePanel
                theme={theme}
                polarity={polarity}
                access={access}
                id={panelId}
                useLabel={useLabel}
                heldLabel={heldLabel}
                onUse={() => onUse(theme)}
                onRemove={theme.source === 'installed' ? () => remove(theme) : undefined}
                onClose={close}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )

  const groups = () =>
    groupThemes(themes, repository ? [{ address: repository, failed: catalog.status === 'failed' }] : []).map(
      ({ source: name, themes: members, failed }) => {
        const label = sourceLabel(name)
        const open = expanded.includes(name)
        const long = members.length > columns
        return (
          <div key={name} role="group" aria-label={label}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cn(
                  'text-xs font-medium text-muted-foreground',
                  (name === 'builtin' || name === 'installed') && 'uppercase tracking-wider',
                )}
              >
                {label}
              </span>
              <div className="h-px flex-1 bg-border" />
              {long ? (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggleGroup(name)}
                  className="text-xs text-link"
                >
                  {open ? 'Show less' : `Show all ${members.length}`}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{members.length}</span>
              )}
            </div>
            {failed && <p className="mb-2 text-xs text-muted-foreground">Couldn’t reach {label}.</p>}
            {members.length > 0 && grid(long && !open ? members.slice(0, columns) : members, false)}
          </div>
        )
      },
    )

  const flatList = () => {
    const matches = siftThemes(themes, filters, polarity, access)
    if (matches.length === 0) return <p className="text-xs text-muted-foreground">No theme matches that.</p>
    return grid(matches, true)
  }

  return (
    <section>
      <SectionHeader title="Themes" count={themes.length} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canSift(themes) && (
          <>
            <Input
              aria-label="Search themes"
              placeholder={`Search ${themes.length} themes`}
              value={filters.query}
              onChange={event => setQuery(event.target.value)}
              className="w-auto min-w-40 flex-1"
            />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                {sourceText(filters.source)}
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={filters.source}
                  onValueChange={value => setSource(value as ThemeFilters['source'])}
                >
                  <DropdownMenuRadioItem value="all" closeOnClick>
                    {sourceText('all')}
                  </DropdownMenuRadioItem>
                  {sources.map(name => (
                    <DropdownMenuRadioItem key={name} value={name} closeOnClick>
                      {sourceText(name)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <div role="group" aria-label="Order" className="inline-flex rounded-lg border border-border p-0.5">
              {ORDERS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filters.order === value}
                  onClick={() => setOrder(value)}
                  className={segment(filters.order === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        <Button
          ref={addButton}
          variant="outline"
          size="sm"
          aria-expanded={adding}
          onClick={() => setAdding(open => !open)}
        >
          <Plus />
          Add a theme
        </Button>
      </div>
      {adding && <AddTheme shared={shared} requires={requires} onUseFile={onUseFile} />}
      {!repository && <p className="mb-3 text-xs text-muted-foreground">No theme repositories here yet.</p>}
      <div role="group" aria-label="Theme list" className="space-y-4">
        {isFlat(filters) ? flatList() : groups()}
      </div>
    </section>
  )
}

export default ThemeGallery
