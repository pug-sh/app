const OverviewSectionHeader = ({
  title,
  description,
  count,
}: {
  title: string
  description?: string
  count?: string | number
}) => (
  <div className="flex items-baseline justify-between gap-4">
    <div className="min-w-0">
      <h2 className="text-lg font-medium tracking-tight text-foreground">{title}</h2>
      {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
    </div>
    {count !== undefined ? (
      <span className="shrink-0 text-xs text-muted-foreground/70 tabular-nums">{count}</span>
    ) : null}
  </div>
)

export default OverviewSectionHeader
