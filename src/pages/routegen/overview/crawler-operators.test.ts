import { getOption } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import { CrawlerSchema, company } from '@/api/genproto/common/crawlers/v1/crawlers_pb'
import { COMPANY_DOMAINS, crawlerOperator } from './crawler-operators'

describe('crawler operators', () => {
  // The backend's table names the companies; a new one shows a bot glyph until it gets a domain here.
  it('has a logo for every company in the crawler table', () => {
    const companies = new Set(CrawlerSchema.values.map(value => getOption(value, company)).filter(Boolean))
    expect(companies.size).toBeGreaterThan(10)
    expect([...companies].filter(name => !COMPANY_DOMAINS[name])).toEqual([])
  })

  it('names a listed crawler by its operator, and an unknown one by itself', () => {
    expect(crawlerOperator('AhrefsBot', '')).toEqual({ name: 'Ahrefs', domain: 'ahrefs.com' })
    expect(crawlerOperator('yandex.com/bots', '')).toEqual({ name: 'Yandex', domain: 'yandex.com' })
    expect(crawlerOperator('Barkrowler', '')).toEqual({ name: 'Barkrowler' })
    expect(crawlerOperator('GPTBot', 'OpenAI')).toEqual({ name: 'OpenAI', domain: 'openai.com' })
  })
})
