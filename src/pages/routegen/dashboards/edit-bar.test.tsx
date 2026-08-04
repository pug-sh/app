import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditBar } from './edit-bar'

const renderEditBar = (gridMode: 'free' | 'columns-12' = 'free') => {
  const onGridModeChange = vi.fn()
  render(
    <EditBar
      dirtyCount={0}
      saving={false}
      gridMode={gridMode}
      onGridModeChange={onGridModeChange}
      onSave={vi.fn()}
      onDiscard={vi.fn()}
    />,
  )
  return onGridModeChange
}

describe('EditBar grid selector', () => {
  it('shows free mode and the 12-column alternative', () => {
    renderEditBar()

    expect(screen.getByRole('button', { name: 'Free' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '12 columns' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('selects the 12-column grid', () => {
    const onGridModeChange = renderEditBar()

    fireEvent.click(screen.getByRole('button', { name: '12 columns' }))

    expect(onGridModeChange).toHaveBeenCalledWith('columns-12')
  })
})
