import { useState } from 'react'
import { toast } from 'sonner'
import { trackEvent } from '@/analytics/pug'

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false)
  // `context` is the analytics opt-in: pass a stable label (e.g. 'api_key:public', 'sdk_snippet')
  // and a `copied` event fires with just that label. Omit it and nothing is tracked — so copies of
  // customer data (an event value, a profile id) and of secrets (the once-shown private key) stay
  // silent by default; only the call sites that name themselves are counted.
  //
  // NEVER add `text` (or anything derived from it) to the event. The copied text is frequently a
  // credential — a public/private API key, a snippet with a key baked in — and the label is the
  // entire signal we want. The value must not leave the device.
  const copy = async (text: string, context?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      if (context) trackEvent('copied', { context })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select and copy the text manually')
    }
  }
  return { copied, copy }
}
