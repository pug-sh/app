import { ConnectError } from '@connectrpc/connect'
import { toast } from 'sonner'

const extractRPCErrorMessage = (err: ConnectError) => {
  const raw = err.rawMessage || err.message

  try {
    const parsed = JSON.parse(raw) as { message?: unknown }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message
    }
  } catch {
    // Fall through to string cleanup.
  }

  return raw.replace(/^\[[^\]]+\]\s*/, '').trim() || err.message
}

export const toastRPCError = (err: unknown, fallback: string) => {
  console.error(fallback + ':', err)
  toast.error(err instanceof ConnectError ? extractRPCErrorMessage(err) : fallback)
}
