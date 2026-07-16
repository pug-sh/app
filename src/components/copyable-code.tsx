import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

// A labeled identifier: the monospace value plus a copy control. Used for the overview setup
// screen's public key and the project ID in settings. There is no reveal control because nothing it
// renders is a secret. The fixed label width keeps the values aligned when several are stacked.
const CopyableCode = ({ label, value }: { label: string; value: string }) => {
  const { copied, copy } = useCopyToClipboard()

  return (
    <div className="flex items-center gap-4 border-b border-border/50 py-2.5">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <code className="flex-1 break-all font-mono text-xs">{value}</code>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        onClick={() => copy(value)}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-3 w-3 text-green-600 dark:text-green-400" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  )
}

export default CopyableCode
