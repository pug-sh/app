// Logos come from each operator's own site through DomainFavicon, so no trademarked file is bundled.
export const COMPANY_DOMAINS: Record<string, string> = {
  OpenAI: 'openai.com',
  Anthropic: 'anthropic.com',
  Google: 'google.com',
  Microsoft: 'microsoft.com',
  Perplexity: 'perplexity.ai',
  // meta.com serves its mark as an opaque JPEG, a white tile on dark.
  Meta: 'business.facebook.com',
  Apple: 'apple.com',
  Amazon: 'amazon.com',
  ByteDance: 'bytedance.com',
  'Common Crawl': 'commoncrawl.org',
  Mistral: 'mistral.ai',
  'Moonshot AI': 'kimi.ai',
  DuckDuckGo: 'duckduckgo.com',
  Baidu: 'baidu.com',
  'You.com': 'you.com',
  'Allen AI': 'allenai.org',
}

type Operator = { name: string; domain?: string }

// Crawlers from the crawler-user-agents list carry no company, so the common ones are named here, keyed by
// the name ingest records: the list's pattern matched against the entry's own example user agent.
const LISTED_OPERATORS: Record<string, Operator> = {
  AhrefsBot: { name: 'Ahrefs', domain: 'ahrefs.com' },
  SemrushBot: { name: 'Semrush', domain: 'semrush.com' },
  MJ12bot: { name: 'Majestic', domain: 'majestic.com' },
  dotbot: { name: 'Moz', domain: 'moz.com' },
  rogerbot: { name: 'Moz', domain: 'moz.com' },
  DataForSeoBot: { name: 'DataForSEO', domain: 'dataforseo.com' },
  serpstatbot: { name: 'Serpstat', domain: 'serpstat.com' },
  'Screaming Frog SEO Spider': { name: 'Screaming Frog', domain: 'screamingfrog.co.uk' },
  'yandex.com/bots': { name: 'Yandex', domain: 'yandex.com' },
  SeznamBot: { name: 'Seznam', domain: 'seznam.cz' },
  Yeti: { name: 'Naver', domain: 'naver.com' },
  NaverBot: { name: 'Naver', domain: 'naver.com' },
  PetalBot: { name: 'Petal Search', domain: 'petalsearch.com' },
  Qwantbot: { name: 'Qwant', domain: 'qwant.com' },
  Qwantify: { name: 'Qwant', domain: 'qwant.com' },
  Sogou: { name: 'Sogou', domain: 'sogou.com' },
  coccoc: { name: 'Cốc Cốc', domain: 'coccoc.com' },
}

export const crawlerOperator = (agent: string, company: string): Operator => {
  if (company) return { name: company, domain: COMPANY_DOMAINS[company] }
  return LISTED_OPERATORS[agent] ?? { name: agent }
}
