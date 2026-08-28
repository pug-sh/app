import { describe, expect, it } from 'vitest'
import {
  formatBrowserLabel,
  formatOsLabel,
  formatOsName,
  resolveBrowserIcon,
  resolveDeviceIcon,
  resolveDeviceModelIcon,
  resolveOsIcon,
} from './brand-icons'

describe('resolveDeviceModelIcon', () => {
  it('maps Apple device families to the Apple glyphs', () => {
    expect(resolveDeviceModelIcon('iPhone')).toBe('ios')
    expect(resolveDeviceModelIcon('iPad')).toBe('ios')
    expect(resolveDeviceModelIcon('Mac')).toBe('macos')
    expect(resolveDeviceModelIcon('Macintosh')).toBe('macos')
    expect(resolveDeviceModelIcon('MacBook Pro')).toBe('macos')
    expect(resolveDeviceModelIcon('Mac mini')).toBe('macos')
    expect(resolveDeviceModelIcon('iMac')).toBe('macos')
  })

  // 'mac' is short enough to sit inside unrelated UA model strings, and $device is arbitrary
  // customer/bot-supplied text — a wrong glyph is worse than none.
  it('does not read a bare "mac" substring as an Apple desktop', () => {
    expect(resolveDeviceModelIcon('Machine')).toBeNull()
    expect(resolveDeviceModelIcon('Mackerel')).toBeNull()
    expect(resolveDeviceModelIcon('Macropad')).toBeNull()
  })

  it('maps major Android brands to the Android glyph', () => {
    expect(resolveDeviceModelIcon('Samsung Galaxy S24')).toBe('android')
    expect(resolveDeviceModelIcon('Pixel 8')).toBe('android')
    expect(resolveDeviceModelIcon('OnePlus 12')).toBe('android')
    expect(resolveDeviceModelIcon('Redmi Note 13')).toBe('android')
  })

  it('matches Motorola under both its brand spellings', () => {
    expect(resolveDeviceModelIcon('Moto G54')).toBe('android')
    expect(resolveDeviceModelIcon('Motorola Edge 50')).toBe('android')
  })

  // Brand tokens run against arbitrary UA text, so a substring hit brands a Windows laptop as Android.
  // Asus and Lenovo are out of the list entirely — same brand on both an Android phone and a laptop.
  it('does not brand a Windows laptop model as Android', () => {
    expect(resolveDeviceModelIcon('ASUS VivoBook 15')).toBeNull()
    expect(resolveDeviceModelIcon('Lenovo ThinkPad X1')).toBeNull()
    expect(resolveDeviceModelIcon('ASUS ROG Strix G16')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(resolveDeviceModelIcon('pixel 8')).toBe('android')
  })

  it('returns null for unknown models, bots, and blanks', () => {
    expect(resolveDeviceModelIcon('Spider')).toBeNull()
    expect(resolveDeviceModelIcon('SmartTV')).toBeNull()
    expect(resolveDeviceModelIcon('')).toBeNull()
    expect(resolveDeviceModelIcon(undefined)).toBeNull()
  })
})

describe('resolveBrowserIcon', () => {
  // Each of these is Chromium-based but ships its own brand mark; before they were listed,
  // Brave borrowed Chrome's glyph and the other three drew nothing at all.
  it('resolves each Chromium derivative to its own glyph', () => {
    expect(resolveBrowserIcon('Microsoft Edge')).toBe('edge')
    expect(resolveBrowserIcon('Brave')).toBe('brave')
    expect(resolveBrowserIcon('Vivaldi')).toBe('vivaldi')
    expect(resolveBrowserIcon('DuckDuckGo')).toBe('duckduckgo')
    expect(resolveBrowserIcon('Chromium')).toBe('chromium')
    expect(resolveBrowserIcon('Opera')).toBe('opera')
  })

  it('still resolves Chrome itself, on desktop and iOS', () => {
    expect(resolveBrowserIcon('Google Chrome')).toBe('chrome')
    expect(resolveBrowserIcon('Chrome')).toBe('chrome')
    expect(resolveBrowserIcon('CriOS')).toBe('chrome')
  })

  it('resolves the non-Chromium engines', () => {
    expect(resolveBrowserIcon('Safari')).toBe('safari')
    expect(resolveBrowserIcon('Firefox')).toBe('firefox')
    expect(resolveBrowserIcon('FxiOS')).toBe('firefox')
  })

  it('resolves the browsers below Opera by share', () => {
    expect(resolveBrowserIcon('Samsung Internet')).toBe('samsung-internet')
    expect(resolveBrowserIcon('UC Browser')).toBe('uc')
    expect(resolveBrowserIcon('Yandex Browser')).toBe('yandex')
    expect(resolveBrowserIcon('Coc Coc')).toBe('coccoc')
    expect(resolveBrowserIcon('Android')).toBe('android')
  })

  // 'uc' is two letters. Both inputs here contain it — the previous pair ('Sogou Explorer',
  // 'Ecosia') did not, so the test passed even with the guard removed. DuckDuckGo is the live
  // hazard: it survives a bare 'uc' token today only because its branch comes first.
  it('does not read a stray "uc" as UC Browser', () => {
    expect(resolveBrowserIcon('Lucid Browser')).toBeNull()
    expect(resolveBrowserIcon('DuckDuckGo')).toBe('duckduckgo')
  })

  // Every Chromium UA also contains "Safari", so the chrome branch must stay above the safari one.
  // The clean family names above cannot catch a reorder; only a raw UA can.
  it('keeps Chrome above Safari for a raw user-agent string', () => {
    const chromeUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(resolveBrowserIcon(chromeUA)).toBe('chrome')
  })

  // The other half of that rule, and the half that was wrong: a derivative's raw UA carries its own
  // token *plus* Chrome's and Safari's, so 'opr'/'ucweb'/'samsungbrowser'/'fxios' only ever fire
  // from above the generic pair. Below it they are dead, and each of these drew Chrome or Safari.
  it('keeps every named brand above Chrome and Safari for a raw user-agent string', () => {
    const uas = {
      opera:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
      uc: 'Mozilla/5.0 (Linux; U; Android 10; en-US) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36',
      'samsung-internet':
        'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
      firefox:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/117.0 Mobile/15E148 Safari/605.1.15',
      edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      vivaldi:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5',
    }

    for (const [expected, ua] of Object.entries(uas)) expect(resolveBrowserIcon(ua)).toBe(expected)
  })

  // The reason the Samsung branch cannot match a bare 'samsung' from up there: a Chrome UA names the
  // handset in the same string, so this is Chrome on a Galaxy, not Samsung Internet.
  it('does not read a Samsung handset in a Chrome user-agent as Samsung Internet', () => {
    const chromeOnGalaxy =
      'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36'
    expect(resolveBrowserIcon(chromeOnGalaxy)).toBe('chrome')
  })

  // $browser is whatever the browser declares in userAgentData.brands, so this branch is
  // reached routinely — it is what UnknownBrowserIcon renders for.
  it('returns null for a brand it does not know, and for blanks', () => {
    expect(resolveBrowserIcon('QQ Browser')).toBeNull()
    expect(resolveBrowserIcon('Whale')).toBeNull()
    expect(resolveBrowserIcon('')).toBeNull()
    expect(resolveBrowserIcon(undefined)).toBeNull()
  })
})

describe('resolveOsIcon', () => {
  // ChromeOS is kept out of the backend's Linux collapse on purpose, so it arrives under its
  // own name and drew nothing until it was listed. Google brands it with the Chrome mark.
  it('resolves ChromeOS, and Chromium OS to the Chromium mark', () => {
    expect(resolveOsIcon('Chrome OS')).toBe('chrome')
    expect(resolveOsIcon('Chrome OS x86_64')).toBe('chrome')
    expect(resolveOsIcon('Chromium OS')).toBe('chromium')
  })

  // A bare 'chrome' check here would also swallow the four Chromecast families.
  it('does not read a Chromecast as ChromeOS', () => {
    expect(resolveOsIcon('Chromecast Linux')).toBe('linux')
    expect(resolveOsIcon('Chromecast Android')).toBe('android')
  })

  // 'kaios' contains 'ios'. KaiOS is a Firefox OS descendant with no Apple lineage, and was
  // drawing the Apple glyph.
  it('does not read KaiOS as an Apple platform', () => {
    expect(resolveOsIcon('KaiOS')).toBeNull()
  })

  // Not per-distro glyphs: the Debian/Ubuntu/Fedora marks carry CC-BY-SA and custom trademark
  // terms, and the backend collapses these families to "Linux" before we ever see them.
  it('resolves every Linux distro to Tux', () => {
    expect(resolveOsIcon('Linux')).toBe('linux')
    expect(resolveOsIcon('Ubuntu')).toBe('linux')
    expect(resolveOsIcon('Debian')).toBe('linux')
    expect(resolveOsIcon('Fedora')).toBe('linux')
    expect(resolveOsIcon('Arch Linux')).toBe('linux')
  })

  it('still resolves the Apple platforms', () => {
    expect(resolveOsIcon('iOS')).toBe('ios')
    expect(resolveOsIcon('iPadOS')).toBe('ios')
    expect(resolveOsIcon('macOS')).toBe('macos')
  })
})

describe('resolveDeviceIcon', () => {
  it('takes the platform from the OS, and an Apple family from either side', () => {
    expect(resolveDeviceIcon('Pixel 8', 'Android')).toBe('android')
    expect(resolveDeviceIcon('iPhone', 'iOS')).toBe('ios')
    expect(resolveDeviceIcon('iPhone', undefined)).toBe('ios')
    expect(resolveDeviceIcon(undefined, 'Windows')).toBe('windows')
  })

  // isMobileOS matches 'ios' unanchored — correctly, since KaiOS is a mobile OS — so KaiOS reaches
  // the mobile branch. It must not fall through to Android there: Nokia ships both Android and
  // KaiOS handsets, so the model string would confirm the wrong answer.
  it('does not draw Android for a mobile OS it has no glyph for', () => {
    expect(resolveDeviceIcon('Nokia 8110', 'KaiOS')).toBeNull()
    expect(resolveDeviceIcon(undefined, 'KaiOS')).toBeNull()
    expect(resolveDeviceIcon('Mobile', 'Tizen')).toBeNull()
  })
})

describe('formatBrowserLabel', () => {
  // browserForPlatform drops a native row's $browser, but the backend still parsed a version off the
  // HTTP client's UA — joined on its own that rendered a bare "3" beside the unknown-browser globe.
  it('is empty without a name, rather than a bare version', () => {
    expect(formatBrowserLabel(undefined, '3')).toBe('')
    expect(formatBrowserLabel('   ', '3')).toBe('')
  })

  it('still joins a named browser with its version', () => {
    expect(formatBrowserLabel('Google Chrome', '124')).toBe('Google Chrome 124')
    expect(formatBrowserLabel('Brave')).toBe('Brave')
  })
})

describe('formatOsName', () => {
  it('canonicalises the lowercase names the native SDKs report', () => {
    expect(formatOsName('android')).toBe('Android')
    expect(formatOsName('macos')).toBe('macOS')
    expect(formatOsName('ios')).toBe('iOS')
  })

  it('passes an already-canonical or unmapped name through', () => {
    expect(formatOsName('macOS')).toBe('macOS')
    expect(formatOsName('KaiOS')).toBe('KaiOS')
  })

  // $os is whatever the SDK sent, so a bare index reached Object.prototype and rendered the
  // function source — "function toString() { [native code] } 14" in the OS slot.
  it('does not index into Object.prototype', () => {
    expect(formatOsName('toString')).toBe('toString')
    expect(formatOsName('constructor')).toBe('constructor')
    expect(formatOsLabel('valueOf', '14')).toBe('valueOf 14')
  })
})
