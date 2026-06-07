import twemoji from 'twemoji'

const TWEMOJI_BASE = '/twemoji/'

export const TILE_ICON_EMOJIS = ['📈', '📊', '📉', '🆕', '🎯', '⚡', '🚀', '✨', '🔥', '💡'] as const

const BUNDLED_TWEMOJI = new Set<string>(TILE_ICON_EMOJIS)

export const usesTwemoji = (emoji: string) => BUNDLED_TWEMOJI.has(emoji)

export const twemojiSrc = (emoji: string) => {
  const codePoint = twemoji.convert.toCodePoint(emoji)
  return `${TWEMOJI_BASE}${codePoint}.svg`
}

export const isCountryCode = (value: string | undefined): value is string => !!value && /^[A-Za-z]{2}$/.test(value)

export const countryCodeToFlag = (iso: string) =>
  String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))

export const twemojiFlagSrc = (iso: string) => {
  const codePoint = twemoji.convert.toCodePoint(countryCodeToFlag(iso))
  return `${TWEMOJI_BASE}flags/${codePoint}.svg`
}
