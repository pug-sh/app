import { resolveKind } from '@/lib/event-aliases'

export type SeriesColor = {
  line: string
  fill: string
  dot: string
}

/** Expects a 6-char hex color (e.g. '#2563eb'). Derives fill by appending alpha. */
const color = (hex: string): SeriesColor => ({
  line: hex,
  fill: hex + '1a',
  dot: hex,
})

// ── Semantic color map ──────────────────────────────────────────────────────
// Source of truth for the kind set: proto/common/events/v1/*.proto.
// Events in the same semantic group share a hue. Some sub-events cross hue
// (e.g., failed/refunded actions use red, paid/converted use green) when
// outcome semantics outweigh family identity.

const EVENT_COLORS: Record<string, SeriesColor> = {
  // navigation + interactions — blue (nav) · cyan (click) · red (degraded)
  page_view: color('#2563eb'),
  screen_view: color('#60a5fa'),
  scroll: color('#3b82f6'),
  click: color('#0891b2'),
  dead_click: color('#f87171'),
  rage_click: color('#dc2626'),

  // app lifecycle — indigo (crashes cross to red)
  app_install: color('#4338ca'),
  app_open: color('#4f46e5'),
  app_close: color('#818cf8'),
  app_update: color('#3730a3'),
  app_backgrounded: color('#6366f1'),
  app_foregrounded: color('#a5b4fc'),
  app_crashed: color('#991b1b'),
  feature_used: color('#78716c'),

  // auth — slate
  signup: color('#334155'),
  signin: color('#475569'),
  signout: color('#64748b'),
  email_verified: color('#1e293b'),
  password_reset_requested: color('#0f172a'),
  password_reset_completed: color('#cbd5e1'),
  mfa_enabled: color('#0f172a'),
  mfa_disabled: color('#cbd5e1'),

  // commerce — emerald (refunds cross to red, discounts to lime)
  product_viewed: color('#34d399'),
  product_list_viewed: color('#6ee7b7'),
  add_to_cart: color('#10b981'),
  remove_from_cart: color('#a7f3d0'),
  cart_viewed: color('#d1fae5'),
  wishlist_added: color('#5eead4'),
  wishlist_removed: color('#99f6e4'),
  coupon_applied: color('#65a30d'),
  coupon_removed: color('#a3e635'),
  checkout_started: color('#059669'),
  checkout_step_completed: color('#047857'),
  purchase: color('#065f46'),
  order_refunded: color('#b91c1c'),

  // discovery — violet
  search: color('#7c3aed'),
  search_result_clicked: color('#8b5cf6'),
  recommendation_viewed: color('#a78bfa'),
  recommendation_clicked: color('#6d28d9'),
  filter_applied: color('#5b21b6'),
  sort_changed: color('#c4b5fd'),

  // forms — teal
  form_start: color('#0d9488'),
  form_submit: color('#0f766e'),

  // media (video + audio) — amber
  video_started: color('#fbbf24'),
  video_play: color('#d97706'),
  video_pause: color('#f59e0b'),
  video_seeked: color('#fcd34d'),
  video_completed: color('#b45309'),
  audio_started: color('#fde68a'),
  audio_play: color('#eab308'),
  audio_pause: color('#facc15'),
  audio_seeked: color('#fef08a'),
  audio_completed: color('#a16207'),

  // notifications — pink
  notification_received: color('#db2777'),
  notification_clicked: color('#ec4899'),
  notification_dismissed: color('#f9a8d4'),

  // chat — sky (failures/blocks cross to red)
  chat_created: color('#0284c7'),
  chat_joined: color('#0ea5e9'),
  chat_left: color('#7dd3fc'),
  chat_deleted: color('#7f1d1d'),
  chat_archived: color('#bae6fd'),
  chat_unarchived: color('#38bdf8'),
  chat_member_added: color('#0369a1'),
  chat_member_removed: color('#67e8f9'),
  chat_member_role_changed: color('#075985'),
  chat_message_sent: color('#0ea5e9'),
  chat_message_received: color('#0369a1'),
  chat_message_failed: color('#b91c1c'),
  chat_message_read: color('#38bdf8'),
  chat_message_deleted: color('#ef4444'),
  chat_message_edited: color('#0c4a6e'),
  chat_message_pinned: color('#075985'),
  chat_message_unpinned: color('#a5f3fc'),
  chat_typing_started: color('#bae6fd'),
  chat_typing_stopped: color('#e0f2fe'),
  chat_attachment_uploaded: color('#0284c7'),
  chat_attachment_downloaded: color('#0369a1'),
  chat_call_started: color('#0c4a6e'),
  chat_call_joined: color('#075985'),
  chat_call_left: color('#0369a1'),
  chat_call_screen_shared: color('#0284c7'),
  chat_call_recording_started: color('#0ea5e9'),
  chat_member_muted: color('#22d3ee'),
  chat_user_blocked: color('#991b1b'),
  chat_reaction_added: color('#38bdf8'),
  chat_reaction_removed: color('#bae6fd'),

  // billing — yellow (success crosses to green, failure to red)
  subscription_started: color('#ca8a04'),
  subscription_changed: color('#eab308'),
  subscription_canceled: color('#7f1d1d'),
  subscription_renewed: color('#a16207'),
  subscription_paused: color('#facc15'),
  subscription_resumed: color('#ca8a04'),
  subscription_trial_will_end: color('#d97706'),
  invoice_paid: color('#15803d'),
  invoice_failed: color('#b91c1c'),
  payment_succeeded: color('#16a34a'),
  payment_failed: color('#dc2626'),
  payment_method_added: color('#ca8a04'),
  payment_method_removed: color('#854d0e'),
  trial_started: color('#fde047'),
  trial_converted: color('#15803d'),
  refund_failed: color('#7f1d1d'),

  // support — rose
  feedback_submitted: color('#e11d48'),
  nps_submitted: color('#be123c'),
  survey_started: color('#fb7185'),
  survey_completed: color('#f43f5e'),
  support_ticket_created: color('#9f1239'),
  support_ticket_resolved: color('#fda4af'),
  support_chat_started: color('#e11d48'),
  help_article_viewed: color('#fda4af'),

  // workspace — stone (deletions cross to red)
  workspace_created: color('#44403b'),
  workspace_joined: color('#57534e'),
  workspace_deleted: color('#7f1d1d'),
  workspace_role_changed: color('#a8a29e'),
  workspace_settings_updated: color('#78716c'),

  // invitations — lime
  invite_sent: color('#84cc16'),
  invite_accepted: color('#4d7c0f'),

  // files / exports — zinc
  file_uploaded: color('#52525b'),
  file_downloaded: color('#71717a'),
  export_started: color('#3f3f46'),
  export_completed: color('#27272a'),

  // integrations — fuchsia
  integration_connected: color('#c026d3'),
  integration_disconnected: color('#a21caf'),

  // API — purple
  api_key_created: color('#9333ea'),
  api_key_revoked: color('#7e22ce'),

  // errors — dark red
  error_occurred: color('#b91c1c'),

  // sharing — orange
  share: color('#ea580c'),
}

