const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

export const formatCountryName = (code: string | undefined) => {
  if (!code) return '—'
  if (code.length !== 2) return code
  try {
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

const countryDisplay = (country?: string) => (country ? formatCountryName(country) : '')

/** Full location string (city, region, country) — for tooltips and detail views. */
export const formatLocationLabel = (city?: string, region?: string, country?: string) => {
  const regionPart =
    region?.trim() && region.trim().toLowerCase() !== (city ?? '').trim().toLowerCase() ? region : undefined
  return [city, regionPart, countryDisplay(country)].filter(Boolean).join(', ')
}

/** Compact table/chip label: city when present, otherwise country name. */
export const formatLocationPrimary = (city?: string, country?: string) => {
  if (city) return city
  return countryDisplay(country)
}
