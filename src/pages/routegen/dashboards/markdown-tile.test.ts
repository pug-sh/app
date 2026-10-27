import { describe, expect, it } from 'vitest'
import { renderMarkdownTileHTML } from './tiles'

const parse = (body: string) => new DOMParser().parseFromString(renderMarkdownTileHTML(body), 'text/html')

// null when no link rendered at all, so a body snarkdown didn't parse can't pass as a dropped URL.
const urls = (body: string) => {
  const el = parse(body).querySelector('a, img')
  return el && [el.getAttribute('href'), el.getAttribute('src')].filter(url => url !== null)
}

// Also rendered on the public /shared route, so a tile body is untrusted markup.
describe('renderMarkdownTileHTML', () => {
  it.each([
    'https://pug.sh/docs',
    'http://example.com',
    'HTTPS://PUG.SH',
    'mailto:team@pug.sh',
    'tel:+15550100',
    'sms:+15550100',
    '/overview',
    '#section',
  ])('keeps %s', url => {
    expect(urls(`[x](${url})`)).toEqual([url])
  })

  it.each([
    ['a javascript: link', '[x](javascript:x)'],
    ['a scheme split by a tab', '[x](java\tscript:x)'],
    ['a scheme split by a newline', '[x](java\nscript:x)'],
    ['a scheme behind a control character', '[x](\u0001javascript:x)'],
    ['a scheme behind a space', '[x]( javascript:x)'],
    ['an app deep link', '[x](x-app:open)'],
    ['a data: image', '![x](data:text/html,x)'],
    ['a vbscript: image', '![x](vbscript:x)'],
  ])('drops %s', (_kind, body) => {
    expect(urls(body)).toEqual([])
  })

  it('checks the real attribute when body text imitates one', () => {
    expect(urls("src=' [x](x-app:open) it's")).toEqual([])
  })

  it('keeps a $ in a link URL from copying earlier text into the tag', () => {
    const link = parse('x" title="y [a](z$`)').querySelector('a')
    expect(link?.getAttributeNames()).toEqual(['href'])
    expect(link?.getAttribute('href')).toBe('z$`')
  })
})
