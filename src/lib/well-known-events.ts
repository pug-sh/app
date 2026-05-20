import type { DescMessage, JsonObject } from '@bufbuild/protobuf'
import {
  PaymentFailedPropertiesSchema,
  PaymentSucceededPropertiesSchema,
  SubscriptionStartedPropertiesSchema,
} from '@/api/genproto/common/events/v1/billing_events_pb'
import {
  AddToCartPropertiesSchema,
  CheckoutStartedPropertiesSchema,
  CheckoutStepCompletedPropertiesSchema,
  ProductViewedPropertiesSchema,
  PurchasePropertiesSchema,
} from '@/api/genproto/common/events/v1/commerce_events_pb'
import { SearchPropertiesSchema } from '@/api/genproto/common/events/v1/discovery_events_pb'
import { ErrorOccurredPropertiesSchema } from '@/api/genproto/common/events/v1/error_events_pb'
import { FormStartPropertiesSchema, FormSubmitPropertiesSchema } from '@/api/genproto/common/events/v1/form_events_pb'
import {
  AudioPausePropertiesSchema,
  AudioPlayPropertiesSchema,
  VideoPausePropertiesSchema,
  VideoPlayPropertiesSchema,
} from '@/api/genproto/common/events/v1/media_events_pb'
import {
  ClickPropertiesSchema,
  DeadClickPropertiesSchema,
  RageClickPropertiesSchema,
  ScrollPropertiesSchema,
} from '@/api/genproto/common/events/v1/navigation_events_pb'
import {
  NotificationClickedPropertiesSchema,
  NotificationDismissedPropertiesSchema,
  NotificationReceivedPropertiesSchema,
} from '@/api/genproto/common/events/v1/notification_events_pb'
import { resolveKind } from '@/lib/event-aliases'
import { structGet, structToEntries } from '@/lib/struct'

type Formatter = (props: JsonObject | undefined) => string | null

// ── Formatting helpers ───────────────────────────────────────────────────────

const fmtField =
  (key: string): Formatter =>
  p =>
    structGet(p, key) || null

const fmtAmount: Formatter = p => {
  const v = structGet(p, 'amount')
  if (!v) return null
  const c = structGet(p, 'currency')
  return c ? `${c} ${v}` : v
}

const fmtMedia =
  (idKey: string): Formatter =>
  p => {
    const id = structGet(p, idKey)
    if (!id) return null
    // position is a google.protobuf.Duration → wire encoding "1.5s" (per options.proto contract)
    const pos = structGet(p, 'position')
    if (!pos) return id
    const n = Number(pos.replace(/s$/, ''))
    if (isNaN(n)) {
      if (import.meta.env.DEV) console.warn(`fmtMedia: Duration "${pos}" does not match canonical "<n>s" format`)
      return `${id} @ ${pos}`
    }
    return `${id} @ ${Math.floor(n / 60)}:${Math.floor(n % 60)
      .toString()
      .padStart(2, '0')}`
  }

const fmtCampaign: Formatter = p => {
  const cid = structGet(p, 'campaign_id')
  const type = structGet(p, 'notification_type')
  if (!cid && !type) return null
  return [cid, type].filter(Boolean).join(' · ')
}

const pickEntries = (props: JsonObject | undefined, keys: string[]): [string, string][] =>
  keys.flatMap(k => {
    const v = structGet(props, k)
    return v !== undefined && v !== '' ? [[k, v] as [string, string]] : []
  })

// ── Well-known event registry ────────────────────────────────────────────────

