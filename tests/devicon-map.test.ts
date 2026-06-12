import { describe, expect, it } from 'bun:test'
import {
  formatDeviceLabel,
  formatPlatformStackDetail,
  formatPlatformStackPrimary,
  isMobileDevice,
  resolveAppleDevicon,
  resolveBrowserDevicon,
  resolveDeviceDevicon,
  resolveOsDevicon,
} from '@/lib/devicon-map'

describe('resolveBrowserDevicon', () => {
  it('detects the common browsers and their iOS variants', () => {
    expect(resolveBrowserDevicon('Safari')).toBe('safari-original')
    expect(resolveBrowserDevicon('Mobile Safari')).toBe('safari-original')
    expect(resolveBrowserDevicon('Chrome')).toBe('chrome-original')
    expect(resolveBrowserDevicon('Chromium')).toBe('chrome-original')
    expect(resolveBrowserDevicon('CriOS')).toBe('chrome-original')
    expect(resolveBrowserDevicon('Firefox')).toBe('firefox-original')
    expect(resolveBrowserDevicon('FxiOS')).toBe('firefox-original')
    expect(resolveBrowserDevicon('Opera')).toBe('opera-original')
    expect(resolveBrowserDevicon('OPR')).toBe('opera-original')
  })

  it('checks Edge before Chrome (the Edge UA also contains "Chrome")', () => {
    expect(resolveBrowserDevicon('Edge')).toBe('edge')
    expect(resolveBrowserDevicon('Microsoft Edge')).toBe('edge')
    expect(resolveBrowserDevicon('Mozilla/5.0 ... Chrome/120 Safari/537 Edg/120')).toBe('edge')
  })

  it('maps Brave to the Chrome glyph (Brave ships no devicon)', () => {
    expect(resolveBrowserDevicon('Brave')).toBe('chrome-original')
  })

  it('returns null for empty, whitespace, or unknown browsers', () => {
    expect(resolveBrowserDevicon(undefined)).toBeNull()
    expect(resolveBrowserDevicon('')).toBeNull()
    expect(resolveBrowserDevicon('   ')).toBeNull()
    expect(resolveBrowserDevicon('Netscape')).toBeNull()
  })
})

describe('resolveAppleDevicon', () => {
  it('disambiguates iOS-family from macOS', () => {
    expect(resolveAppleDevicon('iOS 17')).toBe('ios')
    expect(resolveAppleDevicon('iPadOS')).toBe('ios')
    expect(resolveAppleDevicon('iPhone')).toBe('ios')
    expect(resolveAppleDevicon('macOS 14')).toBe('macos')
    expect(resolveAppleDevicon('Mac OS X')).toBe('macos')
    expect(resolveAppleDevicon('Darwin')).toBe('macos')
  })

  it('returns null for non-Apple OSes', () => {
    expect(resolveAppleDevicon('Windows')).toBeNull()
    expect(resolveAppleDevicon(undefined)).toBeNull()
  })
})

describe('resolveOsDevicon', () => {
  it('detects Windows and Android', () => {
    expect(resolveOsDevicon('Windows 11')).toBe('windows11-original')
    expect(resolveOsDevicon('Win32')).toBe('windows11-original')
    expect(resolveOsDevicon('Android 14')).toBe('android-original')
  })

  it('matches specific Linux distros before generic Linux', () => {
    expect(resolveOsDevicon('Ubuntu')).toBe('ubuntu-original')
    expect(resolveOsDevicon('Debian')).toBe('debian-original')
    expect(resolveOsDevicon('Fedora')).toBe('fedora-original')
    expect(resolveOsDevicon('Linux')).toBe('linux-original')
  })

  it('returns null for empty or unknown OSes', () => {
    expect(resolveOsDevicon(undefined)).toBeNull()
    expect(resolveOsDevicon('SerenityOS')).toBeNull()
  })
})

describe('resolveDeviceDevicon', () => {
  it('resolves Apple devices by their device token even without an OS', () => {
    expect(resolveDeviceDevicon('iPad', undefined)).toBe('ios')
    expect(resolveDeviceDevicon('iPhone', undefined)).toBe('ios')
  })

  it('falls back to Android for generic mobile devices', () => {
    expect(resolveDeviceDevicon('Mobile', 'Android')).toBe('android-original')
    expect(resolveDeviceDevicon('tablet', undefined)).toBe('android-original')
  })

  it('honours an explicit Apple OS', () => {
    expect(resolveDeviceDevicon('iPhone', 'iOS')).toBe('ios')
  })

  it('delegates to the OS icon for non-mobile devices', () => {
    expect(resolveDeviceDevicon('Desktop', 'Windows')).toBe('windows11-original')
  })
})

describe('isMobileDevice', () => {
  it('treats an explicit Desktop device as non-mobile even on a mobile OS', () => {
    expect(isMobileDevice('Desktop', 'Android')).toBe(false)
  })

  it('detects mobile from the device token or the OS', () => {
    expect(isMobileDevice('iPad', undefined)).toBe(true)
    expect(isMobileDevice(undefined, 'Android')).toBe(true)
    expect(isMobileDevice(undefined, 'Windows')).toBe(false)
  })
})

describe('formatDeviceLabel', () => {
  it('prefers a concrete device, else a Mobile/Desktop word from the OS', () => {
    expect(formatDeviceLabel('iPhone 15', 'iOS')).toBe('iPhone 15')
    expect(formatDeviceLabel(undefined, 'Android')).toBe('Mobile')
    expect(formatDeviceLabel(undefined, 'Windows')).toBe('Desktop')
    expect(formatDeviceLabel(undefined, undefined)).toBe('')
  })
})

describe('formatPlatformStackPrimary', () => {
  it('prefers a concrete device name over browser/OS', () => {
    expect(formatPlatformStackPrimary({ browser: 'Safari', os: 'iOS', device: 'iPhone 15' })).toBe('iPhone 15')
  })

  it('skips a generic Mobile/Desktop device label in favour of the browser', () => {
    expect(formatPlatformStackPrimary({ browser: 'Chrome', os: 'Windows', device: 'Desktop' })).toBe('Chrome')
  })

  it('falls back through browser then OS', () => {
    expect(formatPlatformStackPrimary({ os: 'Android' })).toBe('Android')
    expect(formatPlatformStackPrimary({})).toBe('')
  })
})

describe('formatPlatformStackDetail', () => {
  it('joins browser, OS, and device with versions', () => {
    expect(
      formatPlatformStackDetail({
        browser: 'Chrome',
        browserVersion: '120',
        os: 'Windows',
        osVersion: '11',
        device: 'Desktop',
      }),
    ).toBe('Chrome 120 · Windows 11 · Desktop')
  })

  it('omits absent parts', () => {
    expect(formatPlatformStackDetail({ os: 'Android' })).toBe('Android · Mobile')
  })
})
