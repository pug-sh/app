import { Code, ConnectError } from '@connectrpc/connect'
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

// Unknown is how a dropped connection or a client-side proto check arrives, and Internal is the
// server's "internal error": neither says anything the caller's wording doesn't say better.
export const rpcErrorMessage = (err: unknown, fallback: string) => {
  if (!(err instanceof ConnectError) || err.code === Code.Unknown || err.code === Code.Internal) return fallback
  return extractRPCErrorMessage(err)
}

export const toastRPCError = (err: unknown, fallback: string) => {
  console.error(fallback + ':', err)
  toast.error(rpcErrorMessage(err, fallback))
}
