// Single resolver for event-kind names — collapses cosmetic variations and
// maps synonyms/legacy/vendor conventions to canonical proto kinds. Shared by
// event-colors.ts (visual identity) and well-known-events.ts (inline props
// and headlines) so legacy data still gets the right color AND right schema.

// ── Cosmetic normalization ─────────────────────────────────────────────────
// `Page-View`, `pageView`, `PAGE VIEW`, `page_view` → `page_view`

const normalize = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // split camelCase before lowercasing
    .toLowerCase()
    .replace(/[-\s]+/g, '_') // hyphens and spaces → underscores
    .replace(/_+/g, '_') // collapse repeats
    .replace(/^_+|_+$/g, '')

// ── Semantic aliases ───────────────────────────────────────────────────────
// Maps synonyms / legacy names / vendor conventions (GA4, Segment ecommerce)
// to canonical kinds. Keys are in normalized form — cosmetic variants resolve
// via normalize() and don't need their own entries.

const EVENT_ALIASES: Record<string, string> = {
  // auth — legacy + common synonyms
  login: 'signin',
  log_in: 'signin',
  sign_in: 'signin',
  logout: 'signout',
  log_out: 'signout',
  sign_out: 'signout',
  sign_up: 'signup',
  register: 'signup',
  registration: 'signup',
  account_created: 'signup',

  // navigation — vendor variants
  pageview: 'page_view',
  page_viewed: 'page_view',
  screenview: 'screen_view',
  screen_viewed: 'screen_view',

  // commerce — legacy + GA4 + Segment ecommerce spec
  checkout_completed: 'purchase',
  order_completed: 'purchase',
  order_placed: 'purchase',
  buy: 'purchase',
  view_item: 'product_viewed',
  item_viewed: 'product_viewed',
  product_clicked: 'product_viewed',
  view_cart: 'cart_viewed',
  view_item_list: 'product_list_viewed',
  list_viewed: 'product_list_viewed',
  begin_checkout: 'checkout_started',
  start_checkout: 'checkout_started',
  product_added: 'add_to_cart',
  cart_added: 'add_to_cart',
  product_removed: 'remove_from_cart',
  cart_removed: 'remove_from_cart',
  add_payment_info: 'payment_method_added',
  payment_info_entered: 'payment_method_added',
  refund: 'order_refunded',
  order_cancelled: 'order_refunded',

  // forms
  form_started: 'form_start',
  form_submitted: 'form_submit',

  // media — GA4 variants
  video_start: 'video_started',
  video_complete: 'video_completed',
  audio_start: 'audio_started',
  audio_complete: 'audio_completed',

  // notifications — push channel and in-app notifications share one kind set;
  // backend treats them uniformly. If push ever gets its own proto schema,
  // remove the push_* aliases and add separate WELL_KNOWN entries.
  notification_open: 'notification_clicked',
  notification_opened: 'notification_clicked',
  notification_dismiss: 'notification_dismissed',
  push_received: 'notification_received',
  push_clicked: 'notification_clicked',
  push_opened: 'notification_clicked',

  // sharing
  shared: 'share',
}

/**
 * Resolves an incoming event-kind name to its canonical form.
 * Combines cosmetic normalization (case, delimiters, camelCase) with
 * semantic aliasing (synonyms, legacy names, vendor conventions).
 */
export const resolveKind = (name: string): string => {
  const normalized = normalize(name)
  return EVENT_ALIASES[normalized] ?? normalized
}

if (import.meta.env.DEV) {
  for (const k of Object.keys(EVENT_ALIASES)) {
    if (normalize(k) !== k) console.error(`event-aliases: key "${k}" is not normalized — will never match`)
  }
}
