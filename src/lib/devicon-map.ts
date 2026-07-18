import { isMobileOS } from '@/lib/format'

export type DeviconName =
  | 'android-original'
  | 'chrome-original'
  | 'debian-original'
  | 'edge'
  | 'fedora-original'
  | 'firefox'
  | 'ios'
  | 'linux-original'
  | 'macos'
  | 'opera-original'
  | 'safari-original'
  | 'ubuntu-original'
  | 'windows11-original'

const matchToken = (value: string | undefined, tokens: string[]) => {
  const normalized = value?.toLowerCase().trim() ?? ''
  if (!normalized) return false
  return tokens.some(token => normalized.includes(token))
}

export const resolveAppleDevicon = (os?: string) => {
  if (matchToken(os, ['ios', 'ipad', 'iphone', 'ipados'])) return 'ios'
  if (matchToken(os, ['mac', 'darwin', 'macos'])) return 'macos'
  return null
}

export const resolveBrowserDevicon = (browser?: string) => {
  if (!browser?.trim()) return null

  // Edge must be checked before Chrome: the Edge UA token set includes Chrome,
  // so a Chrome match would otherwise shadow Edge.
  if (matchToken(browser, ['edge', 'edg'])) return 'edge'
  if (matchToken(browser, ['chrome', 'chromium', 'crios'])) return 'chrome-original'
  if (matchToken(browser, ['safari'])) return 'safari-original'
  if (matchToken(browser, ['firefox', 'fxios'])) return 'firefox'
  if (matchToken(browser, ['opera', 'opr'])) return 'opera-original'
  // Brave ships no devicon and is Chromium-based, so reuse the Chrome glyph.
  if (matchToken(browser, ['brave'])) return 'chrome-original'

  return null
}

export const resolveOsDevicon = (os?: string) => {
  if (!os?.trim()) return null

  const apple = resolveAppleDevicon(os)
  if (apple) return apple

  if (matchToken(os, ['windows', 'win32'])) return 'windows11-original'
  if (matchToken(os, ['android'])) return 'android-original'
  if (matchToken(os, ['ubuntu'])) return 'ubuntu-original'
  if (matchToken(os, ['debian'])) return 'debian-original'
  if (matchToken(os, ['fedora'])) return 'fedora-original'
  if (matchToken(os, ['linux'])) return 'linux-original'

  return null
}

export const resolveDeviceDevicon = (device?: string, os?: string) => {
  const normalizedDevice = device?.toLowerCase().trim() ?? ''
  const mobile =
    normalizedDevice.includes('mobile') ||
    normalizedDevice.includes('phone') ||
    normalizedDevice.includes('tablet') ||
    normalizedDevice.includes('ipad') ||
    isMobileOS(os)

  if (mobile) {
    // An iPad/iPhone device token should resolve to the Apple icon even when the
    // OS string is absent or generic; only then fall back to Android.
    const apple = resolveAppleDevicon(os) ?? resolveAppleDevicon(device)
    if (apple) return apple
    return 'android-original'
  }

  return resolveOsDevicon(os)
}

// Brand glyph for a $device *model* string on its own — what a device breakdown ranks. resolveDeviceDevicon
// leans on the OS string to classify, which a breakdown row doesn't carry, so an Android model like
// "Pixel 8" would resolve to nothing. Here the model itself is the signal: Apple families
// ("iPhone"/"iPad"/"iPod", "Mac") map to the Apple glyphs, the major Android brands to the Android glyph,
// and everything else (desktops report no model; plus the long tail and bots like "Spider") stays
// iconless. Best-effort — a miss only costs an icon, never a wrong one.
const APPLE_MOBILE_MODELS = ['iphone', 'ipod', 'ipad']
const APPLE_DESKTOP_MODELS = ['macintosh', 'mac']
const ANDROID_BRANDS = [
  'pixel',
  'nexus',
  'samsung',
  'galaxy',
  'oneplus',
  'xiaomi',
  'redmi',
  'poco',
  'huawei',
  'honor',
  'oppo',
  'vivo',
  'realme',
  'moto',
  'nokia',
  'xperia',
  'asus',
  'zenfone',
  'lenovo',
]

export const resolveDeviceModelDevicon = (device?: string) => {
  if (matchToken(device, APPLE_MOBILE_MODELS)) return 'ios'
  if (matchToken(device, APPLE_DESKTOP_MODELS)) return 'macos'
  if (matchToken(device, ANDROID_BRANDS)) return 'android-original'
  return null
}

export const formatBrowserLabel = (browser?: string, browserVersion?: string) =>
  [browser, browserVersion].filter(Boolean).join(' ')

export const formatOsLabel = (os?: string, osVersion?: string) => [os, osVersion].filter(Boolean).join(' ')

export const formatPlatformPrimary = (browser?: string, os?: string) => [browser, os].filter(Boolean).join(' · ')

export const formatPlatformDetail = (browser?: string, browserVersion?: string, os?: string, osVersion?: string) =>
  [formatBrowserLabel(browser, browserVersion), formatOsLabel(os, osVersion)].filter(Boolean).join(' · ')

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

const isGenericDeviceLabel = (label: string) => label === 'Mobile' || label === 'Desktop'

type PlatformParts = {
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device?: string
}

export const formatPlatformStackPrimary = ({ browser, os, device }: PlatformParts) => {
  const deviceName = device?.trim()
  if (deviceName && !isGenericDeviceLabel(deviceName)) return deviceName

  const browserName = browser?.trim()
  if (browserName) return browserName

  const osName = os?.trim()
  if (osName) return osName

  const fallbackDevice = formatDeviceLabel(device, os)
  return fallbackDevice || ''
}

export const formatPlatformStackDetail = ({ browser, browserVersion, os, osVersion, device }: PlatformParts) =>
  [formatBrowserLabel(browser, browserVersion), formatOsLabel(os, osVersion), formatDeviceLabel(device, os)]
    .filter(Boolean)
    .join(' · ')
