import { Bot, ShieldAlert } from 'lucide-react'
import { CRAWLER_CATEGORY_PROPERTY, CRAWLER_VERIFIED_PROPERTY, type CrawlerIdentity } from '@/lib/crawlers'
import { propertyValueLabel } from '@/lib/property-values'

export const CrawlerLabel = ({ crawler }: { crawler: CrawlerIdentity }) => {
  const { name, company, category, verified } = crawler
  const title = [
    name,
    company,
    category && propertyValueLabel(CRAWLER_CATEGORY_PROPERTY, category),
    verified && propertyValueLabel(CRAWLER_VERIFIED_PROPERTY, verified),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={title}>
      {/* A failed IP check is a request outside the operator's published ranges: likely an impostor. */}
      {verified === 'failed' ? (
        <ShieldAlert size={14} className="shrink-0 text-negative" aria-label="Failed IP check" />
      ) : (
        <Bot size={14} className="shrink-0" aria-hidden />
      )}
      <span className="truncate">{name}</span>
      {company && <span className="truncate text-faint">{company}</span>}
    </span>
  )
}
