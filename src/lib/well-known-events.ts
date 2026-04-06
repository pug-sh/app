import {
  ClickPropertiesSchema,
  RageClickPropertiesSchema,
  DeadClickPropertiesSchema,
  ScrollPropertiesSchema,
  SearchPropertiesSchema,
  AddToCartPropertiesSchema,
  CheckoutStartedPropertiesSchema,
  CheckoutCompletedPropertiesSchema,
  PurchasePropertiesSchema,
  FormStartPropertiesSchema,
  FormSubmitPropertiesSchema,
  NotificationReceivedPropertiesSchema,
  NotificationClickedPropertiesSchema,
  NotificationDismissedPropertiesSchema,
  VideoPlayPropertiesSchema,
  VideoPausePropertiesSchema,
  ErrorOccurredPropertiesSchema,
} from '@/api/genproto/common/v1/well_known_events_pb'
import type { DescMessage } from '@bufbuild/protobuf'

const WELL_KNOWN_SCHEMAS: Record<string, DescMessage> = {
  click: ClickPropertiesSchema,
  rage_click: RageClickPropertiesSchema,
  dead_click: DeadClickPropertiesSchema,
  scroll: ScrollPropertiesSchema,
  search: SearchPropertiesSchema,
  add_to_cart: AddToCartPropertiesSchema,
  checkout_started: CheckoutStartedPropertiesSchema,
  checkout_completed: CheckoutCompletedPropertiesSchema,
  purchase: PurchasePropertiesSchema,
  form_start: FormStartPropertiesSchema,
  form_submit: FormSubmitPropertiesSchema,
  notification_received: NotificationReceivedPropertiesSchema,
  notification_clicked: NotificationClickedPropertiesSchema,
  notification_dismissed: NotificationDismissedPropertiesSchema,
  video_play: VideoPlayPropertiesSchema,
  video_pause: VideoPausePropertiesSchema,
  error_occurred: ErrorOccurredPropertiesSchema,
}

export function getWellKnownFields(kind: string): string[] {
  return WELL_KNOWN_SCHEMAS[kind]?.fields.map(f => f.name) ?? []
}

const HEADLINE_FIELD: Record<string, string> = {
  click: 'text',
  rage_click: 'element',
  dead_click: 'element',
  scroll: 'percent',
  search: 'query',
  add_to_cart: 'amount',
  checkout_started: 'amount',
  checkout_completed: 'amount',
  purchase: 'amount',
  form_start: 'form_name',
  form_submit: 'form_name',
  notification_received: 'notification_type',
  notification_clicked: 'campaign_id',
  notification_dismissed: 'campaign_id',
  video_play: 'video_id',
  video_pause: 'video_id',
  error_occurred: 'error_code',
}

export function getHeadlineField(kind: string): string | null {
  return HEADLINE_FIELD[kind] ?? null
}
