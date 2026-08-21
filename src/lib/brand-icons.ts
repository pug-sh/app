import type { BrandIconName } from '@/lib/brand-icon-assets'
import { isMobileOS } from '@/lib/format'

export type { BrandIconName }

const matchToken = (value: string | undefined, tokens: string[]) => {
  const normalized = value?.toLowerCase().trim() ?? ''
  if (!normalized) return false
  return tokens.some(token => normalized.includes(token))
}

// Whole-word, because bare 'ios' as a substring also matches KaiOS — a Firefox-OS descendant with
// no Apple lineage, which was drawing the Apple glyph. The token lists in this function stay
// unanchored: they also run against $device model strings, where a trailing \b rejects "iPhone15,3".
const APPLE_MOBILE_OS = /\bios\b/

const resolveAppleIcon = (os?: string) => {
  if (APPLE_MOBILE_OS.test(os?.toLowerCase() ?? '') || matchToken(os, ['ipad', 'iphone', 'ipados'])) return 'ios'
  if (matchToken(os, ['mac', 'darwin', 'macos'])) return 'macos'
  return null
}

export const resolveBrowserIcon = (browser?: string) => {
  if (!browser?.trim()) return null

  // $browser is normally a family name ("Google Chrome", "Brave"), so each Chromium derivative needs
  // its own line — unlisted, it falls through to null, not to Chrome. Order is still load-bearing:
  // the 'crios'/'edg'/'opr' tokens exist for a raw UA reaching us unnormalized, and every Chromium
  // UA also contains "Safari", so chrome must stay above safari or Chrome rows draw the Safari mark.
  if (matchToken(browser, ['edge', 'edg'])) return 'edge'
  if (matchToken(browser, ['brave'])) return 'brave'
  if (matchToken(browser, ['vivaldi'])) return 'vivaldi'
  if (matchToken(browser, ['duckduckgo'])) return 'duckduckgo'
  if (matchToken(browser, ['chromium'])) return 'chromium'
  if (matchToken(browser, ['chrome', 'crios'])) return 'chrome'
  if (matchToken(browser, ['safari'])) return 'safari'
  if (matchToken(browser, ['firefox', 'fxios'])) return 'firefox'
  if (matchToken(browser, ['opera', 'opr'])) return 'opera'
  if (matchToken(browser, ['samsung'])) return 'samsung-internet'
  // Never a bare 'uc' — two letters would match far too much, DuckDuckGo included.
  if (matchToken(browser, ['uc browser', 'ucbrowser', 'ucweb'])) return 'uc'
  if (matchToken(browser, ['yandex'])) return 'yandex'
  if (matchToken(browser, ['coc coc', 'coccoc'])) return 'coccoc'
  // The legacy stock browser, which ua-parser reports as plain "Android".
  if (matchToken(browser, ['android'])) return 'android'

  return null
}

export const resolveOsIcon = (os?: string) => {
  if (!os?.trim()) return null

  const apple = resolveAppleIcon(os)
  if (apple) return apple

  if (matchToken(os, ['chromium os'])) return 'chromium'
  // Matched on the full name, never a bare 'chrome': that would also swallow the Chromecast
  // families. ChromeOS has no square mark of its own, so reusing Chrome's is deliberate.
  if (matchToken(os, ['chrome os', 'chromeos'])) return 'chrome'
  if (matchToken(os, ['windows', 'win32'])) return 'windows'
  if (matchToken(os, ['android'])) return 'android'
  // Every distro resolves to Tux. The backend already collapses these families to "Linux", so the
  // tokens only arrive from an SDK sending $os raw — and a per-distro mark isn't worth the
  // copyleft and trademark terms on the Debian, Ubuntu and Fedora logos (see the Brand icons
  // section of CLAUDE.md).
  if (matchToken(os, ['linux', 'ubuntu', 'debian', 'fedora'])) return 'linux'

  return null
}

