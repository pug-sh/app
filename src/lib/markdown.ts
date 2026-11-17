import snarkdown from 'snarkdown'

// `$` too: snarkdown inserts link URLs with String.replace, where it starts a replacement pattern.
const escapeMarkdownHTML = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('$', '&#36;')

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:'])

const isSafeURL = (url: string) => {
  try {
    return SAFE_PROTOCOLS.has(new URL(url, document.baseURI).protocol)
  } catch {
    return false
  }
}

// snarkdown doesn't sanitize URLs. Checked on the parsed DOM, so text that imitates an attribute can't hide one.
const sanitizeMarkdownHTML = (markup: string, newTab: boolean) => {
  const doc = new DOMParser().parseFromString(markup, 'text/html')
  for (const el of doc.querySelectorAll('[href], [src]')) {
    for (const name of ['href', 'src']) {
      const url = el.getAttribute(name)
      if (url !== null && !isSafeURL(url)) el.removeAttribute(name)
    }
  }
  if (newTab) {
    for (const link of doc.querySelectorAll('a[href]')) {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noreferrer')
    }
  }
  return doc.body.innerHTML
}

export const renderMarkdownHTML = (body: string, { newTab = false } = {}) => {
  const escaped = escapeMarkdownHTML(body)
  try {
    return sanitizeMarkdownHTML(snarkdown(escaped), newTab)
  } catch {
    // snarkdown recurses per nested list item, so a deep enough list overflows the stack: show it as text.
    return escaped
  }
}
