// Self-hosted browser/OS marks. Provenance and licensing for every file: public/brands/NOTICE.md.
//
// This object is the single source of truth for both the names and the paths, so the two cannot
// drift — adding a brand is one entry. It does not prove the path resolves: public/ is copied
// verbatim and never enters the module graph, so a typo is a silent 404. brand-icon-assets.test.ts
// is what checks that.
export const BRAND_ICON_ASSETS = {
  android: '/brands/android.svg',
  brave: '/brands/brave.svg',
  chrome: '/brands/chrome.svg',
  chromium: '/brands/chromium.svg',
  // The one raster: Coc Coc publishes no SVG, and the only vector is CC BY-SA.
  coccoc: '/brands/coccoc.png',
  duckduckgo: '/brands/duckduckgo.svg',
  edge: '/brands/edge.svg',
  firefox: '/brands/firefox.svg',
  ios: '/brands/ios.svg',
  linux: '/brands/linux.svg',
  macos: '/brands/macos.svg',
  opera: '/brands/opera.svg',
  safari: '/brands/safari.svg',
  'samsung-internet': '/brands/samsung-internet.svg',
  uc: '/brands/uc.svg',
  vivaldi: '/brands/vivaldi.svg',
  windows: '/brands/windows.svg',
  yandex: '/brands/yandex.svg',
} as const

export type BrandIconName = keyof typeof BRAND_ICON_ASSETS

export const brandIconSrc = (name: BrandIconName) => BRAND_ICON_ASSETS[name]