// Fallback palette for unmapped events — broad hue range for variety.
// Most colors are shared with the semantic map for palette coherence.
const FALLBACK_COLORS: SeriesColor[] = [
  color('#3b6cf0'),
  color('#059669'),
  color('#d97706'),
  color('#7c3aed'),
  color('#db2777'),
  color('#0891b2'),
  color('#ea580c'),
  color('#4f46e5'),
  color('#dc2626'),
  color('#0d9488'),
  color('#475569'),
  color('#84cc16'),
]

// ── Family inference for custom events ───────────────────────────────────────
// Non-well-known kinds borrow their domain family's hue by name prefix. Each
// palette holds only that family's on-hue shades — outcome crossovers (failure
// red, success green) are intentionally excluded so a benign custom event never
// inherits "failure red". Prefixes are matched against the resolveKind() form.

const FAMILIES: { prefixes: string[]; palette: string[] }[] = [
  { prefixes: ['chat_'], palette: ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#0369a1', '#075985'] }, // sky
  {
    prefixes: ['subscription_', 'invoice_', 'payment_', 'trial_', 'refund_', 'billing_'],
    palette: ['#ca8a04', '#eab308', '#a16207', '#facc15', '#d97706', '#fde047'],
  }, // yellow
  {
    prefixes: ['product_', 'cart_', 'wishlist_', 'coupon_', 'checkout_', 'order_', 'commerce_'],
    palette: ['#34d399', '#10b981', '#059669', '#047857', '#6ee7b7', '#5eead4'],
  }, // emerald
  {
    prefixes: ['search_', 'recommendation_', 'filter_', 'sort_', 'discovery_'],
    palette: ['#7c3aed', '#8b5cf6', '#a78bfa', '#6d28d9', '#5b21b6', '#c4b5fd'],
  }, // violet
  {
    prefixes: ['video_', 'audio_', 'media_'],
    palette: ['#fbbf24', '#d97706', '#f59e0b', '#eab308', '#b45309', '#fcd34d'],
  }, // amber
  { prefixes: ['notification_', 'push_'], palette: ['#db2777', '#ec4899', '#f9a8d4'] }, // pink
  { prefixes: ['app_'], palette: ['#4338ca', '#4f46e5', '#3730a3', '#6366f1', '#818cf8', '#a5b4fc'] }, // indigo
  { prefixes: ['workspace_', 'org_', 'team_'], palette: ['#44403b', '#57534e', '#78716c', '#a8a29e'] }, // stone
  {
    prefixes: ['support_', 'survey_', 'feedback_', 'nps_', 'help_'],
    palette: ['#e11d48', '#be123c', '#f43f5e', '#fb7185', '#9f1239', '#fda4af'],
  }, // rose
  { prefixes: ['form_'], palette: ['#0d9488', '#0f766e', '#14b8a6', '#2dd4bf'] }, // teal
  { prefixes: ['file_', 'export_', 'upload_', 'download_'], palette: ['#52525b', '#71717a', '#3f3f46', '#27272a'] }, // zinc
  { prefixes: ['integration_', 'webhook_'], palette: ['#c026d3', '#a21caf', '#d946ef', '#e879f9'] }, // fuchsia
  { prefixes: ['api_'], palette: ['#9333ea', '#7e22ce', '#a855f7', '#6b21a8'] }, // purple
  { prefixes: ['invite_', 'invitation_'], palette: ['#84cc16', '#65a30d', '#4d7c0f', '#a3e635'] }, // lime
  { prefixes: ['page_', 'screen_', 'nav_'], palette: ['#2563eb', '#3b82f6', '#60a5fa', '#0891b2'] }, // blue
  { prefixes: ['auth_', 'password_', 'mfa_'], palette: ['#334155', '#475569', '#64748b', '#1e293b'] }, // slate
  { prefixes: ['error_', 'exception_'], palette: ['#b91c1c', '#dc2626', '#991b1b'] }, // red
  { prefixes: ['share_'], palette: ['#ea580c', '#f97316', '#c2410c'] }, // orange
]

// Deterministic 32-bit string hash — depends only on the name, so the chosen
// color is identical for every user, session, and view.
const hashString = (s: string): number => {
  let h = 0
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

// ── Lookup ──────────────────────────────────────────────────────────────────

const GENERIC_LABEL_RE = /^(step|cohort|series)\s+\d+$/i

export const getSeriesColor = (seriesName: string, fallbackIndex = 0): SeriesColor => {
  if (!seriesName || GENERIC_LABEL_RE.test(seriesName)) {
    return FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
  }

  const canonical = resolveKind(seriesName)
  if (!canonical) {
    return FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
  }

  const mapped = EVENT_COLORS[canonical]
  if (mapped) return mapped

  // Unmapped (custom) event — deterministic by name, identical for every user
  // and view. Borrow the matching family's hue; otherwise hash into the shared
  // fallback palette. (fallbackIndex now only steers the generic labels above.)
  const family = FAMILIES.find(f => f.prefixes.some(p => canonical.startsWith(p)))
  if (family) return color(family.palette[hashString(canonical) % family.palette.length])
  return FALLBACK_COLORS[hashString(canonical) % FALLBACK_COLORS.length]
}
