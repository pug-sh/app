import { Check, Copy, Globe, Loader2, Share } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'

// View-mode-only sharing control: toggles public access and surfaces the
// copyable public link. `shareId` is empty when the dashboard is private.
export const ShareControl = ({
  shareId,
  sharing,
  onTogglePublic,
}: {
  shareId: string
  sharing: boolean
  onTogglePublic: (next: boolean) => void
}) => {
  const isPublic = shareId !== ''
  const shareUrl = isPublic ? `${window.location.origin}/shared/${shareId}` : ''
  const [copied, setCopied] = useState(false)
  const copyResetRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(copyResetRef.current), [])

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Link copied')
      clearTimeout(copyResetRef.current)
      copyResetRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button size="sm" variant={isPublic ? 'secondary' : 'outline'} />}>
        {isPublic ? <Globe className="size-4 text-primary" /> : <Share className="size-3" />}
        {isPublic ? 'Public' : 'Share'}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Share dashboard</PopoverTitle>
          <PopoverDescription>Make this dashboard viewable by anyone with the link.</PopoverDescription>
        </PopoverHeader>

        <div className="flex items-center justify-between gap-3 py-1">
          <label htmlFor="share-public-toggle" className="flex items-center gap-2 text-sm font-medium">
            Public access
            {sharing ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </label>
          <Switch id="share-public-toggle" checked={isPublic} disabled={sharing} onCheckedChange={onTogglePublic} />
        </div>

        {isPublic ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="h-8 font-mono text-xs" />
              <Button size="icon-sm" variant="outline" onClick={handleCopy} aria-label="Copy link">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Anyone with the link can view this dashboard.</p>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
