const COLOR_PALETTE = [
  { bg: 'bg-blue-500/10', dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' },
  { bg: 'bg-emerald-500/10', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  { bg: 'bg-violet-500/10', dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-400' },
  { bg: 'bg-amber-500/10', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  { bg: 'bg-rose-500/10', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' },
  { bg: 'bg-cyan-500/10', dot: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-400' },
  { bg: 'bg-pink-500/10', dot: 'bg-pink-500', text: 'text-pink-700 dark:text-pink-400' },
  { bg: 'bg-teal-500/10', dot: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-400' },
]

const FIXED_KIND_COLORS: Record<string, number> = {
  click: 0, form_start: 1, form_submit: 2, rage_click: 4,
  dead_click: 6, page_view: 3, scroll: 5,
}

const hashString = (s: string): number => {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  return Math.abs(hash)
}

export const kindStyle = (kind: string): { bg: string; dot: string; text: string } => {
  if (kind in FIXED_KIND_COLORS) return COLOR_PALETTE[FIXED_KIND_COLORS[kind]]
  return COLOR_PALETTE[hashString(kind) % COLOR_PALETTE.length]
}