// Curated subset of event kinds with custom inline headlines. Other kinds
// fall through to generic custom-property rendering — expand this map as
// new headlines are designed.
const WELL_KNOWN: Record<string, { schema: DescMessage; headlines: string[]; format?: Formatter }> = {
  // navigation / interactions
  click: { schema: ClickPropertiesSchema, headlines: ['text'], format: fmtField('text') },
  rage_click: {
    schema: RageClickPropertiesSchema,
    headlines: ['element', 'click_count'],
    format: p => {
      const el = structGet(p, 'element')
      if (!el) return null
      const count = structGet(p, 'click_count')
      return count ? `${el} ×${count}` : el
    },
  },
  dead_click: { schema: DeadClickPropertiesSchema, headlines: ['element'], format: fmtField('element') },
  scroll: {
    schema: ScrollPropertiesSchema,
    headlines: ['percent'],
    format: p => {
      const v = structGet(p, 'percent')
      return v ? `${v}%` : null
    },
  },

  // discovery
  search: { schema: SearchPropertiesSchema, headlines: ['query'], format: fmtField('query') },

  // commerce
  product_viewed: {
    schema: ProductViewedPropertiesSchema,
    headlines: ['product_name', 'product_id'],
    format: p => structGet(p, 'product_name') || structGet(p, 'product_id') || null,
  },
  add_to_cart: {
    schema: AddToCartPropertiesSchema,
    headlines: ['product_id', 'price'],
    format: p => {
      const pid = structGet(p, 'product_id')
      const price = structGet(p, 'price')
      const currency = structGet(p, 'currency')
      const money = price ? (currency ? `${currency} ${price}` : price) : null
      if (!pid && !money) return null
      return [pid, money].filter(Boolean).join(' · ')
    },
  },
  checkout_started: {
    schema: CheckoutStartedPropertiesSchema,
    headlines: ['amount', 'currency'],
    format: fmtAmount,
  },
  checkout_step_completed: {
    schema: CheckoutStepCompletedPropertiesSchema,
    headlines: ['step'],
    format: fmtField('step'),
  },
  purchase: { schema: PurchasePropertiesSchema, headlines: ['amount', 'currency'], format: fmtAmount },

  // billing
  subscription_started: {
    schema: SubscriptionStartedPropertiesSchema,
    headlines: ['plan_id', 'amount'],
    format: p => {
      const plan = structGet(p, 'plan_id')
      const amt = fmtAmount(p)
      if (!plan && !amt) return null
      return [plan, amt].filter(Boolean).join(' · ')
    },
  },
  payment_succeeded: {
    schema: PaymentSucceededPropertiesSchema,
    headlines: ['amount', 'currency'],
    format: fmtAmount,
  },
  payment_failed: {
    schema: PaymentFailedPropertiesSchema,
    headlines: ['amount', 'reason'],
    format: p => {
      const amt = fmtAmount(p)
      const reason = structGet(p, 'reason')
      if (!amt && !reason) return null
      return [amt, reason].filter(Boolean).join(' — ')
    },
  },

  // forms
  form_start: { schema: FormStartPropertiesSchema, headlines: ['form_name'], format: fmtField('form_name') },
  form_submit: { schema: FormSubmitPropertiesSchema, headlines: ['form_name'], format: fmtField('form_name') },

  // notifications
  notification_received: {
    schema: NotificationReceivedPropertiesSchema,
    headlines: ['notification_type', 'campaign_id'],
    format: p => {
      const type = structGet(p, 'notification_type')
      const cid = structGet(p, 'campaign_id')
      if (!type && !cid) return null
      return [type, cid].filter(Boolean).join(' · ')
    },
  },
  notification_clicked: {
    schema: NotificationClickedPropertiesSchema,
    headlines: ['campaign_id', 'notification_type'],
    format: fmtCampaign,
  },
  notification_dismissed: {
    schema: NotificationDismissedPropertiesSchema,
    headlines: ['campaign_id', 'notification_type'],
    format: fmtCampaign,
  },

  // media
  video_play: { schema: VideoPlayPropertiesSchema, headlines: ['video_id', 'position'], format: fmtMedia('video_id') },
  video_pause: {
    schema: VideoPausePropertiesSchema,
    headlines: ['video_id', 'position'],
    format: fmtMedia('video_id'),
  },
  audio_play: { schema: AudioPlayPropertiesSchema, headlines: ['audio_id', 'position'], format: fmtMedia('audio_id') },
  audio_pause: {
    schema: AudioPausePropertiesSchema,
    headlines: ['audio_id', 'position'],
    format: fmtMedia('audio_id'),
  },

  // errors
  error_occurred: {
    schema: ErrorOccurredPropertiesSchema,
    headlines: ['error_code'],
    format: fmtField('error_code'),
  },
}

