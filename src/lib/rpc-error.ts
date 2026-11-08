import { BinaryReader, WireType } from '@bufbuild/protobuf/wire'
import { Code, ConnectError } from '@connectrpc/connect'
import { toast } from 'sonner'

// The reason code in the server's google.rpc.ErrorInfo detail. That proto isn't generated here, so this
// reads field 1, the reason, off the wire.
export const errorReason = (err: unknown) => {
  if (!(err instanceof ConnectError)) return undefined
  for (const detail of err.details) {
    if (!('type' in detail) || detail.type !== 'google.rpc.ErrorInfo') continue
    try {
      const reader = new BinaryReader(detail.value)
      while (reader.pos < reader.len) {
        const [field, wireType] = reader.tag()
        if (field === 1 && wireType === WireType.LengthDelimited) return reader.string()
        reader.skip(wireType, field)
      }
    } catch (decodeError) {
      console.error('Unreadable ErrorInfo detail', decodeError)
    }
  }
  return undefined
}

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
