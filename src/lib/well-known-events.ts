import type { DescMessage, JsonObject } from '@bufbuild/protobuf'
import {
  ApiKeyCreatedPropertiesSchema,
  ApiKeyRevokedPropertiesSchema,
} from '@/api/genproto/common/events/v1/api_events_pb'
import {
  AppCrashedPropertiesSchema,
  AppInstallPropertiesSchema,
  AppUpdatePropertiesSchema,
  FeatureUsedPropertiesSchema,
} from '@/api/genproto/common/events/v1/app_events_pb'
import { MfaDisabledPropertiesSchema, MfaEnabledPropertiesSchema } from '@/api/genproto/common/events/v1/auth_events_pb'
import {
  InvoiceFailedPropertiesSchema,
  InvoicePaidPropertiesSchema,
  PaymentFailedPropertiesSchema,
  PaymentMethodAddedPropertiesSchema,
  PaymentMethodRemovedPropertiesSchema,
  PaymentSucceededPropertiesSchema,
  RefundFailedPropertiesSchema,
  SubscriptionCanceledPropertiesSchema,
  SubscriptionChangedPropertiesSchema,
  SubscriptionPausedPropertiesSchema,
  SubscriptionRenewedPropertiesSchema,
  SubscriptionResumedPropertiesSchema,
  SubscriptionStartedPropertiesSchema,
  SubscriptionTrialWillEndPropertiesSchema,
  TrialConvertedPropertiesSchema,
  TrialStartedPropertiesSchema,
} from '@/api/genproto/common/events/v1/billing_events_pb'
import {
  ChatArchivedPropertiesSchema,
  ChatAttachmentDownloadedPropertiesSchema,
  ChatAttachmentUploadedPropertiesSchema,
  ChatCallJoinedPropertiesSchema,
  ChatCallLeftPropertiesSchema,
  ChatCallStartedPropertiesSchema,
  ChatCreatedPropertiesSchema,
  ChatDeletedPropertiesSchema,
  ChatJoinedPropertiesSchema,
  ChatLeftPropertiesSchema,
  ChatMemberAddedPropertiesSchema,
  ChatMemberMutedPropertiesSchema,
  ChatMemberRemovedPropertiesSchema,
  ChatMemberRoleChangedPropertiesSchema,
  ChatMessageDeletedPropertiesSchema,
  ChatMessageEditedPropertiesSchema,
  ChatMessageFailedPropertiesSchema,
  ChatMessagePinnedPropertiesSchema,
  ChatMessageReadPropertiesSchema,
  ChatMessageReceivedPropertiesSchema,
  ChatMessageSentPropertiesSchema,
  ChatMessageUnpinnedPropertiesSchema,
  ChatReactionAddedPropertiesSchema,
  ChatReactionRemovedPropertiesSchema,
  ChatTypingStartedPropertiesSchema,
  ChatTypingStoppedPropertiesSchema,
  ChatUnarchivedPropertiesSchema,
  ChatUserBlockedPropertiesSchema,
} from '@/api/genproto/common/events/v1/chat_events_pb'
import {
  AddToCartPropertiesSchema,
  CartViewedPropertiesSchema,
  CheckoutStartedPropertiesSchema,
  CheckoutStepCompletedPropertiesSchema,
  CouponAppliedPropertiesSchema,
  CouponRemovedPropertiesSchema,
  OrderRefundedPropertiesSchema,
  ProductListViewedPropertiesSchema,
  ProductViewedPropertiesSchema,
  PurchasePropertiesSchema,
  RemoveFromCartPropertiesSchema,
  WishlistAddedPropertiesSchema,
  WishlistRemovedPropertiesSchema,
} from '@/api/genproto/common/events/v1/commerce_events_pb'
import {
  FilterAppliedPropertiesSchema,
  RecommendationClickedPropertiesSchema,
  RecommendationViewedPropertiesSchema,
  SearchPropertiesSchema,
  SearchResultClickedPropertiesSchema,
  SortChangedPropertiesSchema,
} from '@/api/genproto/common/events/v1/discovery_events_pb'
import { ErrorOccurredPropertiesSchema } from '@/api/genproto/common/events/v1/error_events_pb'
import {
  ExportCompletedPropertiesSchema,
  ExportStartedPropertiesSchema,
  FileDownloadedPropertiesSchema,
  FileUploadedPropertiesSchema,
} from '@/api/genproto/common/events/v1/file_events_pb'
import { FormStartPropertiesSchema, FormSubmitPropertiesSchema } from '@/api/genproto/common/events/v1/form_events_pb'
import {
  IntegrationConnectedPropertiesSchema,
  IntegrationDisconnectedPropertiesSchema,
} from '@/api/genproto/common/events/v1/integration_events_pb'
import {
  InviteAcceptedPropertiesSchema,
  InviteSentPropertiesSchema,
} from '@/api/genproto/common/events/v1/invitation_events_pb'
import {
  AudioCompletedPropertiesSchema,
  AudioPausePropertiesSchema,
  AudioPlayPropertiesSchema,
  AudioSeekedPropertiesSchema,
  AudioStartedPropertiesSchema,
  VideoCompletedPropertiesSchema,
  VideoPausePropertiesSchema,
  VideoPlayPropertiesSchema,
  VideoSeekedPropertiesSchema,
  VideoStartedPropertiesSchema,
} from '@/api/genproto/common/events/v1/media_events_pb'
import {
  ClickPropertiesSchema,
  DeadClickPropertiesSchema,
  RageClickPropertiesSchema,
  ScreenViewPropertiesSchema,
  ScrollPropertiesSchema,
} from '@/api/genproto/common/events/v1/navigation_events_pb'
import {
  NotificationClickedPropertiesSchema,
  NotificationDismissedPropertiesSchema,
  NotificationReceivedPropertiesSchema,
} from '@/api/genproto/common/events/v1/notification_events_pb'
import {
  FeedbackSubmittedPropertiesSchema,
  HelpArticleViewedPropertiesSchema,
  NpsSubmittedPropertiesSchema,
  SupportChatStartedPropertiesSchema,
  SupportTicketCreatedPropertiesSchema,
  SupportTicketResolvedPropertiesSchema,
  SurveyCompletedPropertiesSchema,
  SurveyStartedPropertiesSchema,
} from '@/api/genproto/common/events/v1/support_events_pb'
import {
  WorkspaceCreatedPropertiesSchema,
  WorkspaceDeletedPropertiesSchema,
  WorkspaceJoinedPropertiesSchema,
  WorkspaceRoleChangedPropertiesSchema,
  WorkspaceSettingsUpdatedPropertiesSchema,
} from '@/api/genproto/common/events/v1/workspace_events_pb'
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