// Pre-compute field names and lookup sets per kind — schemas are static
const fieldCache = new Map(
  Object.entries(WELL_KNOWN).map(([kind, { schema, headlines }]) => {
    const fields = schema.fields.map(f => f.name)
    return [kind, { fields, fieldSet: new Set(fields), headlineSet: new Set(headlines) }] as const
  }),
)

if (import.meta.env.DEV) {
  for (const [kind, { schema, headlines }] of Object.entries(WELL_KNOWN)) {
    try {
      const fieldNames = new Set(schema.fields.map(f => f.name))
      for (const h of headlines) {
        if (!fieldNames.has(h)) console.error(`well-known-events: "${kind}" headline "${h}" not in schema`)
      }
    } catch (e) {
      console.error(`well-known-events: failed to validate "${kind}":`, e)
    }
  }
}

/** Split custom properties into well-known schema fields vs extra custom fields. */
export const partitionEventProps = (kind: string, customProperties: JsonObject | undefined) => {
  const cached = fieldCache.get(resolveKind(kind))
  if (!cached) {
    return { schemaProps: [] as [string, string][], extraProps: structToEntries(customProperties) }
  }
  const schemaProps = pickEntries(customProperties, cached.fields)
  const extraProps = structToEntries(customProperties).filter(([k]) => !cached.fieldSet.has(k))
  return { schemaProps, extraProps }
}

// ── Auto-property headlines ──────────────────────────────────────────────────
// Kinds whose inline summary lives in an auto-property ($-prefixed) rather than
// custom props (e.g. page_view's meaning is its $url). Keyed by canonical kind.
const AUTO_HEADLINE: Record<string, string> = { page_view: '$url' }

const fmtUrl = (raw: string) => {
  try {
    const u = new URL(raw)
    return u.pathname + u.search
  } catch {
    return raw
  }
}

/**
 * Resolve inline display props for an event row.
 * Returns a formatted headline (or null), raw headline pairs (for tooltips),
 * and remaining non-headline properties capped for inline display.
 */
export const resolveInlineProps = (
  kind: string,
  customProperties: JsonObject | undefined,
  autoProperties?: JsonObject | undefined,
) => {
  const canonical = resolveKind(kind)
  const entry = WELL_KNOWN[canonical]
  const cached = fieldCache.get(canonical)
  const headlineFields = entry?.headlines ?? []

  // Always resolve raw headline pairs (used for tooltips); formatted headline takes display priority
  let headlinePairs = pickEntries(customProperties, headlineFields)
  let headline = entry?.format?.(customProperties) ?? null

  // Fallback: kinds whose summary lives in an auto-property (e.g. page_view → $url)
  if (!headline && headlinePairs.length === 0) {
    const autoKey = AUTO_HEADLINE[canonical]
    const autoVal = autoKey ? structGet(autoProperties, autoKey) : undefined
    if (autoKey && autoVal) {
      headline = fmtUrl(autoVal)
      headlinePairs = [[autoKey, autoVal] as [string, string]]
    }
  }

  const customEntries = structToEntries(customProperties)
  const hasHeadline = headline || headlinePairs.length > 0

  let remaining: [string, string][]
  if (cached) {
    const wellKnown = pickEntries(
      customProperties,
      cached.fields.filter(k => !cached.headlineSet.has(k)),
    )
    const extras = customEntries.filter(([k]) => !cached.fieldSet.has(k))
    remaining = [...wellKnown, ...extras]
  } else {
    remaining = customEntries
  }

  // Show fewer extra props when a headline already occupies visual space
  return {
    headline,
    headlinePairs,
    props: remaining.slice(0, hasHeadline ? 2 : 3),
  }
}
