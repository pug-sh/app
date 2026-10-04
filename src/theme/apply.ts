import type { CompiledTheme } from './compile'
import { TOKENS } from './tokens'

// Puts a compiled theme on <html>: the .dark class every `dark:` variant keys on, the data-theme
// attribute the generated built-in blocks select, and — for an installed theme only — every token as
// an inline variable, which beats any stylesheet selector. Inline variables are cleared first, so a
// switch back to a built-in hands control back to the stylesheet, including any the first-paint
// script set before React loaded.
export const applyCompiledTheme = (theme: CompiledTheme, root: HTMLElement = document.documentElement) => {
  root.classList.toggle('dark', theme.polarity === 'dark')
  if (theme.builtin && theme.id !== 'pug') root.setAttribute('data-theme', theme.id)
  else root.removeAttribute('data-theme')
  for (const token of TOKENS) root.style.removeProperty(`--${token}`)
  if (!theme.builtin) {
    for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value)
  }
}
