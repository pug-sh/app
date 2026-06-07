import { isMobileOS } from '@/lib/format'

export type DeviconName =
  | 'android-original'
  | 'chrome-original'
  | 'debian-original'
  | 'edge'
  | 'fedora-original'
  | 'firefox-original'
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

  if (matchToken(browser, ['edge', 'edg'])) return 'edge'
  if (matchToken(browser, ['chrome', 'chromium', 'crios'])) return 'chrome-original'
  if (matchToken(browser, ['safari'])) return 'safari-original'
  if (matchToken(browser, ['firefox', 'fxios'])) return 'firefox-original'
  if (matchToken(browser, ['opera', 'opr'])) return 'opera-original'
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
    const apple = resolveAppleDevicon(os)
    if (apple) return apple
    return 'android-original'
  }

  return resolveOsDevicon(os)
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

export const formatPlatformStackPrimary = (
  browser?: string,
  _browserVersion?: string,
  os?: string,
  _osVersion?: string,
  device?: string,
) => {
  const deviceName = device?.trim()
  if (deviceName && !isGenericDeviceLabel(deviceName)) return deviceName

  const browserName = browser?.trim()
  if (browserName) return browserName

  const osName = os?.trim()
  if (osName) return osName

  const fallbackDevice = formatDeviceLabel(device, os)
  return fallbackDevice || ''
}

export const formatPlatformStackDetail = (
  browser?: string,
  browserVersion?: string,
  os?: string,
  osVersion?: string,
  device?: string,
) =>
  [
    formatBrowserLabel(browser, browserVersion),
    formatOsLabel(os, osVersion),
    formatDeviceLabel(device, os),
  ]
    .filter(Boolean)
    .join(' · ')