export const resolveDeviceIcon = (device?: string, os?: string) => {
  const normalizedDevice = device?.toLowerCase().trim() ?? ''
  const mobile =
    normalizedDevice.includes('mobile') ||
    normalizedDevice.includes('phone') ||
    normalizedDevice.includes('tablet') ||
    normalizedDevice.includes('ipad') ||
    isMobileOS(os)

  if (mobile) {
    // The device token can name an Apple family when the OS string is absent or generic.
    const apple = resolveAppleIcon(os) ?? resolveAppleIcon(device)
    if (apple) return apple
    // A named OS decides on its own. Guessing Android for any non-Apple mobile is what drew the
    // Android glyph for KaiOS, whose 'ios' substring makes isMobileOS true — and Nokia, which
    // builds both Android and KaiOS handsets, would have the model agree with the wrong answer.
    if (os?.trim()) return resolveOsIcon(os)
    return resolveDeviceModelIcon(device)
  }

  return resolveOsIcon(os)
}

// Brand glyph for a $device *model* string on its own — what a device breakdown ranks, with no OS
// column for resolveDeviceIcon to lean on. Biased toward a miss: an icon we don't draw costs
// nothing, a wrong one misreports the device.
const APPLE_MOBILE_MODELS = ['iphone', 'ipod', 'ipad']
// Whole-word rather than the substring match the token lists use: bare "mac" is short enough to sit
// inside unrelated model strings ("Machine"), and $device is arbitrary UA text, so a bogus model
// would otherwise earn a confidently wrong glyph. Space-separated variants ("Mac mini", "Mac Pro")
// are covered by the bare `mac` alternative.
const APPLE_DESKTOP_MODEL = /\b(?:macbook|macintosh|imac|mac)\b/
// Whole-word for the same reason as APPLE_DESKTOP_MODEL: these run against arbitrary UA text, where a
// substring hit earns a confidently wrong glyph — "vivo" sits inside "VivoBook", an Asus *laptop*.
// `moto` can't reach "Motorola" under \b, so both are listed. Asus and Lenovo are deliberately absent:
// both ship Windows laptops under the brand that names their Android phones, so a model string alone
// can't tell the two apart, and Asus phones are already covered by `zenfone`.
const ANDROID_BRAND_MODEL =
  /\b(?:pixel|nexus|samsung|galaxy|oneplus|xiaomi|redmi|poco|huawei|honor|oppo|vivo|realme|motorola|moto|nokia|xperia|zenfone)\b/

export const resolveDeviceModelIcon = (device?: string) => {
  if (matchToken(device, APPLE_MOBILE_MODELS)) return 'ios'
  if (APPLE_DESKTOP_MODEL.test(device?.toLowerCase() ?? '')) return 'macos'
  if (ANDROID_BRAND_MODEL.test(device?.toLowerCase() ?? '')) return 'android'
  return null
}

// `satisfies` pins every resolver to a name the asset map knows, in the module that owns the
// invariant, without widening away the narrow literal unions the call sites rely on.
export const BRAND_ICON_RESOLVERS = {
  browser: resolveBrowserIcon,
  os: resolveOsIcon,
  device: resolveDeviceModelIcon,
} satisfies Record<string, (value?: string) => BrandIconName | null>

export type BrandValueKind = keyof typeof BRAND_ICON_RESOLVERS

export const formatBrowserLabel = (browser?: string, browserVersion?: string) =>
  [browser, browserVersion].filter(Boolean).join(' ')

export const formatOsLabel = (os?: string, osVersion?: string) => [os, osVersion].filter(Boolean).join(' ')

export const formatPlatformPrimary = (browser?: string, os?: string) => [browser, os].filter(Boolean).join(' · ')

export const formatDeviceLabel = (device?: string, os?: string) => {
  const isMobile = isMobileDevice(device, os)
  return device?.trim() || (os ? (isMobile ? 'Mobile' : 'Desktop') : '')
}

export const isMobileDevice = (device?: string, os?: string) => {
  const normalizedDevice = device?.toLowerCase().trim() ?? ''
  if (normalizedDevice.includes('desktop')) return false
  if (
    normalizedDevice.includes('mobile') ||
    normalizedDevice.includes('phone') ||
    normalizedDevice.includes('tablet') ||
    normalizedDevice.includes('ipad')
  ) {
    return true
  }
  return isMobileOS(os)
}
