import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GetFilterSchemaResponseSchema,
  PropertySource,
  PropertyValueType,
} from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'

const { getPropertyValues } = vi.hoisted(() => ({ getPropertyValues: vi.fn() }))
const { testHeaders } = await vi.hoisted(async () => {
  const { atom } = await import('jotai')
  return { testHeaders: atom({ 'x-project-id': 'p1' }) }
})
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ getPropertyValues }) }
})
vi.mock('@/data/workspace.atoms', () => ({ projectHeaderAtom: testHeaders }))

const { FilterBuilder } = await import('./filter-builder')
const { FilterChip } = await import('./filter-chip')
const { createFilter } = await import('./filter-model')

const country = (operator: FilterOperator, value: string | string[]) =>
  createFilter('$country', PropertySource.AUTO, operator, value)

const chip = (filter: ReturnType<typeof country>) => {
  const onUpdate = vi.fn()
  render(
    <Provider>
      <FilterChip filter={filter} onRemove={vi.fn()} onUpdate={onUpdate} />
    </Provider>,
  )
  return onUpdate
}

const trigger = (text: string) => screen.getByText(text).closest('button') as HTMLElement

beforeEach(() => {
  getPropertyValues.mockResolvedValue({ values: ['IN'] })
})

describe('between and not between on a number property', () => {
  const schema = create(GetFilterSchemaResponseSchema, {
    customPropertyKeys: [{ name: 'amount', valueType: PropertyValueType.INTEGER }],
  })

  const openRange = async (operator: string) => {
    const onAdd = vi.fn()
    render(
      <Provider>
        <FilterBuilder schema={schema} schemaError={null} onAdd={onAdd} />
      </Provider>,
    )
    fireEvent.click(screen.getByText('Filter'))
    fireEvent.click(await screen.findByText('amount'))
    fireEvent.click(screen.getByText(operator))
    return onAdd
  }

  const type = (min: string, max: string) => {
    fireEvent.change(screen.getByPlaceholderText('Min'), { target: { value: min } })
    fireEvent.change(screen.getByPlaceholderText('Max'), { target: { value: max } })
  }

  const apply = () => screen.getByText('Apply').closest('button') as HTMLButtonElement

  const marked = () => ({
    min: screen.getByPlaceholderText('Min').getAttribute('aria-invalid'),
    max: screen.getByPlaceholderText('Max').getAttribute('aria-invalid'),
  })

  it.each(['between', 'not between'])('holds back a backwards %s range until it is fixed', async operator => {
    const onAdd = await openRange(operator)
    type('10', '5')
    expect(screen.getByText("Min can't be above max")).toBeTruthy()
    expect(marked()).toEqual({ min: 'true', max: 'true' })
    const hint = screen.getByText("Min can't be above max")
    expect(hint.id).not.toBe('')
    expect(screen.getByPlaceholderText('Min').getAttribute('aria-describedby')).toBe(hint.id)
    expect(screen.getByPlaceholderText('Max').getAttribute('aria-describedby')).toBe(hint.id)
    expect(apply().disabled).toBe(true)

    fireEvent.keyDown(screen.getByPlaceholderText('Max'), { key: 'Enter' })
    fireEvent.click(apply())
    expect(onAdd).not.toHaveBeenCalled()

    type('5', '10')
    expect(screen.queryByText("Min can't be above max")).toBeNull()
    expect(marked()).toEqual({ min: null, max: null })
    expect(screen.getByPlaceholderText('Min').getAttribute('aria-describedby')).toBeNull()
    expect(screen.getByPlaceholderText('Max').getAttribute('aria-describedby')).toBeNull()
    expect(apply().disabled).toBe(false)
    fireEvent.click(apply())
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 'range', min: '5', max: '10' }))
  })

  it.each(['between', 'not between'])('holds back a non-numeric %s range', async operator => {
    const onAdd = await openRange(operator)
    type('abc', '5')
    expect(screen.getByText('Enter valid numbers')).toBeTruthy()
    expect(marked()).toEqual({ min: 'true', max: 'false' })
    expect(apply().disabled).toBe(true)
    fireEvent.keyDown(screen.getByPlaceholderText('Max'), { key: 'Enter' })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('accepts a range whose ends are equal', async () => {
    const onAdd = await openRange('between')
    type('5', '5')
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(apply())
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 'range', min: '5', max: '5' }))
  })

  it('shows no hint while a bound is still empty', async () => {
    await openRange('between')
    type('5', '')
    expect(screen.queryByRole('status')).toBeNull()
    expect(apply().disabled).toBe(true)
  })
})

