import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

// A labeled credential rendered as a table row: the monospace value plus copy and (for secrets)
// reveal controls. Designed to sit inside a `<table><tbody>` — the API Keys tables on the overview
// setup screen and in project settings both use it. `masked` keeps all but the first 8 characters
// behind dots until revealed (for secrets like the private API key).
const CopyableCode = ({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) => {
  const { copied, copy } = useCopyToClipboard()
  const [revealed, setRevealed] = useState(!masked)
  const safe = value ?? ''
  const display = revealed ? safe : `${safe.slice(0, 8)}••••••••••••`

  return (
    <tr className="border-b border-border/50">
      <td className="whitespace-nowrap py-2.5 pr-4 align-middle text-xs text-muted-foreground">{label}</td>
      <td className="py-2.5 pr-2 align-middle">
        <code className="break-all font-mono text-xs">{display}</code>
      </td>
      <td className="whitespace-nowrap py-2.5 align-middle">
        <span className="inline-flex gap-0.5">
          {masked && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setRevealed(!revealed)}
              aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
            >
              {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={() => copy(safe)} aria-label={`Copy ${label}`}>
            {copied ? <Check className="h-3 w-3 text-green-600 dark:text-green-400" /> : <Copy className="h-3 w-3" />}
          </Button>
        </span>
      </td>
    </tr>
  )
}

export default CopyableCode
