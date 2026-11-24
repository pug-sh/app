import { render } from '@testing-library/react'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { tolerateTranslatedText } from './translated-text'

const { insertBefore, removeChild } = Node.prototype
beforeAll(tolerateTranslatedText)
afterAll(() => Object.assign(Node.prototype, { insertBefore, removeChild }))

// What a page translator does: each text node is swapped for a <font> holding the translation.
const translate = (root: Element) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  while (walker.nextNode()) texts.push(walker.currentNode as Text)
  for (const text of texts) {
    const font = document.createElement('font')
    font.textContent = text.data
    text.replaceWith(font)
  }
}

it('mounts a spinner beside a translated label', () => {
  const Label = ({ loading }: { loading: boolean }) => (
    <button type="button">
      {loading ? <svg className="animate-spin" /> : <span />}
      Continue with Google
    </button>
  )
  const { container, rerender } = render(<Label loading={false} />)
  translate(container)

  rerender(<Label loading />)

  expect(container.querySelector('button .animate-spin')).not.toBeNull()
})

it('removes text a translator has replaced', () => {
  const Note = ({ saved }: { saved: boolean }) => (
    <p>
      {saved && 'Saved'}
      <b>!</b>
    </p>
  )
  const { container, rerender } = render(<Note saved />)
  translate(container)

  rerender(<Note saved={false} />)

  expect(container.querySelector('b')).not.toBeNull()
})

it('leaves calls on real children alone', () => {
  const p = document.createElement('p')
  const b = p.appendChild(document.createElement('b'))
  const i = document.createElement('i')
  expect(p.insertBefore(i, b)).toBe(i)
  expect(p.insertBefore(document.createElement('u'), null)).toBe(p.lastChild)
  expect([...p.childNodes].map(node => node.nodeName)).toEqual(['I', 'B', 'U'])
  expect(p.removeChild(b)).toBe(b)
  expect(b.parentNode).toBeNull()
})
