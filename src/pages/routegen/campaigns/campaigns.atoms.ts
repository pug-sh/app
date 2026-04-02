import { tsToDate } from '@/lib/timestamp'
import type { Timestamp } from '@bufbuild/protobuf/wkt'

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

export const formatTime = (ts: Timestamp | undefined) => {
  const d = tsToDate(ts)
  if (!d) return '—'
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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
    const parsed = JSON.parse(new TextDecoder().decode(raw))
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
      image_url: typeof parsed.image_url === 'string' ? parsed.image_url : '',
      deep_link: typeof parsed.deep_link === 'string' ? parsed.deep_link : '',
    }
  } catch (err) {
    console.error('Failed to parse notification data:', err)
    return { title: '', body: '', image_url: '', deep_link: '' }
  }
}

export const encodeNotificationData = (data: NotificationData): Uint8Array => {
  return new TextEncoder().encode(JSON.stringify(data))
}
