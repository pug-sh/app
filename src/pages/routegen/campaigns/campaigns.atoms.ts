import type { Campaign } from '@/api/genproto/shared/campaigns/v1/campaigns_pb'
import { atom } from 'jotai'

export const campaignsAtom = atom<Campaign[]>([])

export const statusVariant = (status: string) => {
  switch (status) {
    case 'COMPLETED':
      return 'default' as const
    case 'IN_PROGRESS':
      return 'secondary' as const
    case 'SCHEDULED':
      return 'outline' as const
    default:
      return 'secondary' as const
  }
}

export const formatTime = (ts: { seconds: bigint } | undefined) => {
  if (!ts) return '—'
  return new Date(Number(ts.seconds) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface NotificationData {
  title: string
  body: string
  image_url: string
  deep_link: string
}

export const parseNotificationData = (raw: Uint8Array | undefined): NotificationData => {
  if (!raw || raw.length === 0) return { title: '', body: '', image_url: '', deep_link: '' }
  try {
    return JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return { title: '', body: '', image_url: '', deep_link: '' }
  }
}

export const encodeNotificationData = (data: NotificationData): Uint8Array => {
  return new TextEncoder().encode(JSON.stringify(data))
}
