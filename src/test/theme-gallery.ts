import { fireEvent, screen, within } from '@testing-library/react'

// Reading and driving the theme gallery from a test.

export const themeList = () => screen.getByRole('group', { name: 'Theme list' })
export const tile = (name: string | RegExp) => within(themeList()).getByRole('button', { name })
export const findTile = (name: string | RegExp) => within(themeList()).findByRole('button', { name })
export const tileNames = () =>
  [...themeList().querySelectorAll('button[aria-pressed][aria-expanded]')].map(button =>
    button.getAttribute('aria-label'),
  )
export const panel = () => screen.getByRole('region', { name: /details$/ })

/** Opens a theme's panel, unless it's open. */
export const openTheme = async (name: string | RegExp) => {
  const button = await findTile(name)
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button)
}

export const applyTheme = async (name: string | RegExp, label = 'Use this theme') => {
  await openTheme(name)
  fireEvent.click(within(panel()).getByRole('button', { name: label }))
}
