import { paintKey } from './builtin'
import type { CompiledTheme } from './compile'
import { TOKENS } from './tokens'

// Puts a compiled theme on <html>: the .dark class every `dark:` variant keys on, the data-theme
// attribute the generated built-in blocks select, data-contrast for the sign-in pages, which stay Pug
// under any theme but follow the member's contrast, and, for an installed theme only, every token as
// an inline variable, which beats any stylesheet selector. Inline variables are cleared first, so a
// switch back to a built-in hands control back to the stylesheet, registry tokens the first-paint
// script set before React loaded included.
export const applyCompiledTheme = (theme: CompiledTheme, root: HTMLElement = document.documentElement) => {
  root.classList.toggle('dark', theme.polarity === 'dark')
  const key = theme.builtin ? paintKey(theme) : 'pug'
  if (key !== 'pug') root.setAttribute('data-theme', key)
  else root.removeAttribute('data-theme')
  if (theme.contrast === 'high') root.setAttribute('data-contrast', 'high')
  else root.removeAttribute('data-contrast')
  for (const token of TOKENS) root.style.removeProperty(`--${token}`)
  if (!theme.builtin) {
    for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value)
  }
}
