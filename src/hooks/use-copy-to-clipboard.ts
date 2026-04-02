import { useState } from 'react'
import { toast } from 'sonner'

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select and copy the text manually')
    }
  }
  return { copied, copy }
}
