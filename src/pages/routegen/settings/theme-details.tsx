import type { ThemeFamily } from '@/theme/format'
import { formatCreated } from '@/theme/metadata'

// Who made a theme and when, and what it is: "Clay · by Pug · created Oct 2026 · themes.pug.sh".
const ThemeDetails = ({ family, source, name }: { family: ThemeFamily; source: string; name?: string }) => {
  const byline = [
    family.author && `by ${family.author}`,
    family.created && `created ${formatCreated(family.created)}`,
    source,
  ].filter(Boolean)
  return (
    <div className="space-y-0.5">
      <p className="text-sm">
        <span className="font-medium">{name ?? family.name}</span>
        <span className="text-muted-foreground"> · {byline.join(' · ')}</span>
      </p>
      {family.description && <p className="text-xs text-muted-foreground">{family.description}</p>}
    </div>
  )
}

export default ThemeDetails
