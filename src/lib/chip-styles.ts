// The bar-level chip: a dashed outline while idle, tinted once it filters. Shared because
// IncludeBotsToggle renders inside the Live filter bar, where a local copy drifts visibly.
export const chipTriggerClass = 'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors'
export const chipActiveClass = 'border-primary/40 bg-primary/5 text-foreground'
export const chipIdleClass =
  'border-dashed border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
