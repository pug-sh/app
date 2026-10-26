import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { knownPropertyValues } from '@/lib/property-values'
import { MultiValueEditor, SingleValueEditor } from './value-editors'

const optionTexts = (container: HTMLElement = document.body) =>
  within(container)
    .queryAllByRole('option')
    .map(option => option.textContent)

const multi = (props: Partial<React.ComponentProps<typeof MultiValueEditor>> = {}) => {
  const handlers = { onAdd: vi.fn(), onRemove: vi.fn(), onToggle: vi.fn() }
  render(
    <MultiValueEditor
      property="$country"
      values={[]}
      suggestions={['US', 'IN']}
      loaded
      error={false}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

const Single = ({
  property = '$country',
  initial = '',
  onChange,
}: {
  property?: string
  initial?: string
  onChange: (value: string) => void
}) => {
  const [value, setValue] = useState(initial)
  return (
    <SingleValueEditor
      property={property}
      value={value}
      onChange={next => {
        setValue(next)
        onChange(next)
      }}
      onCommit={() => {}}
      suggestions={['IN']}
      loaded
      error={false}
    />
  )
}

const singleInput = () => screen.getByPlaceholderText<HTMLInputElement>('Type a value...')

describe('MultiValueEditor on $country', () => {
  it('lists countries seen recently by name, then every other country', () => {
    multi()
    const seen = screen.getByText('Seen recently').parentElement as HTMLElement
    expect(optionTexts(seen)).toEqual(['IndiaIN', 'United StatesUS'])
    expect(optionTexts()).toContain('GermanyDE')
    expect(optionTexts()).toHaveLength(knownPropertyValues('$country').length)
  })

  it('still lists every country when the seen values fail to load, and says they did', () => {
    multi({ suggestions: [], error: true })
    expect(screen.getByText('Failed to load recent values')).toBeTruthy()
    expect(optionTexts()).toHaveLength(knownPropertyValues('$country').length)
  })

  it('toggles the code of the country picked', () => {
    const { onToggle } = multi()
    fireEvent.click(screen.getByText('India'))
    expect(onToggle).toHaveBeenCalledWith('IN')
  })

  it('finds a country searched without its accents', () => {
    multi()
    fireEvent.change(screen.getByPlaceholderText('Search values...'), { target: { value: 'curacao' } })
    expect(optionTexts()[0]).toBe('CuraçaoCW')
  })

  it('adds typed names as codes', () => {
    const { onAdd } = multi()
    const input = screen.getByPlaceholderText('Type value, Enter/comma to add')
    fireEvent.change(input, { target: { value: 'germany, uk, Atlantis' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith(['DE', 'GB', 'Atlantis'])
  })

  it('adds names from the Add button too, skipping empty entries', () => {
    const { onAdd } = multi()
    fireEvent.change(screen.getByPlaceholderText('Type value, Enter/comma to add'), {
      target: { value: 'germany, , uk,' },
    })
    fireEvent.click(screen.getByText('Add'))
    expect(onAdd).toHaveBeenCalledWith(['DE', 'GB'])
  })

  it('shows selected codes by name', () => {
    multi({ values: ['DE'] })
    expect(screen.getByTitle('DE').textContent).toBe('Germany')
  })

  it('lists nothing until the seen values land, so the list never reshuffles', () => {
    multi({ loaded: false })
    expect(optionTexts()).toEqual([])
    expect(screen.getByText('Loading...')).toBeTruthy()
  })
})

describe('MultiValueEditor on an unlabelled property', () => {
  it('keeps raw values in the order they came, ungrouped, and adds typed text as is', () => {
    const { onAdd } = multi({ property: '$browser', suggestions: ['Firefox', 'Chrome'] })
    expect(screen.queryByText('Seen recently')).toBeNull()
    expect(optionTexts()).toEqual(['Firefox', 'Chrome'])

    const input = screen.getByPlaceholderText('Type value, Enter/comma to add')
    fireEvent.change(input, { target: { value: 'chrome' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith(['chrome'])
  })
})

describe('SingleValueEditor on $country', () => {
  it('shows a picked country by name and stores its code', () => {
    const onChange = vi.fn()
    render(<Single onChange={onChange} />)
    fireEvent.click(screen.getByText('India'))
    expect(onChange).toHaveBeenLastCalledWith('IN')
    expect(singleInput().value).toBe('India')
  })

  it('stores the code typed text resolves to, but keeps showing the text', () => {
    const onChange = vi.fn()
    render(<Single onChange={onChange} />)
    fireEvent.change(singleInput(), { target: { value: 'japan' } })
    expect(onChange).toHaveBeenLastCalledWith('JP')
    expect(singleInput().value).toBe('japan')

    fireEvent.change(singleInput(), { target: { value: 'jap' } })
    expect(onChange).toHaveBeenLastCalledWith('jap')
    expect(singleInput().value).toBe('jap')
  })

  it('opens on a stored code by name', () => {
    render(<Single initial="DE" onChange={vi.fn()} />)
    expect(singleInput().value).toBe('Germany')
  })
})

describe('SingleValueEditor on $locale', () => {
  // A language name can't be typed back into its tag, so editing one would store the name.
  it('opens on the tag, not its name', () => {
    const onChange = vi.fn()
    render(<Single property="$locale" initial="en-US" onChange={onChange} />)
    expect(singleInput().value).toBe('en-US')
    fireEvent.change(singleInput(), { target: { value: 'en-GB' } })
    expect(onChange).toHaveBeenLastCalledWith('en-GB')
  })
})
