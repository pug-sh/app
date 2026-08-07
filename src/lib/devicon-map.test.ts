import { describe, expect, it } from 'vitest'
import { resolveDeviceModelDevicon } from './devicon-map'

describe('resolveDeviceModelDevicon', () => {
  it('maps Apple device families to the Apple glyphs', () => {
    expect(resolveDeviceModelDevicon('iPhone')).toBe('ios')
    expect(resolveDeviceModelDevicon('iPad')).toBe('ios')
    expect(resolveDeviceModelDevicon('Mac')).toBe('macos')
    expect(resolveDeviceModelDevicon('Macintosh')).toBe('macos')
    expect(resolveDeviceModelDevicon('MacBook Pro')).toBe('macos')
    expect(resolveDeviceModelDevicon('Mac mini')).toBe('macos')
    expect(resolveDeviceModelDevicon('iMac')).toBe('macos')
  })

  // 'mac' is short enough to sit inside unrelated UA model strings, and $device is arbitrary
  // customer/bot-supplied text — a wrong glyph is worse than none.
  it('does not read a bare "mac" substring as an Apple desktop', () => {
    expect(resolveDeviceModelDevicon('Machine')).toBeNull()
    expect(resolveDeviceModelDevicon('Mackerel')).toBeNull()
    expect(resolveDeviceModelDevicon('Macropad')).toBeNull()
  })

  it('maps major Android brands to the Android glyph', () => {
    expect(resolveDeviceModelDevicon('Samsung Galaxy S24')).toBe('android-original')
    expect(resolveDeviceModelDevicon('Pixel 8')).toBe('android-original')
    expect(resolveDeviceModelDevicon('OnePlus 12')).toBe('android-original')
    expect(resolveDeviceModelDevicon('Redmi Note 13')).toBe('android-original')
  })

  it('matches Motorola under both its brand spellings', () => {
    expect(resolveDeviceModelDevicon('Moto G54')).toBe('android-original')
    expect(resolveDeviceModelDevicon('Motorola Edge 50')).toBe('android-original')
  })

  // Brand tokens run against arbitrary UA text, so a substring hit brands a Windows laptop as Android.
  // Asus and Lenovo are out of the list entirely — same brand on both an Android phone and a laptop.
  it('does not brand a Windows laptop model as Android', () => {
    expect(resolveDeviceModelDevicon('ASUS VivoBook 15')).toBeNull()
    expect(resolveDeviceModelDevicon('Lenovo ThinkPad X1')).toBeNull()
    expect(resolveDeviceModelDevicon('ASUS ROG Strix G16')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(resolveDeviceModelDevicon('pixel 8')).toBe('android-original')
  })

  it('returns null for unknown models, bots, and blanks', () => {
    expect(resolveDeviceModelDevicon('Spider')).toBeNull()
    expect(resolveDeviceModelDevicon('SmartTV')).toBeNull()
    expect(resolveDeviceModelDevicon('')).toBeNull()
    expect(resolveDeviceModelDevicon(undefined)).toBeNull()
  })
})
