import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'
import { buildTemplateContext, TILE_TEMPLATES } from './templates'

const schemaWith = (...events: [string, number][]) =>
  create(GetFilterSchemaResponseSchema, { events: events.map(([name, count]) => ({ name, count: BigInt(count) })) })

const offered = (ctx: ReturnType<typeof buildTemplateContext>) =>
  TILE_TEMPLATES.filter(template => template.isAvailable?.(ctx) ?? true).map(template => template.id)

describe('crawler tile templates', () => {
  it('are offered only to a project that reports crawler requests', () => {
    const withoutRequests = offered(buildTemplateContext(schemaWith(['page_view', 10])))
    expect(withoutRequests).not.toContain('crawler-requests')
    expect(withoutRequests).not.toContain('top-crawlers')

    const ctx = buildTemplateContext(schemaWith(['page_view', 10], ['crawler_request', 5]))
    expect(offered(ctx)).toEqual(expect.arrayContaining(['crawler-requests', 'top-crawlers']))
  })

  // With bots excluded, a tile on crawler requests reads nothing.
  it('build tiles that include bots', () => {
    const ctx = buildTemplateContext(schemaWith(['crawler_request', 5]))
    for (const id of ['crawler-requests', 'top-crawlers']) {
      const content = TILE_TEMPLATES.find(template => template.id === id)?.build(ctx).content
      expect(content?.case === 'insight' && content.value.spec?.includeBots).toBe(true)
    }
  })

  // The funnel scaffold falls back to the busiest events, which would seed a people funnel with a bot-only event.
  it('keep crawler requests out of the busiest events', () => {
    expect(buildTemplateContext(schemaWith(['crawler_request', 900], ['signup', 4])).topEventKinds).toEqual(['signup'])
  })
})
