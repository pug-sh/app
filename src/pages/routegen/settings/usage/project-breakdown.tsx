import SectionHeader from '@/components/section-header'
import type { SeriesColor } from '@/lib/event-colors'
import { cn } from '@/lib/utils'
import { OTHERS_LABEL, type ProjectTotal } from './usage-helpers'

const ProjectBreakdown = ({
  projectTotals,
  windowTotal,
  colors,
}: {
  projectTotals: ProjectTotal[]
  windowTotal: number
  colors: SeriesColor[]
}) => {
  if (projectTotals.length === 0) return null

  const folded = projectTotals.filter(p => p.seriesIndex === null).length
  let description = 'Over the selected window.'
  if (folded === 1) {
    description = `Over the selected window. The smallest is charted inside “${OTHERS_LABEL}”.`
  } else if (folded > 1) {
    description = `Over the selected window. The smallest ${folded} are charted together as “${OTHERS_LABEL}”.`
  }

  // A project with events should never read as a share indistinguishable from none, and toFixed(1)
  // rounds anything under 0.05% to "0.0%".
  const share = (total: number) => {
    if (windowTotal <= 0) return '—'
    const pct = (total / windowTotal) * 100
    if (pct > 0 && pct < 0.05) return '<0.1%'
    return `${pct.toFixed(1)}%`
  }

  return (
    <section>
      <SectionHeader title="By project" count={projectTotals.length} description={description} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <th className="pb-2 text-left font-medium">Project</th>
            <th className="pb-2 text-right font-medium">Events</th>
            <th className="pb-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {projectTotals.map(project => {
            // Read off the row, not its position: the two disagree the moment this table is sorted
            // or filtered, and a mismatch shows only as a wrong colour, which nobody audits.
            // Neutral past the charted set — the one spare hue belongs to the folded band and would
            // read as this row being that series.
            const color = project.seriesIndex === null ? undefined : colors[project.seriesIndex]
            return (
              <tr key={project.projectId} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn('size-2 shrink-0 rounded-full', !color && 'bg-faint')}
                      style={color && { backgroundColor: color.line }}
                    />
                    <span className="truncate">{project.name}</span>
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{project.total.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{share(project.total)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

export default ProjectBreakdown
