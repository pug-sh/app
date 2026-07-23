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

/** Whether a region says anything the city hasn't ("Lagos, Lagos" is common). */
export const regionAddsDetail = (city?: string, region?: string) => {
  const regionName = region?.trim()
  if (!regionName) return false
  return regionName.toLowerCase() !== (city ?? '').trim().toLowerCase()
}

/** City with its region, dropping a region that only repeats the city. */
export const formatLocality = (city?: string, region?: string) =>
  [city?.trim(), regionAddsDetail(city, region) ? region?.trim() : undefined].filter(Boolean).join(', ')

/** Full location string (city, region, country) — for tooltips and detail views. */
export const formatLocationLabel = (city?: string, region?: string, country?: string) =>
  [formatLocality(city, region), countryDisplay(country)].filter(Boolean).join(', ')

/** Compact table/chip label: city when present, otherwise country name. */
export const formatLocationPrimary = (city?: string, country?: string) => {
  if (city) return city
  return countryDisplay(country)
}
