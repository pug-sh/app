import { useAtomValue } from 'jotai'
import { Check, Copy, Download, ImageOff, Loader2, Share } from 'lucide-react'
import { type ReactElement, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { resolvedThemeAtom } from '@/data/theme.atoms'
import {
  type CapturedChart,
  captureElementToImage,
  composeShareCard,
  copyImageToClipboard,
  downloadBlob,
  loadBrandLogo,
} from '@/lib/capture-chart'

const BRAND_PREFIX = 'Powered by'
const BRAND_TEXT = 'pug.sh'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Previews a share card of the chart, downloadable as a PNG. `targetRef` must point outside this
// button, or it lands in its own screenshot.
export const ShareChartButton = ({
  targetRef,
  defaultTitle,
  meta,
  fallbackName,
  trigger,
}: {
  targetRef: RefObject<HTMLElement | null>
  defaultTitle: string
  meta: string
  fallbackName: string
  trigger?: ReactElement
}) => {
  const [open, setOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [title, setTitle] = useState('')
  const [showBranding, setShowBranding] = useState(true)
  const [fontFamily, setFontFamily] = useState('sans-serif')
  const [capture, setCapture] = useState<CapturedChart | null>(null)
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [composed, setComposed] = useState<{ key: string; capture: CapturedChart; blob: Blob } | null>(null)
  const [copied, setCopied] = useState(false)

  // The capture reads live computed styles, so the whole card is composed in the
  // theme that was in effect when the popover opened — the mark follows suit.
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  const fieldId = useId()
  const previewUrlRef = useRef<string | null>(null)
  const copyResetRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const sessionRef = useRef(0)

  // Every input the composition is drawn from. `ready` matches it against the composition on hand,
  // so a title edit disables the buttons in the same render — the recompose only starts in an effect.
  const composeKey = JSON.stringify([title, meta, fontFamily, showBranding, Boolean(logo)])

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
        setComposed({ key: composeKey, capture, blob })
        setPreview(URL.createObjectURL(blob))
      })
      .catch(error => {
        if (cancelled) return
        console.error('Failed to compose share card', error)
        setComposed(null)
        setPreview(null)
        toast.error(error instanceof Error ? error.message : 'Could not render share image')
      })
    return () => {
      cancelled = true
    }
  }, [open, capture, composeKey, title, meta, fontFamily, logo, showBranding])

  const handleOpenChange = async (next: boolean) => {
    // A capture in flight when the popover closes still settles. Stamp each open so an abandoned one
    // can't land its result — or its failure's setOpen(false) — on the session that replaced it.
    const session = ++sessionRef.current
    setOpen(next)
    if (!next) {
      setCapture(null)
      setComposed(null)
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

    setTitle(defaultTitle.trim() || 'Chart')
    setFontFamily(window.getComputedStyle(node).fontFamily)
    loadBrandLogo(resolvedTheme).then(loaded => {
      if (sessionRef.current === session) setLogo(loaded)
    })

    setCapturing(true)
    try {
      const captured = await captureElementToImage(node)
      if (sessionRef.current === session) setCapture(captured)
    } catch (error) {
      console.error('Failed to capture chart', error)
      if (sessionRef.current !== session) return
      toast.error(error instanceof Error ? error.message : 'Could not capture chart image')
      setOpen(false)
    } finally {
      if (sessionRef.current === session) setCapturing(false)
    }
  }

  const ready = !capturing && composed?.key === composeKey && composed?.capture === capture

  const filename = () => `${slugify(title) || slugify(fallbackName) || 'chart'}.png`

  const handleDownload = () => {
    if (!ready || !composed) return
    downloadBlob(composed.blob, filename())
    toast.success('Chart image downloaded')
  }

  const handleCopy = async () => {
    if (!ready || !composed) return
    if (!(await copyImageToClipboard(composed.blob))) {
      toast.error('Clipboard not available')
      return
    }
    setCopied(true)
    toast.success('Chart copied to clipboard')
    clearTimeout(copyResetRef.current)
    copyResetRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm">
              <Share className="size-4" />
              Share
            </Button>
          )
        }
      />

      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Share chart</PopoverTitle>
        </PopoverHeader>

        <div className="space-y-1">
          <label htmlFor={`share-title-${fieldId}`} className="text-xs font-medium text-muted-foreground">
            Title
          </label>
          <Input
            id={`share-title-${fieldId}`}
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Chart title"
            className="h-8"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={`share-brand-${fieldId}`}
            checked={showBranding}
            onCheckedChange={value => setShowBranding(value === true)}
          />
          <label htmlFor={`share-brand-${fieldId}`} className="cursor-pointer select-none text-xs font-medium">
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
