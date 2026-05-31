const OverviewSectionHeader = ({ title, count }: { title: string; count?: string | number }) => (
  <div className="flex items-center gap-2">
    <span className="border-l-2 border-border pl-2.5 text-[13px] font-medium text-foreground">{title}</span>
    <div className="h-px flex-1 bg-border" />
    {count !== undefined ? <span className="text-[11px] text-muted-foreground/70">{count}</span> : null}
  </div>
)

export default OverviewSectionHeader
