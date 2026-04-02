import { ConnectError } from '@connectrpc/connect'
import { toast } from 'sonner'

export const toastRPCError = (err: unknown, fallback: string) => {
  console.error(fallback + ':', err)
  toast.error(err instanceof ConnectError ? err.message : fallback)
}
