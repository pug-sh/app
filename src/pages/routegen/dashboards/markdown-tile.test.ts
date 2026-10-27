import { describe, expect, it } from 'vitest'
import { renderMarkdownTileHTML } from './tiles'

// The sink feeds dangerouslySetInnerHTML and also renders on the public /shared route, so a tile
// body is attacker-controlled markup. Only http(s)/mailto links may survive.
describe('renderMarkdownTileHTML', () => {
  it('keeps ordinary http(s) and mailto links intact', () => {
    expect(renderMarkdownTileHTML('[docs](https://pug.sh/docs)')).toContain('href="https://pug.sh/docs"')
    expect(renderMarkdownTileHTML('[x](http://example.com)')).toContain('href="http://example.com"')
    expect(renderMarkdownTileHTML('[mail](mailto:team@pug.sh)')).toContain('href="mailto:team@pug.sh"')
  })

  it('leaves relative and anchor links alone', () => {
    expect(renderMarkdownTileHTML('[rel](/overview)')).toContain('href="/overview"')
    expect(renderMarkdownTileHTML('[a](#section)')).toContain('href="#section"')
  })

  it('neutralizes a plain javascript: scheme', () => {
    expect(renderMarkdownTileHTML('[x](javascript:alert(1))')).not.toContain('javascript:')
  })

  it('neutralizes a scheme split by a tab that the browser would strip before dispatch', () => {
    const out = renderMarkdownTileHTML('[x](java\tscript:alert(1))')
    expect(out.replace(/[\u0000-\u001f]/g, '')).not.toContain('javascript:')
    expect(out).toContain('href="#"')
  })

  it('neutralizes a scheme split by a newline that also breaks a line-bound attribute match', () => {
    const out = renderMarkdownTileHTML('[x](java\nscript:alert(1))')
    expect(out.replace(/[\u0000-\u001f]/g, '')).not.toContain('javascript:')
  })

  it('neutralizes a scheme hidden behind a leading control character', () => {
    const out = renderMarkdownTileHTML('[x](\u0001javascript:alert(1))')
    expect(out.replace(/[\u0000-\u001f]/g, '')).not.toContain('javascript:')
  })

  it('neutralizes data: and vbscript: in an image src', () => {
    expect(renderMarkdownTileHTML('![x](data:text/html,<script>)')).not.toContain('data:text/html')
    expect(renderMarkdownTileHTML('![x](vbscript:msgbox)')).not.toContain('vbscript:')
  })
})
