export const isMobileOS = (os: string | undefined) => {
  if (!os) return false
  const lower = os.toLowerCase()
  return lower.includes('android') || lower.includes('ios')
}

export const compactNumber = (n: number | bigint) => {
  const v = Number(n)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return v.toLocaleString()
}
