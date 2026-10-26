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
