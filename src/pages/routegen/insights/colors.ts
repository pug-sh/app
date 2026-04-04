export type SeriesColor = {
  line: string
  fill: string
  dot: string
}

export const SERIES_COLORS: SeriesColor[] = [
  { line: '#2563eb', fill: 'rgba(37,99,235,0.10)', dot: '#2563eb' },
  { line: '#1d4ed8', fill: 'rgba(29,78,216,0.10)', dot: '#1d4ed8' },
  { line: '#3b82f6', fill: 'rgba(59,130,246,0.10)', dot: '#3b82f6' },
  { line: '#60a5fa', fill: 'rgba(96,165,250,0.10)', dot: '#60a5fa' },
  { line: '#0ea5e9', fill: 'rgba(14,165,233,0.10)', dot: '#0ea5e9' },
  { line: '#0284c7', fill: 'rgba(2,132,199,0.10)', dot: '#0284c7' },
  { line: '#38bdf8', fill: 'rgba(56,189,248,0.10)', dot: '#38bdf8' },
  { line: '#06b6d4', fill: 'rgba(6,182,212,0.10)', dot: '#06b6d4' },
  { line: '#0891b2', fill: 'rgba(8,145,178,0.10)', dot: '#0891b2' },
  { line: '#14b8a6', fill: 'rgba(20,184,166,0.10)', dot: '#14b8a6' },
  { line: '#10b981', fill: 'rgba(16,185,129,0.10)', dot: '#10b981' },
  { line: '#059669', fill: 'rgba(5,150,105,0.10)', dot: '#059669' },
  { line: '#34d399', fill: 'rgba(52,211,153,0.10)', dot: '#34d399' },
  { line: '#22c55e', fill: 'rgba(34,197,94,0.10)', dot: '#22c55e' },
  { line: '#16a34a', fill: 'rgba(22,163,74,0.10)', dot: '#16a34a' },
  { line: '#84cc16', fill: 'rgba(132,204,22,0.10)', dot: '#84cc16' },
  { line: '#65a30d', fill: 'rgba(101,163,13,0.10)', dot: '#65a30d' },
  { line: '#a3e635', fill: 'rgba(163,230,53,0.10)', dot: '#a3e635' },
  { line: '#f59e0b', fill: 'rgba(245,158,11,0.10)', dot: '#f59e0b' },
  { line: '#d97706', fill: 'rgba(217,119,6,0.10)', dot: '#d97706' },
  { line: '#fbbf24', fill: 'rgba(251,191,36,0.10)', dot: '#fbbf24' },
  { line: '#f97316', fill: 'rgba(249,115,22,0.10)', dot: '#f97316' },
  { line: '#ea580c', fill: 'rgba(234,88,12,0.10)', dot: '#ea580c' },
  { line: '#fb923c', fill: 'rgba(251,146,60,0.10)', dot: '#fb923c' },
  { line: '#ef4444', fill: 'rgba(239,68,68,0.10)', dot: '#ef4444' },
  { line: '#dc2626', fill: 'rgba(220,38,38,0.10)', dot: '#dc2626' },
  { line: '#f87171', fill: 'rgba(248,113,113,0.10)', dot: '#f87171' },
  { line: '#f43f5e', fill: 'rgba(244,63,94,0.10)', dot: '#f43f5e' },
  { line: '#e11d48', fill: 'rgba(225,29,72,0.10)', dot: '#e11d48' },
  { line: '#fb7185', fill: 'rgba(251,113,133,0.10)', dot: '#fb7185' },
  { line: '#ec4899', fill: 'rgba(236,72,153,0.10)', dot: '#ec4899' },
  { line: '#db2777', fill: 'rgba(219,39,119,0.10)', dot: '#db2777' },
  { line: '#f472b6', fill: 'rgba(244,114,182,0.10)', dot: '#f472b6' },
  { line: '#a855f7', fill: 'rgba(168,85,247,0.10)', dot: '#a855f7' },
  { line: '#9333ea', fill: 'rgba(147,51,234,0.10)', dot: '#9333ea' },
  { line: '#7c3aed', fill: 'rgba(124,58,237,0.10)', dot: '#7c3aed' },
]

const GENERIC_LABEL_RE = /^(step|cohort)\s+\d+$/i

const familyKey = (name: string): string => {
  const normalized = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim()

  if (!normalized) return ''

  const [firstToken = ''] = normalized.split(/[\s.:/_-]+/).filter(Boolean)
  return firstToken
}

const hashString = (value: string): number => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export const getSeriesColor = (seriesName: string, fallbackIndex = 0): SeriesColor => {
  if (!seriesName || GENERIC_LABEL_RE.test(seriesName)) {
    return SERIES_COLORS[fallbackIndex % SERIES_COLORS.length]
  }

  const family = familyKey(seriesName)
  const idx = (family ? hashString(family) : fallbackIndex) % SERIES_COLORS.length
  return SERIES_COLORS[idx]
}
