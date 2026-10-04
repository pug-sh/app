import { clamp01, fromHex, type Oklch, toHex } from '../lib/color/oklch'
import { fitFor } from './fit'
import type { DataSpec } from './format'
import { type Contrast, GROUPS, type GroupName, type Polarity } from './tokens'

// Event and breakdown colours. The tables below moved verbatim from lib/event-colors.ts, which is now
// only the lookup over whichever palette the active theme compiled. Source of truth for the kind set:
// proto/common/events/v1/*.proto. Events in the same semantic group share a hue; outcome crossovers
// (failed/refunded → red, paid/converted → green) sit in the failure/success groups so one anchor
// remaps all of them.

export type SeriesColor = {
  line: string
  fill: string
  dot: string
}

/** Build a series color from a 6-char hex: solid line/dot, plus a 10%-alpha fill (`1a` suffix). */
const seriesColor = (hex: string): SeriesColor => ({ line: hex, fill: `${hex}1a`, dot: hex })

export const EVENT_COLORS: Record<string, string> = {
  // navigation + interactions — blue (nav) · cyan (click) · red (degraded)
  page_view: '#2563eb',
  screen_view: '#60a5fa',
  scroll: '#3b82f6',
  click: '#0891b2',
  dead_click: '#f87171',
  rage_click: '#dc2626',

  // app lifecycle — indigo (crashes cross to red)
  app_install: '#4338ca',
  app_open: '#4f46e5',
  app_close: '#818cf8',
  app_update: '#3730a3',
  app_backgrounded: '#6366f1',
  app_foregrounded: '#a5b4fc',
  app_crashed: '#991b1b',
  feature_used: '#78716c',

  // auth — slate
  signup: '#334155',
  signin: '#475569',
  signout: '#64748b',
  email_verified: '#1e293b',
  password_reset_requested: '#0f172a',
  password_reset_completed: '#cbd5e1',
  mfa_enabled: '#0f172a',
  mfa_disabled: '#cbd5e1',

  // commerce — emerald (refunds cross to red, discounts to lime)
  product_viewed: '#34d399',
  product_list_viewed: '#6ee7b7',
  add_to_cart: '#10b981',
  remove_from_cart: '#a7f3d0',
  cart_viewed: '#d1fae5',
  wishlist_added: '#5eead4',
  wishlist_removed: '#99f6e4',
  coupon_applied: '#65a30d',
  coupon_removed: '#a3e635',
  checkout_started: '#059669',
  checkout_step_completed: '#047857',
  purchase: '#065f46',
  order_refunded: '#b91c1c',

  // discovery — violet
  search: '#7c3aed',
  search_result_clicked: '#8b5cf6',
  recommendation_viewed: '#a78bfa',
  recommendation_clicked: '#6d28d9',
  filter_applied: '#5b21b6',
  sort_changed: '#c4b5fd',

  // forms — teal
  form_start: '#0d9488',
  form_submit: '#0f766e',

  // media (video + audio) — amber
  video_started: '#fbbf24',
  video_play: '#d97706',
  video_pause: '#f59e0b',
  video_seeked: '#fcd34d',
  video_completed: '#b45309',
  audio_started: '#fde68a',
  audio_play: '#eab308',
  audio_pause: '#facc15',
  audio_seeked: '#fef08a',
  audio_completed: '#a16207',

  // notifications — pink
  notification_received: '#db2777',
  notification_clicked: '#ec4899',
  notification_dismissed: '#f9a8d4',

  // chat — sky (failures/blocks cross to red)
  chat_created: '#0284c7',
  chat_joined: '#0ea5e9',
  chat_left: '#7dd3fc',
  chat_deleted: '#7f1d1d',
  chat_archived: '#bae6fd',
  chat_unarchived: '#38bdf8',
  chat_member_added: '#0369a1',
  chat_member_removed: '#67e8f9',
  chat_member_role_changed: '#075985',
  chat_message_sent: '#0ea5e9',
  chat_message_received: '#0369a1',
  chat_message_failed: '#b91c1c',
  chat_message_read: '#38bdf8',
  chat_message_deleted: '#ef4444',
  chat_message_edited: '#0c4a6e',
  chat_message_pinned: '#075985',
  chat_message_unpinned: '#a5f3fc',
  chat_typing_started: '#bae6fd',
  chat_typing_stopped: '#e0f2fe',
  chat_attachment_uploaded: '#0284c7',
  chat_attachment_downloaded: '#0369a1',
  chat_call_started: '#0c4a6e',
  chat_call_joined: '#075985',
  chat_call_left: '#0369a1',
  chat_call_screen_shared: '#0284c7',
  chat_call_recording_started: '#0ea5e9',
  chat_member_muted: '#22d3ee',
  chat_user_blocked: '#991b1b',
  chat_reaction_added: '#38bdf8',
  chat_reaction_removed: '#bae6fd',

  // billing — yellow (success crosses to green, failure to red)
  subscription_started: '#ca8a04',
  subscription_changed: '#eab308',
  subscription_canceled: '#7f1d1d',
  subscription_renewed: '#a16207',
  subscription_paused: '#facc15',
  subscription_resumed: '#ca8a04',
  subscription_trial_will_end: '#d97706',
  invoice_paid: '#15803d',
  invoice_failed: '#b91c1c',
  payment_succeeded: '#16a34a',
  payment_failed: '#dc2626',
  payment_method_added: '#ca8a04',
  payment_method_removed: '#854d0e',
  trial_started: '#fde047',
  trial_converted: '#15803d',
  refund_failed: '#7f1d1d',

  // support — rose
  feedback_submitted: '#e11d48',
  nps_submitted: '#be123c',
  survey_started: '#fb7185',
  survey_completed: '#f43f5e',
  support_ticket_created: '#9f1239',
  support_ticket_resolved: '#fda4af',
  support_chat_started: '#e11d48',
  help_article_viewed: '#fda4af',

  // workspace — stone (deletions cross to red)
  workspace_created: '#44403b',
  workspace_joined: '#57534e',
  workspace_deleted: '#7f1d1d',
  workspace_role_changed: '#a8a29e',
  workspace_settings_updated: '#78716c',

  // invitations — lime
  invite_sent: '#84cc16',
  invite_accepted: '#4d7c0f',

  // files / exports — zinc
  file_uploaded: '#52525b',
  file_downloaded: '#71717a',
  export_started: '#3f3f46',
  export_completed: '#27272a',

  // integrations — fuchsia
  integration_connected: '#c026d3',
  integration_disconnected: '#a21caf',

  // API — purple
  api_key_created: '#9333ea',
  api_key_revoked: '#7e22ce',

  // errors — dark red
  error_occurred: '#b91c1c',

  // sharing — orange
  share: '#ea580c',
}