// Join the first present value of each key with a separator (e.g. "pro → enterprise", "billing · high").
const fmtJoin =
  (keys: string[], sep = ' · '): Formatter =>
  p => {
    const vals = keys.map(k => structGet(p, k)).filter(Boolean)
    return vals.length ? vals.join(sep) : null
  }

// First non-empty field among keys (e.g. product_name, falling back to product_id).
const fmtFirst =
  (...keys: string[]): Formatter =>
  p => {
    for (const k of keys) {
      const v = structGet(p, k)
      if (v) return v
    }
    return null
  }

// google.protobuf.Duration ("90s", "1.5s") → "m:ss" or "h:mm:ss".
const fmtDur = (raw: string | undefined) => {
  if (!raw) return null
  const n = Number(raw.replace(/s$/, ''))
  if (Number.isNaN(n)) return raw
  const ss = String(Math.floor(n % 60)).padStart(2, '0')
  const m = Math.floor(n / 60) % 60
  const h = Math.floor(n / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const fmtAmountReason: Formatter = p => {
  const amt = fmtAmount(p)
  const reason = structGet(p, 'reason')
  if (!amt && !reason) return null
  return [amt, reason].filter(Boolean).join(' — ')
}

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

  // api
  api_key_created: { schema: ApiKeyCreatedPropertiesSchema, headlines: ['name'], format: fmtField('name') },
  api_key_revoked: { schema: ApiKeyRevokedPropertiesSchema, headlines: ['name'], format: fmtField('name') },

  // app lifecycle
  app_install: { schema: AppInstallPropertiesSchema, headlines: ['app_version'], format: fmtField('app_version') },
  app_update: {
    schema: AppUpdatePropertiesSchema,
    headlines: ['previous_version', 'app_version'],
    format: fmtJoin(['previous_version', 'app_version'], ' → '),
  },
  app_crashed: { schema: AppCrashedPropertiesSchema, headlines: ['error_message'], format: fmtField('error_message') },
  feature_used: {
    schema: FeatureUsedPropertiesSchema,
    headlines: ['feature_name', 'feature_id'],
    format: fmtFirst('feature_name', 'feature_id'),
  },

  // auth
  mfa_enabled: { schema: MfaEnabledPropertiesSchema, headlines: ['method'], format: fmtField('method') },
  mfa_disabled: { schema: MfaDisabledPropertiesSchema, headlines: ['method'], format: fmtField('method') },

  // billing (additional)
  subscription_changed: {
    schema: SubscriptionChangedPropertiesSchema,
    headlines: ['previous_plan_id', 'new_plan_id'],
    format: fmtJoin(['previous_plan_id', 'new_plan_id'], ' → '),
  },
  subscription_canceled: {
    schema: SubscriptionCanceledPropertiesSchema,
    headlines: ['plan_id', 'reason'],
    format: fmtJoin(['plan_id', 'reason']),
  },
  subscription_renewed: {
    schema: SubscriptionRenewedPropertiesSchema,
    headlines: ['plan_id', 'amount'],
    format: p => {
      const plan = structGet(p, 'plan_id')
      const amt = fmtAmount(p)
      if (!plan && !amt) return null
      return [plan, amt].filter(Boolean).join(' · ')
    },
  },
  subscription_paused: {
    schema: SubscriptionPausedPropertiesSchema,
    headlines: ['plan_id', 'reason'],
    format: fmtJoin(['plan_id', 'reason']),
  },
  subscription_resumed: {
    schema: SubscriptionResumedPropertiesSchema,
    headlines: ['plan_id'],
    format: fmtField('plan_id'),
  },
  subscription_trial_will_end: {
    schema: SubscriptionTrialWillEndPropertiesSchema,
    headlines: ['plan_id'],
    format: fmtField('plan_id'),
  },
  invoice_paid: { schema: InvoicePaidPropertiesSchema, headlines: ['amount', 'currency'], format: fmtAmount },
  invoice_failed: { schema: InvoiceFailedPropertiesSchema, headlines: ['amount', 'reason'], format: fmtAmountReason },
  payment_method_added: {
    schema: PaymentMethodAddedPropertiesSchema,
    headlines: ['payment_method_type'],
    format: fmtField('payment_method_type'),
  },
  payment_method_removed: {
    schema: PaymentMethodRemovedPropertiesSchema,
    headlines: ['payment_method_type'],
    format: fmtField('payment_method_type'),
  },
  trial_started: { schema: TrialStartedPropertiesSchema, headlines: ['plan_id'], format: fmtField('plan_id') },
  trial_converted: { schema: TrialConvertedPropertiesSchema, headlines: ['plan_id'], format: fmtField('plan_id') },
  refund_failed: { schema: RefundFailedPropertiesSchema, headlines: ['amount', 'reason'], format: fmtAmountReason },

  // chat
  chat_created: {
    schema: ChatCreatedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_joined: {
    schema: ChatJoinedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_left: {
    schema: ChatLeftPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_deleted: {
    schema: ChatDeletedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_archived: {
    schema: ChatArchivedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_unarchived: {
    schema: ChatUnarchivedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_member_added: { schema: ChatMemberAddedPropertiesSchema, headlines: ['role'], format: fmtField('role') },
  chat_member_removed: { schema: ChatMemberRemovedPropertiesSchema, headlines: ['reason'], format: fmtField('reason') },
  chat_member_role_changed: {
    schema: ChatMemberRoleChangedPropertiesSchema,
    headlines: ['previous_role', 'new_role'],
    format: fmtJoin(['previous_role', 'new_role'], ' → '),
  },
  chat_message_sent: {
    schema: ChatMessageSentPropertiesSchema,
    headlines: ['message_type'],
    format: fmtField('message_type'),
  },
  chat_message_received: {
    schema: ChatMessageReceivedPropertiesSchema,
    headlines: ['message_type'],
    format: fmtField('message_type'),
  },
  chat_message_failed: { schema: ChatMessageFailedPropertiesSchema, headlines: ['reason'], format: fmtField('reason') },
  chat_message_read: {
    schema: ChatMessageReadPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_message_deleted: {
    schema: ChatMessageDeletedPropertiesSchema,
    headlines: ['reason'],
    format: fmtField('reason'),
  },
  chat_message_edited: {
    schema: ChatMessageEditedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_message_pinned: {
    schema: ChatMessagePinnedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_message_unpinned: {
    schema: ChatMessageUnpinnedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_typing_started: {
    schema: ChatTypingStartedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_typing_stopped: {
    schema: ChatTypingStoppedPropertiesSchema,
    headlines: ['conversation_type'],
    format: fmtField('conversation_type'),
  },
  chat_attachment_uploaded: {
    schema: ChatAttachmentUploadedPropertiesSchema,
    headlines: ['attachment_type'],
    format: fmtField('attachment_type'),
  },
  chat_attachment_downloaded: {
    schema: ChatAttachmentDownloadedPropertiesSchema,
    headlines: ['attachment_type'],
    format: fmtField('attachment_type'),
  },
  chat_call_started: {
    schema: ChatCallStartedPropertiesSchema,
    headlines: ['call_type'],
    format: fmtField('call_type'),
  },
  chat_call_joined: { schema: ChatCallJoinedPropertiesSchema, headlines: ['call_type'], format: fmtField('call_type') },
  chat_call_left: {
    schema: ChatCallLeftPropertiesSchema,
    headlines: ['call_type', 'duration'],
    format: p => {
      const type = structGet(p, 'call_type')
      const dur = fmtDur(structGet(p, 'duration'))
      if (!type && !dur) return null
      return [type, dur].filter(Boolean).join(' · ')
    },
  },
  chat_member_muted: {
    schema: ChatMemberMutedPropertiesSchema,
    headlines: ['mute_duration'],
    format: p => fmtDur(structGet(p, 'mute_duration')),
  },
  chat_user_blocked: { schema: ChatUserBlockedPropertiesSchema, headlines: ['user_id'], format: fmtField('user_id') },
  chat_reaction_added: {
    schema: ChatReactionAddedPropertiesSchema,
    headlines: ['reaction'],
    format: fmtField('reaction'),
  },
  chat_reaction_removed: {
    schema: ChatReactionRemovedPropertiesSchema,
    headlines: ['reaction'],
    format: fmtField('reaction'),
  },

  // commerce (additional)
  product_list_viewed: {
    schema: ProductListViewedPropertiesSchema,
    headlines: ['list_name', 'list_id'],
    format: fmtFirst('list_name', 'list_id'),
  },
  remove_from_cart: {
    schema: RemoveFromCartPropertiesSchema,
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
  cart_viewed: { schema: CartViewedPropertiesSchema, headlines: ['amount', 'currency'], format: fmtAmount },
  wishlist_added: { schema: WishlistAddedPropertiesSchema, headlines: ['product_id'], format: fmtField('product_id') },
  wishlist_removed: {
    schema: WishlistRemovedPropertiesSchema,
    headlines: ['product_id'],
    format: fmtField('product_id'),
  },
  coupon_applied: {
    schema: CouponAppliedPropertiesSchema,
    headlines: ['coupon_code'],
    format: fmtField('coupon_code'),
  },
  coupon_removed: {
    schema: CouponRemovedPropertiesSchema,
    headlines: ['coupon_code'],
    format: fmtField('coupon_code'),
  },
  order_refunded: { schema: OrderRefundedPropertiesSchema, headlines: ['amount', 'reason'], format: fmtAmountReason },

  // discovery (additional)
  search_result_clicked: {
    schema: SearchResultClickedPropertiesSchema,
    headlines: ['query'],
    format: fmtField('query'),
  },
  recommendation_viewed: {
    schema: RecommendationViewedPropertiesSchema,
    headlines: ['item_id'],
    format: fmtField('item_id'),
  },
  recommendation_clicked: {
    schema: RecommendationClickedPropertiesSchema,
    headlines: ['item_id'],
    format: fmtField('item_id'),
  },
  filter_applied: {
    schema: FilterAppliedPropertiesSchema,
    headlines: ['key', 'value'],
    format: fmtJoin(['key', 'value'], ': '),
  },
  sort_changed: {
    schema: SortChangedPropertiesSchema,
    headlines: ['key', 'direction'],
    format: fmtJoin(['key', 'direction']),
  },

  // files
  file_uploaded: { schema: FileUploadedPropertiesSchema, headlines: ['file_name'], format: fmtField('file_name') },
  file_downloaded: {
    schema: FileDownloadedPropertiesSchema,
    headlines: ['file_name'],
    format: fmtField('file_name'),
  },
  export_started: {
    schema: ExportStartedPropertiesSchema,
    headlines: ['export_type'],
    format: fmtField('export_type'),
  },
  export_completed: {
    schema: ExportCompletedPropertiesSchema,
    headlines: ['export_type'],
    format: fmtField('export_type'),
  },

  // integrations
  integration_connected: {
    schema: IntegrationConnectedPropertiesSchema,
    headlines: ['integration_type'],
    format: fmtField('integration_type'),
  },
  integration_disconnected: {
    schema: IntegrationDisconnectedPropertiesSchema,
    headlines: ['integration_type', 'reason'],
    format: fmtJoin(['integration_type', 'reason']),
  },

  // invitations
  invite_sent: { schema: InviteSentPropertiesSchema, headlines: ['invitee_email'], format: fmtField('invitee_email') },
  invite_accepted: {
    schema: InviteAcceptedPropertiesSchema,
    headlines: ['invitee_email'],
    format: fmtField('invitee_email'),
  },

  // media (additional)
  video_started: { schema: VideoStartedPropertiesSchema, headlines: ['video_id'], format: fmtField('video_id') },
  video_seeked: { schema: VideoSeekedPropertiesSchema, headlines: ['video_id'], format: fmtField('video_id') },
  video_completed: { schema: VideoCompletedPropertiesSchema, headlines: ['video_id'], format: fmtField('video_id') },
  audio_started: { schema: AudioStartedPropertiesSchema, headlines: ['audio_id'], format: fmtField('audio_id') },
  audio_seeked: { schema: AudioSeekedPropertiesSchema, headlines: ['audio_id'], format: fmtField('audio_id') },
  audio_completed: { schema: AudioCompletedPropertiesSchema, headlines: ['audio_id'], format: fmtField('audio_id') },

  // navigation (additional)
  screen_view: { schema: ScreenViewPropertiesSchema, headlines: ['screen_name'], format: fmtField('screen_name') },

  // support
  feedback_submitted: {
    schema: FeedbackSubmittedPropertiesSchema,
    headlines: ['comment', 'category'],
    format: fmtFirst('comment', 'category'),
  },
  nps_submitted: { schema: NpsSubmittedPropertiesSchema, headlines: ['score'], format: fmtField('score') },
  survey_started: { schema: SurveyStartedPropertiesSchema, headlines: ['survey_id'], format: fmtField('survey_id') },
  survey_completed: {
    schema: SurveyCompletedPropertiesSchema,
    headlines: ['survey_id'],
    format: fmtField('survey_id'),
  },
  support_ticket_created: {
    schema: SupportTicketCreatedPropertiesSchema,
    headlines: ['category', 'priority'],
    format: fmtJoin(['category', 'priority']),
  },
  support_ticket_resolved: {
    schema: SupportTicketResolvedPropertiesSchema,
    headlines: ['resolution', 'ticket_id'],
    format: fmtFirst('resolution', 'ticket_id'),
  },
  support_chat_started: {
    schema: SupportChatStartedPropertiesSchema,
    headlines: ['topic', 'conversation_id'],
    format: fmtFirst('topic', 'conversation_id'),
  },
  help_article_viewed: {
    schema: HelpArticleViewedPropertiesSchema,
    headlines: ['article_title', 'article_id'],
    format: fmtFirst('article_title', 'article_id'),
  },

  // workspace
  workspace_created: {
    schema: WorkspaceCreatedPropertiesSchema,
    headlines: ['workspace_name'],
    format: fmtField('workspace_name'),
  },
  workspace_joined: { schema: WorkspaceJoinedPropertiesSchema, headlines: ['role'], format: fmtField('role') },
  workspace_deleted: { schema: WorkspaceDeletedPropertiesSchema, headlines: ['reason'], format: fmtField('reason') },
  workspace_role_changed: {
    schema: WorkspaceRoleChangedPropertiesSchema,
    headlines: ['previous_role', 'new_role'],
    format: fmtJoin(['previous_role', 'new_role'], ' → '),
  },
  workspace_settings_updated: {
    schema: WorkspaceSettingsUpdatedPropertiesSchema,
    headlines: ['setting'],
    format: fmtField('setting'),
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
