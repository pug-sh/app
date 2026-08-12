import SectionHeader from '@/components/section-header'
import type { SeriesColor } from '@/lib/event-colors'
import { cn } from '@/lib/utils'
import type { ProjectTotal } from './usage-helpers'

const ProjectBreakdown = ({
  projectTotals,
  windowTotal,
  chartedCount,
  colors,
}: {
  projectTotals: ProjectTotal[]
  windowTotal: number
  chartedCount: number
  colors: SeriesColor[]
}) => {
  if (projectTotals.length === 0) return null

  const folded = projectTotals.length - chartedCount
  let description = 'Over the selected window.'
  if (folded > 0) {
    description = `Over the selected window. The last ${folded} are charted together as one series.`
  }

  return (
    <section>
      <SectionHeader title="By project" count={projectTotals.length} description={description} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <th className="pb-2 text-left font-medium">Project</th>
            <th className="pb-2 text-right font-medium">Events</th>
            <th className="pb-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {projectTotals.map((project, i) => (
            <tr key={project.projectId} className="border-b border-border/50 transition-colors hover:bg-muted/40">
              <td className="py-2">
                <span className="flex items-center gap-2">
                  {/* Neutral past the charted set: the only spare hue is the folded band's, which
                      would read as this row being that series. */}
                  <span
                    className={cn('size-2 shrink-0 rounded-full', i >= chartedCount && 'bg-faint')}
                    style={i < chartedCount ? { backgroundColor: colors[i]?.line } : undefined}
                  />
                  <span className="truncate">{project.name}</span>
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">{project.total.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {windowTotal > 0 ? `${((project.total / windowTotal) * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default ProjectBreakdown
