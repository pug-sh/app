import { Check, Copy, Download, ImageOff, Loader2, Share } from 'lucide-react'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  type CapturedChart,
  captureElementToImage,
  composeShareCard,
  copyImageToClipboard,
  downloadBlob,
  loadBrandLogo,
} from './capture-tile'

const BRAND_PREFIX = 'Powered by'
const BRAND_TEXT = 'pug.sh'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// View-mode-only hover affordance: snapshots the chart, then opens a popover (not
// a modal) to preview a share card — edit the title and download or copy it as a
// PNG. `targetRef` points at the chart region to capture; the button lives outside
// it so it never lands in its own screenshot. `meta` is the time-range label
// shown in the card's top-right corner.
export const ShareTileButton = ({
  tile,
  targetRef,
  meta,
}: {
  tile: DashboardTile
  targetRef: RefObject<HTMLDivElement | null>
  meta: string
}) => {
  const [open, setOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [title, setTitle] = useState('')
  const [showBranding, setShowBranding] = useState(true)
  const [fontFamily, setFontFamily] = useState('sans-serif')
  const [capture, setCapture] = useState<CapturedChart | null>(null)
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [composedBlob, setComposedBlob] = useState<Blob | null>(null)
  const [copied, setCopied] = useState(false)

  const previewUrlRef = useRef<string | null>(null)
  const copyResetRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const setPreview = (url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setPreviewUrl(url)
  }

  useEffect(
    () => () => {
      setPreview(null)
      clearTimeout(copyResetRef.current)
    },
    [],
  )

  // Recompose the preview whenever the title, capture, or logo changes.
  useEffect(() => {
    if (!open || !capture) return
    let cancelled = false
    composeShareCard({
      card: capture,
      title,
      meta,
      fontFamily,
      brandPrefix: showBranding ? BRAND_PREFIX : '',
      brandText: showBranding ? BRAND_TEXT : '',
      logo: showBranding ? logo : null,
    })
      .then(blob => {
        if (cancelled) return
        setComposedBlob(blob)
        setPreview(URL.createObjectURL(blob))
      })
      .catch(error => {
        if (cancelled) return
        console.error('Failed to compose share card', error)
        toast.error(error instanceof Error ? error.message : 'Could not render share image')
      })
    return () => {
      cancelled = true
    }
  }, [open, capture, title, meta, fontFamily, logo, showBranding])

  const handleOpenChange = async (next: boolean) => {
    setOpen(next)
    if (!next) {
      setCapture(null)
      setComposedBlob(null)
      setPreview(null)
      setCapturing(false)
      setCopied(false)
      return
    }

    const node = targetRef.current
    if (!node) {
      toast.error('Could not capture chart image')
      setOpen(false)
      return
    }

    setTitle(tile.displayName.trim() || 'Chart')
    setFontFamily(window.getComputedStyle(node).fontFamily)
    loadBrandLogo().then(setLogo, () => setLogo(null))

    setCapturing(true)
    try {
      setCapture(await captureElementToImage(node))
    } catch (error) {
      console.error('Failed to capture chart', error)
      toast.error('Could not capture chart image')
      setOpen(false)
    } finally {
      setCapturing(false)
    }
  }

  const filename = () => `${slugify(title) || `chart-${tile.id}`}.png`

  const handleDownload = () => {
    if (!composedBlob) return
    downloadBlob(composedBlob, filename())
    toast.success('Chart image downloaded')
  }

  const handleCopy = async () => {
    if (!composedBlob) return
    if (!(await copyImageToClipboard(composedBlob))) {
      toast.error('Clipboard not available')
      return
    }
    setCopied(true)
    toast.success('Chart copied to clipboard')
    clearTimeout(copyResetRef.current)
    copyResetRef.current = setTimeout(() => setCopied(false), 1500)
  }

  const ready = Boolean(composedBlob) && !capturing

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Share chart"
            title="Share chart"
            data-no-drag="true"
            onMouseDown={event => event.stopPropagation()}
            className={cn(
              'absolute top-4 right-4 z-20 transition-opacity focus-visible:opacity-100 group-hover:opacity-100',
              open ? 'opacity-100' : 'opacity-0',
            )}
          />
        }
      >
        <Share className="size-4" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Share chart</PopoverTitle>
        </PopoverHeader>

        <div className="space-y-1">
          <label htmlFor={`share-title-${tile.id}`} className="text-xs font-medium text-muted-foreground">
            Title
          </label>
          <Input
            id={`share-title-${tile.id}`}
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Chart title"
            className="h-8"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={`share-brand-${tile.id}`}
            checked={showBranding}
            onCheckedChange={value => setShowBranding(value === true)}
          />
          <label htmlFor={`share-brand-${tile.id}`} className="cursor-pointer select-none text-xs font-medium">
            Show pug.sh branding
          </label>
        </div>

        <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30 p-2">
          {capturing ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : previewUrl ? (
            <img src={previewUrl} alt="Share card preview" className="max-h-52 w-full object-contain" />
          ) : (
            <ImageOff className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={!ready} onClick={handleDownload}>
            <Download className="size-4" />
            Download PNG
          </Button>
          <Button size="icon-sm" variant="outline" disabled={!ready} onClick={handleCopy} aria-label="Copy image">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
