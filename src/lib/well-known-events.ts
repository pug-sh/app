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
    if (isNaN(n)) return `${id} @ ${pos}`
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

// Only includes event kinds whose proto schema defines at least one field AND
// has at least one field worth surfacing inline. Kinds with zero-field
// messages, or whose fields are all opaque IDs without semantic punch, are
// omitted and fall through to generic custom-property rendering.
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
    const fieldNames = new Set(schema.fields.map(f => f.name))
    for (const h of headlines) {
      if (!fieldNames.has(h)) console.error(`well-known-events: "${kind}" headline "${h}" not in schema`)
    }
  }
}

/** Split custom properties into well-known schema fields vs extra custom fields. */
export const partitionEventProps = (kind: string, customProperties: JsonObject | undefined) => {
  const cached = fieldCache.get(kind)
  if (!cached) {
    return { schemaProps: [] as [string, string][], extraProps: structToEntries(customProperties) }
  }
  const schemaProps = pickEntries(customProperties, cached.fields)
  const extraProps = structToEntries(customProperties).filter(([k]) => !cached.fieldSet.has(k))
  return { schemaProps, extraProps }
}

/**
 * Resolve inline display props for an event row.
 * Returns a formatted headline (or null), raw headline pairs (for tooltips),
 * and remaining non-headline properties capped for inline display.
 */
export const resolveInlineProps = (kind: string, customProperties: JsonObject | undefined) => {
  const entry = WELL_KNOWN[kind]
  const cached = fieldCache.get(kind)
  const headlineFields = entry?.headlines ?? []

  // Always resolve raw headline pairs (used for tooltips); formatted headline takes display priority
  const headlinePairs = pickEntries(customProperties, headlineFields)
  const headline = entry?.format?.(customProperties) ?? null

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
