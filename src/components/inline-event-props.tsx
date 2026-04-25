export const InlineEventProps = ({
  headline,
  headlinePairs,
  props,
}: {
  headline: string | null
  headlinePairs: [string, string][]
  props: [string, string][]
}) => {
  if (!headline && headlinePairs.length === 0 && props.length === 0) return null
  return (
    <div className="flex items-center gap-2 overflow-hidden">
      {headline ? (
        <span
          className="text-[11px] font-mono text-foreground whitespace-nowrap"
          title={headlinePairs.map(([k, v]) => `${k}: ${v}`).join(' · ')}
        >
          {headline}
        </span>
      ) : (
        headlinePairs.map(([k, v]) => (
          <span key={k} className="text-[11px] whitespace-nowrap" title={`${k}: ${v}`}>
            <span className="text-muted-foreground">{k}: </span>
            <span className="font-mono text-foreground">{v}</span>
          </span>
        ))
      )}
      {props.map(([k, v]) => (
        <span key={k} className="text-[11px] text-muted-foreground whitespace-nowrap" title={`${k}: ${v}`}>
          {k}: <span className="font-mono">{v}</span>
        </span>
      ))}
    </div>
  )
}
