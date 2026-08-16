import { AggregationType, SessionMetric } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { BreakdownPanelConfig } from './traffic-breakdown-panel'
import { SCREEN_NAME_PROPERTY } from './traffic-filters'
import { getTrafficStat, type NavKind } from './traffic-queries'

// The breakdown grid, per navigation event. Everything that differs between a web project and a
// mobile one is here: which dimension names a destination, and which properties the SDK fills.

// Footers borrow the stat row's vocabulary rather than restating it, so one number can't end up with
// two names on one screen.
const visitors = (kind: NavKind) => getTrafficStat('users').label[kind].toLowerCase()
const views = (kind: NavKind) => getTrafficStat('pageviews').label[kind].toLowerCase()

const destinationTabs = (label: string, property: string): BreakdownPanelConfig['tabs'] => [
  { id: 'pages', label, source: 'property', property, metric: AggregationType.TOTAL },
  { id: 'entry', label: 'Entry', source: 'session', metric: SessionMetric.ENTRY, property },
  { id: 'exit', label: 'Exit', source: 'session', metric: SessionMetric.EXIT, property },
]

// $pathname is the path alone, so a page groups across scheme, host and query string. A mobile route
// can't use it: attribution.Derive fills it only from a parseable http(s) URL with a host.
const PAGES_PANEL: BreakdownPanelConfig = {
  title: 'Pages',
  footer: `${views('page_view')} by page · sessions for entry / exit`,
  tabs: destinationTabs('Pages', '$pathname'),
}

const SCREENS_PANEL: BreakdownPanelConfig = {
  title: 'Screens',
  footer: `${views('screen_view')} by screen · sessions for entry / exit`,
  tabs: destinationTabs('Screens', SCREEN_NAME_PROPERTY),
}

const UTM_TABS = [
  {
    id: 'source',
    label: 'Source',
    source: 'property',
    property: '$utmSource',
    metric: AggregationType.UNIQUE_USERS,
    valueKind: 'source',
  },
  { id: 'medium', label: 'Medium', source: 'property', property: '$utmMedium', metric: AggregationType.UNIQUE_USERS },
  {
    id: 'campaign',
    label: 'Campaign',
    source: 'property',
    property: '$utmCampaign',
    metric: AggregationType.UNIQUE_USERS,
  },
] as const satisfies BreakdownPanelConfig['tabs']

// $referrerDomain is the referrer host, www-stripped and blanked on self-referral — not the raw,
// high-cardinality $referrer, which the backend promotes but deliberately never rolls up.
const SOURCES_PANEL: BreakdownPanelConfig = {
  title: 'Sources',
  footer: `unique ${visitors('page_view')} by referrer / UTM`,
  tabs: [
    {
      id: 'referrer',
      label: 'Referrer',
      source: 'property',
      property: '$referrerDomain',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'domain',
    },
    ...UTM_TABS,
  ],
}

// No Referrer tab: a mobile referrer is the previous route, not a host. The UTMs come off the deep
// link that first opened the app and the SDK then stamps them on every later event, so this is
// install attribution — it names where a user came from originally, not activity in the window.
const APP_SOURCES_PANEL: BreakdownPanelConfig = {
  title: 'Sources',
  footer: `unique ${visitors('screen_view')} by install campaign · first deep link, not this window`,
  tabs: UTM_TABS,
}

const LOCATION_TABS = [
  {
    id: 'country',
    label: 'Countries',
    source: 'property',
    property: '$country',
    metric: AggregationType.UNIQUE_USERS,
    valueKind: 'country',
  },
  { id: 'region', label: 'Regions', source: 'property', property: '$region', metric: AggregationType.UNIQUE_USERS },
  { id: 'city', label: 'Cities', source: 'property', property: '$city', metric: AggregationType.UNIQUE_USERS },
] as const satisfies BreakdownPanelConfig['tabs']

const locationsPanel = (kind: NavKind): BreakdownPanelConfig => ({
  title: 'Locations',
  footer: `unique ${visitors(kind)} by geography`,
  tabs: LOCATION_TABS,
})

const DEVICES_PANEL: BreakdownPanelConfig = {
  title: 'Devices',
  footer: `unique ${visitors('page_view')} by device`,
  tabs: [
    {
      id: 'browser',
      label: 'Browser',
      source: 'property',
      property: '$browser',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'browser',
    },
    {
      id: 'os',
      label: 'OS',
      source: 'property',
      property: '$os',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'os',
    },
    {
      id: 'device',
      label: 'Device',
      source: 'property',
      property: '$device',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'device',
    },
  ],
}

// $browser and $device are parsed from the User-Agent, which on a native app is the HTTP client's
// ("Dart/3.x (dart:io)"), so both are noise here. $os and $deviceModel are sent by the SDK instead.
const APP_DEVICES_PANEL: BreakdownPanelConfig = {
  title: 'Devices',
  footer: `unique ${visitors('screen_view')} by device`,
  tabs: [
    {
      id: 'os',
      label: 'OS',
      source: 'property',
      property: '$os',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'os',
    },
    {
      id: 'device',
      label: 'Device',
      source: 'property',
      property: '$deviceModel',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'device',
    },
    {
      id: 'appVersion',
      label: 'App version',
      source: 'property',
      property: '$appVersion',
      metric: AggregationType.UNIQUE_USERS,
    },
  ],
}

const EVENTS_PANEL: BreakdownPanelConfig = {
  title: 'Events',
  footer: 'across all events · click to open in Insights',
  tabs: [{ id: 'events', label: 'Events', source: 'eventKind' }],
}

type TrafficPanels = {
  destinations: BreakdownPanelConfig
  sources: BreakdownPanelConfig
  locations: BreakdownPanelConfig
  devices: BreakdownPanelConfig
  events: BreakdownPanelConfig
  mapFooter: string
}

// Module constants rather than a per-render build, so a panel's `config` prop keeps one identity and
// nothing downstream has to memoize it.
const PANELS_BY_NAV_KIND = {
  page_view: {
    destinations: PAGES_PANEL,
    sources: SOURCES_PANEL,
    locations: locationsPanel('page_view'),
    devices: DEVICES_PANEL,
    events: EVENTS_PANEL,
    mapFooter: `${views('page_view')} by country`,
  },
  screen_view: {
    destinations: SCREENS_PANEL,
    sources: APP_SOURCES_PANEL,
    locations: locationsPanel('screen_view'),
    devices: APP_DEVICES_PANEL,
    events: EVENTS_PANEL,
    mapFooter: `${views('screen_view')} by country`,
  },
} as const satisfies Record<NavKind, TrafficPanels>

export const trafficPanels = (navKind: NavKind) => PANELS_BY_NAV_KIND[navKind]