describe('FilterChip editing a range', () => {
  const amount = (operator: FilterOperator) => createFilter('amount', PropertySource.CUSTOM, operator, ['1', '5'])

  const edit = (min: string, max: string) => {
    fireEvent.click(trigger('1 – 5'))
    fireEvent.change(screen.getByPlaceholderText('Min'), { target: { value: min } })
    fireEvent.change(screen.getByPlaceholderText('Max'), { target: { value: max } })
  }

  const apply = () => screen.getByText('Apply').closest('button') as HTMLButtonElement

  it.each([
    ['between', FilterOperator.BETWEEN],
    ['not between', FilterOperator.NOT_BETWEEN],
  ])('refuses to save a backwards range on %s', (_label, operator) => {
    const onUpdate = chip(amount(operator))
    edit('9', '2')
    expect(screen.getByText("Min can't be above max")).toBeTruthy()
    expect(apply().disabled).toBe(true)
    fireEvent.keyDown(screen.getByPlaceholderText('Max'), { key: 'Enter' })
    fireEvent.click(apply())
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('refuses to save a non-numeric range', () => {
    const onUpdate = chip(amount(FilterOperator.BETWEEN))
    edit('1', 'abc')
    expect(screen.getByText('Enter valid numbers')).toBeTruthy()
    expect(screen.getByPlaceholderText('Min').getAttribute('aria-invalid')).toBe('false')
    expect(screen.getByPlaceholderText('Max').getAttribute('aria-invalid')).toBe('true')
    fireEvent.keyDown(screen.getByPlaceholderText('Max'), { key: 'Enter' })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('saves a corrected range', () => {
    const onUpdate = chip(amount(FilterOperator.BETWEEN))
    edit('9', '2')
    fireEvent.change(screen.getByPlaceholderText('Max'), { target: { value: '12' } })
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(apply())
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'range', min: '9', max: '12' }))
  })
})

const NUMBER_OPERATORS = [
  ['greater than', FilterOperator.GT],
  ['greater or equal', FilterOperator.GTE],
  ['less than', FilterOperator.LT],
  ['less or equal', FilterOperator.LTE],
] as const

describe('greater/less operators on a number property', () => {
  const schema = create(GetFilterSchemaResponseSchema, {
    customPropertyKeys: [{ name: 'amount', valueType: PropertyValueType.INTEGER }],
  })

  const openValue = async (operator: string) => {
    const onAdd = vi.fn()
    render(
      <Provider>
        <FilterBuilder schema={schema} schemaError={null} onAdd={onAdd} />
      </Provider>,
    )
    fireEvent.click(screen.getByText('Filter'))
    fireEvent.click(await screen.findByText('amount'))
    fireEvent.click(screen.getByText(operator))
    return onAdd
  }

  const input = () => screen.getByPlaceholderText<HTMLInputElement>('Type a value...')
  const apply = () => screen.getByText('Apply').closest('button') as HTMLButtonElement

  it.each(NUMBER_OPERATORS)('holds back a non-numeric value on %s until it is fixed', async (label, operator) => {
    const onAdd = await openValue(label)
    fireEvent.change(input(), { target: { value: 'abc' } })
    expect(screen.getByText('Enter a valid number')).toBeTruthy()
    expect(input().getAttribute('aria-invalid')).toBe('true')
    const hint = screen.getByText('Enter a valid number')
    expect(hint.id).not.toBe('')
    expect(input().getAttribute('aria-describedby')).toBe(hint.id)
    expect(apply().disabled).toBe(true)

    fireEvent.keyDown(input(), { key: 'Enter' })
    fireEvent.click(apply())
    expect(onAdd).not.toHaveBeenCalled()

    fireEvent.change(input(), { target: { value: ' 12.5 ' } })
    expect(screen.queryByRole('status')).toBeNull()
    expect(input().getAttribute('aria-describedby')).toBeNull()
    expect(apply().disabled).toBe(false)
    fireEvent.click(apply())
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 'single', operator, value: '12.5' }))
  })

  it('shows no hint while the value is still empty', async () => {
    await openValue('greater than')
    expect(screen.queryByRole('status')).toBeNull()
    expect(apply().disabled).toBe(true)
  })

  // The popover repositions when it grows, so the list gives up the hint's height while the hint shows.
  const list = () => document.querySelector('[data-slot="command-list"]') as HTMLElement

  it('shortens the list by the hint height only while the hint shows, so the popover keeps its height', async () => {
    await openValue('greater than')
    expect(list().className).toContain('max-h-72')

    fireEvent.change(input(), { target: { value: 'abc' } })
    expect(list().className).toContain('max-h-[calc(18rem-1.375rem)]')
    expect(list().className).not.toContain('max-h-72')

    fireEvent.change(input(), { target: { value: '5' } })
    expect(list().className).toContain('max-h-72')
    expect(list().className).not.toContain('max-h-[calc(18rem-1.375rem)]')
  })

  it('still takes any text on a text operator', async () => {
    const onAdd = await openValue('equals')
    fireEvent.change(input(), { target: { value: 'abc' } })
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(apply())
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 'single', value: 'abc' }))
  })
})