// Breakdown palette (getIndexedColor) and the fallback for unmapped events. A theme replaces it per
// mode with data.categorical, used exactly as given — Pug's preset lists these through its fit.
export const FALLBACK_COLORS = [
  '#3b6cf0',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
  '#dc2626',
  '#0d9488',
  '#475569',
  '#84cc16',
]

// Non-well-known kinds borrow their domain family's hue by name prefix, matched against the
// resolveKind() form. Each palette holds only on-hue shades — outcome crossovers are excluded so a
// benign custom event never inherits "failure red".
const FAMILIES: { group: GroupName; prefixes: string[]; palette: string[] }[] = [
  { group: 'chat', prefixes: ['chat_'], palette: ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#0369a1', '#075985'] },
  {
    group: 'billing',
    prefixes: ['subscription_', 'invoice_', 'payment_', 'trial_', 'refund_', 'billing_'],
    palette: ['#ca8a04', '#eab308', '#a16207', '#facc15', '#d97706', '#fde047'],
  },
  {
    group: 'commerce',
    prefixes: ['product_', 'cart_', 'wishlist_', 'coupon_', 'checkout_', 'order_', 'commerce_'],
    palette: ['#34d399', '#10b981', '#059669', '#047857', '#6ee7b7', '#5eead4'],
  },
  {
    group: 'discovery',
    prefixes: ['search_', 'recommendation_', 'filter_', 'sort_', 'discovery_'],
    palette: ['#7c3aed', '#8b5cf6', '#a78bfa', '#6d28d9', '#5b21b6', '#c4b5fd'],
  },
  {
    group: 'media',
    prefixes: ['video_', 'audio_', 'media_'],
    palette: ['#fbbf24', '#d97706', '#f59e0b', '#eab308', '#b45309', '#fcd34d'],
  },
  { group: 'notifications', prefixes: ['notification_', 'push_'], palette: ['#db2777', '#ec4899', '#f9a8d4'] },
  {
    group: 'lifecycle',
    prefixes: ['app_'],
    palette: ['#4338ca', '#4f46e5', '#3730a3', '#6366f1', '#818cf8', '#a5b4fc'],
  },
  {
    group: 'workspace',
    prefixes: ['workspace_', 'org_', 'team_'],
    palette: ['#44403b', '#57534e', '#78716c', '#a8a29e'],
  },
  {
    group: 'support',
    prefixes: ['support_', 'survey_', 'feedback_', 'nps_', 'help_'],
    palette: ['#e11d48', '#be123c', '#f43f5e', '#fb7185', '#9f1239', '#fda4af'],
  },
  { group: 'forms', prefixes: ['form_'], palette: ['#0d9488', '#0f766e', '#14b8a6', '#2dd4bf'] },
  {
    group: 'files',
    prefixes: ['file_', 'export_', 'upload_', 'download_'],
    palette: ['#52525b', '#71717a', '#3f3f46', '#27272a'],
  },
  {
    group: 'integrations',
    prefixes: ['integration_', 'webhook_'],
    palette: ['#c026d3', '#a21caf', '#d946ef', '#e879f9'],
  },
  { group: 'api', prefixes: ['api_'], palette: ['#9333ea', '#7e22ce', '#a855f7', '#6b21a8'] },
  { group: 'invitations', prefixes: ['invite_', 'invitation_'], palette: ['#84cc16', '#65a30d', '#4d7c0f', '#a3e635'] },
  {
    group: 'navigation',
    prefixes: ['page_', 'screen_', 'nav_'],
    palette: ['#2563eb', '#3b82f6', '#60a5fa', '#0891b2'],
  },
  { group: 'auth', prefixes: ['auth_', 'password_', 'mfa_'], palette: ['#334155', '#475569', '#64748b', '#1e293b'] },
  { group: 'failure', prefixes: ['error_', 'exception_'], palette: ['#b91c1c', '#dc2626', '#991b1b'] },
  { group: 'sharing', prefixes: ['share_'], palette: ['#ea580c', '#f97316', '#c2410c'] },
]

// DiceBear disc colours: one shared lightness, hues spread wide. Never fitted — they carry black line
// art and must stay light.
export const DEFAULT_AVATARS = [
  '#da8282',
  '#d38b59',
  '#b99b46',
  '#86ac62',
  '#51b48d',
  '#2cb2bf',
  '#73a0e2',
  '#a68fdb',
  '#cc83b4',
]

const FAILURE = new Set([
  'dead_click',
  'rage_click',
  'app_crashed',
  'order_refunded',
  'chat_deleted',
  'chat_message_failed',
  'chat_message_deleted',
  'chat_user_blocked',
  'subscription_canceled',
  'invoice_failed',
  'payment_failed',
  'refund_failed',
  'workspace_deleted',
  'error_occurred',
])
const SUCCESS = new Set(['invoice_paid', 'payment_succeeded', 'trial_converted'])

/** The colour group a named event belongs to. Crossovers first, then by domain. */
export const groupOf = (event: string): GroupName => {
  if (FAILURE.has(event)) return 'failure'
  if (SUCCESS.has(event)) return 'success'
  if (['page_view', 'screen_view', 'scroll'].includes(event)) return 'navigation'
  if (event === 'click') return 'interaction'
  if (event.startsWith('app_') || event === 'feature_used') return 'lifecycle'
  if (['signup', 'signin', 'signout', 'email_verified'].includes(event) || /^(password_reset|mfa)_/.test(event)) {
    return 'auth'
  }
  if (
    /^(product|wishlist|coupon|checkout)_/.test(event) ||
    ['add_to_cart', 'remove_from_cart', 'cart_viewed', 'purchase'].includes(event)
  ) {
    return 'commerce'
  }
  if (
    ['search', 'search_result_clicked', 'filter_applied', 'sort_changed'].includes(event) ||
    event.startsWith('recommendation_')
  ) {
    return 'discovery'
  }
  if (event === 'form_start' || event === 'form_submit') return 'forms'
  if (/^(video|audio)_/.test(event)) return 'media'
  if (event.startsWith('notification_')) return 'notifications'
  if (event.startsWith('chat_')) return 'chat'
  if (event.startsWith('subscription_') || event.startsWith('payment_method_') || event === 'trial_started')
    return 'billing'
  if (
    ['feedback_submitted', 'nps_submitted', 'help_article_viewed'].includes(event) ||
    /^(survey|support)_/.test(event)
  ) {
    return 'support'
  }
  if (event.startsWith('workspace_')) return 'workspace'
  if (event.startsWith('invite_')) return 'invitations'
  if (/^(file|export)_/.test(event)) return 'files'
  if (event.startsWith('integration_')) return 'integrations'
  if (event.startsWith('api_key_')) return 'api'
  if (event === 'share') return 'sharing'
  throw new Error(`data-palette: "${event}" has no colour group — add it to groupOf`)
}

/** Each group's anchor: the member whose default colour a theme's group value replaces exactly. */
export const ANCHORS: Record<GroupName, string> = {
  navigation: 'page_view',
  interaction: 'click',
  lifecycle: 'app_open',
  auth: 'signin',
  commerce: 'add_to_cart',
  discovery: 'search',
  forms: 'form_start',
  media: 'video_play',
  notifications: 'notification_received',
  chat: 'chat_message_sent',
  billing: 'subscription_started',
  support: 'feedback_submitted',
  workspace: 'workspace_created',
  invitations: 'invite_sent',
  files: 'file_uploaded',
  integrations: 'integration_connected',
  api: 'api_key_created',
  sharing: 'share',
  failure: 'payment_failed',
  success: 'payment_succeeded',
}

/**
 * Moves one member of a group by the change from the group's default anchor to the theme's value:
 * hue rotated, lightness shifted, chroma scaled, then fitted into sRGB. The group keeps its shape.
 * Chroma scales by the anchor's own, so the anchor itself lands on the value — near-grey anchors
 * included, which is what workspace and files have.
 */
const moveHex = (memberHex: string, anchorHex: string, target: Oklch) => {
  const member = fromHex(memberHex)
  const anchor = fromHex(anchorHex)
  const k = target.c / Math.max(anchor.c, 1e-6)
  return toHex({
    l: clamp01(member.l + (target.l - anchor.l)),
    c: member.c * k,
    h: member.h + (target.h - anchor.h),
    alpha: 1,
  })
}

export type CompiledDataPalette = {
  events: Record<string, SeriesColor>
  families: { prefixes: string[]; palette: SeriesColor[] }[]
  categorical: SeriesColor[]
  /** 6-digit hex with a leading '#'. */
  avatars: string[]
}

/**
 * Resolves a variant's data colours into the palette getSeriesColor looks up. `canvas` is the resolved
 * background the fit is placed against. A variant without its own categorical colours gets the
 * default breakdown palette through this canvas's fit — on Pug's canvas, exactly Pug's list.
 */
export const compileDataPalette = (
  data: DataSpec | undefined,
  polarity: Polarity,
  contrast: Contrast,
  canvas: Oklch,
): CompiledDataPalette => {
  const adapt = data?.adapt ?? true
  const canvasFit = fitFor(polarity, contrast, canvas)
  const fit = adapt ? canvasFit : (hex: string) => hex
  const groupValue = (group: GroupName) => data?.groups[group]

  // A member of a group the theme doesn't move keeps its exact default hex — never a no-op round trip
  // through OKLCH, which could flip a byte and break Pug's pixel identity.
  const base = (hex: string, group: GroupName) => {
    const target = groupValue(group)
    return target ? moveHex(hex, EVENT_COLORS[ANCHORS[group]], target) : hex
  }

  const events: Record<string, SeriesColor> = {}
  for (const [event, hex] of Object.entries(EVENT_COLORS)) {
    const override = data?.events[event]
    events[event] = seriesColor(fit(override ? toHex(override) : base(hex, groupOf(event))))
  }
  for (const [event, color] of Object.entries(data?.events ?? {})) {
    if (!events[event]) events[event] = seriesColor(fit(toHex(color)))
  }

  const families = FAMILIES.map(f => ({
    prefixes: f.prefixes,
    palette: f.palette.map(hex => seriesColor(fit(base(hex, f.group)))),
  }))

  const categorical = data?.categorical ? data.categorical.map(toHex) : FALLBACK_COLORS.map(canvasFit)
  const avatars = data?.avatars ? data.avatars.map(toHex) : DEFAULT_AVATARS
  return { events, families, categorical: categorical.map(seriesColor), avatars }
}

// Every group must have its anchor in the map — a renamed event would otherwise silently stop moving.
for (const group of GROUPS) {
  if (!EVENT_COLORS[ANCHORS[group]]) throw new Error(`data-palette: anchor for ${group} is missing`)
}
