import { describe, expect, it } from 'vitest'
import type { BreakdownPanelConfig } from './traffic-breakdown-panel'
import { SCREEN_NAME_PROPERTY } from './traffic-filters'
import { trafficPanels } from './traffic-panels'

const propertiesOf = (config: BreakdownPanelConfig) =>
  config.tabs.flatMap(tab => (tab.source === 'eventKind' ? [] : [tab.property]))

const web = trafficPanels('page_view')
const app = trafficPanels('screen_view')

// The panels a mobile project would otherwise render empty. attribution.Derive fills $pathname,
// $hostname, $referrerDomain and $channel only from a parseable http(s) URL with a host, and the
// Flutter SDK's $url is a bare route ("/home") — so none of them exist on a screen_view. $browser and
// $device come from the User-Agent, which on a native app is the Dart HTTP client's.
describe('trafficPanels', () => {
  it('ranks screens by the SDK-sent screen name, never the derived $pathname', () => {
    expect(propertiesOf(app.destinations)).toEqual([SCREEN_NAME_PROPERTY, SCREEN_NAME_PROPERTY, SCREEN_NAME_PROPERTY])
  })

  it('drops the referrer tab on mobile but keeps the deep-link UTMs', () => {
    expect(propertiesOf(app.sources)).not.toContain('$referrerDomain')
    expect(propertiesOf(app.sources)).toContain('$utmSource')
  })

  it('drops the user-agent-derived device tabs on mobile', () => {
    const properties = propertiesOf(app.devices)
    expect(properties).not.toContain('$browser')
    expect(properties).not.toContain('$device')
    expect(properties).toEqual(['$os', '$deviceModel', '$appVersion'])
  })

  it('leaves the web panels on the derived properties', () => {
    expect(propertiesOf(web.destinations)).toEqual(['$pathname', '$pathname', '$pathname'])
    expect(propertiesOf(web.sources)).toContain('$referrerDomain')
    expect(propertiesOf(web.devices)).toContain('$browser')
  })

  it('counts the map in each vocabulary', () => {
    expect(web.mapFooter).toContain('pageviews')
    expect(app.mapFooter).toContain('screen views')
  })
})
