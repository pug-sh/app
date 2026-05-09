import type { DescMessage, JsonObject } from '@bufbuild/protobuf'
import * as wk from '@/api/genproto/common/v1/well_known_events_pb'
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

const fmtVideo: Formatter = p => {
  const vid = structGet(p, 'video_id')
  if (!vid) return null
  const pos = structGet(p, 'position_s')
  if (!pos) return vid
  const n = Number(pos)
  if (isNaN(n)) return `${vid} @ ${pos}`
  return `${vid} @ ${Math.floor(n / 60)}:${Math.floor(n % 60)
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

// Only includes event kinds whose proto schema defines at least one field.
// Kinds with zero-field messages are omitted and fall through to custom properties.
const WELL_KNOWN: Record<string, { schema: DescMessage; headlines: string[]; format?: Formatter }> = {
  click: { schema: wk.ClickPropertiesSchema, headlines: ['text'], format: fmtField('text') },
  rage_click: {
    schema: wk.RageClickPropertiesSchema,
    headlines: ['element', 'click_count'],
    format: p => {
      const el = structGet(p, 'element')
      if (!el) return null
      const count = structGet(p, 'click_count')
      return count ? `${el} ×${count}` : el
    },
  },
  dead_click: { schema: wk.DeadClickPropertiesSchema, headlines: ['element'], format: fmtField('element') },
  scroll: {
    schema: wk.ScrollPropertiesSchema,
    headlines: ['percent'],
    format: p => {
      const v = structGet(p, 'percent')
      return v ? `${v}%` : null
    },
  },
  search: { schema: wk.SearchPropertiesSchema, headlines: ['query'], format: fmtField('query') },
  add_to_cart: {
    schema: wk.AddToCartPropertiesSchema,
    headlines: ['product_id', 'amount'],
    format: p => {
      const pid = structGet(p, 'product_id')
      const a = fmtAmount(p)
      if (!pid && !a) return null
      return [pid, a].filter(Boolean).join(' · ')
    },
  },
  checkout_started: {
    schema: wk.CheckoutStartedPropertiesSchema,
    headlines: ['amount', 'currency'],
    format: fmtAmount,
  },
  checkout_completed: {
    schema: wk.CheckoutCompletedPropertiesSchema,
    headlines: ['amount', 'currency'],
    format: fmtAmount,
  },
  purchase: { schema: wk.PurchasePropertiesSchema, headlines: ['amount', 'currency'], format: fmtAmount },
  form_start: { schema: wk.FormStartPropertiesSchema, headlines: ['form_name'], format: fmtField('form_name') },
  form_submit: { schema: wk.FormSubmitPropertiesSchema, headlines: ['form_name'], format: fmtField('form_name') },
  notification_received: {
    schema: wk.NotificationReceivedPropertiesSchema,
    headlines: ['notification_type', 'campaign_id'],
    format: p => {
      const type = structGet(p, 'notification_type')
      const cid = structGet(p, 'campaign_id')
      if (!type && !cid) return null
      return [type, cid].filter(Boolean).join(' · ')
    },
  },
  notification_clicked: {
    schema: wk.NotificationClickedPropertiesSchema,
    headlines: ['campaign_id', 'notification_type'],
    format: fmtCampaign,
  },
  notification_dismissed: {
    schema: wk.NotificationDismissedPropertiesSchema,
    headlines: ['campaign_id', 'notification_type'],
    format: fmtCampaign,
  },
  video_play: { schema: wk.VideoPlayPropertiesSchema, headlines: ['video_id', 'position_s'], format: fmtVideo },
  video_pause: { schema: wk.VideoPausePropertiesSchema, headlines: ['video_id', 'position_s'], format: fmtVideo },
  error_occurred: {
    schema: wk.ErrorOccurredPropertiesSchema,
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