describe('FilterChip editing a greater/less value', () => {
  const amount = (operator: FilterOperator) => createFilter('amount', PropertySource.CUSTOM, operator, '5')

  const edit = (value: string) => {
    fireEvent.click(trigger('5'))
    fireEvent.change(screen.getByPlaceholderText('Type a value...'), { target: { value } })
  }

  const apply = () => screen.getByText('Apply').closest('button') as HTMLButtonElement

  it.each(NUMBER_OPERATORS)('refuses to save a non-numeric value on %s', (_label, operator) => {
    const onUpdate = chip(amount(operator))
    edit('abc')
    expect(screen.getByText('Enter a valid number')).toBeTruthy()
    expect(screen.getByPlaceholderText('Type a value...').getAttribute('aria-invalid')).toBe('true')
    const hint = screen.getByText('Enter a valid number')
    expect(hint.id).not.toBe('')
    expect(screen.getByPlaceholderText('Type a value...').getAttribute('aria-describedby')).toBe(hint.id)
    expect(apply().disabled).toBe(true)
    fireEvent.keyDown(screen.getByPlaceholderText('Type a value...'), { key: 'Enter' })
    fireEvent.click(apply())
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('saves a corrected value', () => {
    const onUpdate = chip(amount(FilterOperator.GT))
    edit('abc')
    fireEvent.change(screen.getByPlaceholderText('Type a value...'), { target: { value: '9' } })
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(apply())
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'single', value: '9' }))
  })
})

describe('FilterBuilder on $country', () => {
  const schema = create(GetFilterSchemaResponseSchema, {
    autoPropertyKeys: [{ name: '$country', valueType: PropertyValueType.STRING }],
  })

  const openValueStep = async (operator: string) => {
    const onAdd = vi.fn()
    render(
      <Provider>
        <FilterBuilder schema={schema} schemaError={null} onAdd={onAdd} />
      </Provider>,
    )
    fireEvent.click(screen.getByText('Filter'))
    fireEvent.click(await screen.findByText('$country'))
    fireEvent.click(screen.getByText(operator))
    return onAdd
  }

  it('adds a list filter on the codes typed names resolve to, once each', async () => {
    const onAdd = await openValueStep('in')
    const input = await screen.findByPlaceholderText('Type value, Enter/comma to add')
    fireEvent.change(input, { target: { value: 'india, uk, in' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByText('Apply'))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ property: '$country', values: ['IN', 'GB'] }))
  })

  it('adds a single filter on the code a typed name resolves to', async () => {
    const onAdd = await openValueStep('equals')
    fireEvent.change(await screen.findByPlaceholderText('Type a value...'), { target: { value: 'germany' } })
    fireEvent.click(screen.getByText('Apply'))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ property: '$country', value: 'DE' }))
  })
})

describe('FilterChip on $country', () => {
  it('names the codes a list filter holds and adds typed names as codes', async () => {
    const onUpdate = chip(country(FilterOperator.IN, ['IN', 'US']))
    fireEvent.click(screen.getByText('India, United States'))
    const input = await screen.findByPlaceholderText('Type value, Enter/comma to add')
    fireEvent.change(input, { target: { value: 'germany, in' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ values: ['IN', 'US', 'DE'] }))
  })

  it('shows a list as stored unless every value is named', () => {
    chip(country(FilterOperator.IN, ['IN', 'Narnia']))
    expect(trigger('India, Narnia').className).toContain('font-mono')
  })

  it('edits a single filter by name and stores the code', async () => {
    const onUpdate = chip(country(FilterOperator.EQUALS, 'IN'))
    expect(trigger('India').className).not.toContain('font-mono')
    fireEvent.click(screen.getByText('India'))
    const input = await screen.findByPlaceholderText<HTMLInputElement>('Type a value...')
    expect(input.value).toBe('India')
    fireEvent.change(input, { target: { value: 'japan' } })
    fireEvent.click(screen.getByText('Apply'))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ value: 'JP' }))
  })

  // A name stored before typed text resolved, or a typo: it matches nothing, so it mustn't read as a name.
  it('shows a value it cannot name as stored, and resolves it on Apply', async () => {
    const onUpdate = chip(country(FilterOperator.EQUALS, 'India'))
    expect(trigger('India').className).toContain('font-mono')
    fireEvent.click(screen.getByText('India'))
    fireEvent.click(await screen.findByText('Apply'))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ value: 'IN' }))
  })
})
