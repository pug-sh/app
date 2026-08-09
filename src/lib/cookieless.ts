// Ingest mints these server-side, rotating daily. They're kept out of the persons rollup, so
// a /profiles route under one renders "No profile found" rather than a profile.
export const COOKIELESS_ID_PREFIX = 'cookieless-'

export const isCookielessId = (distinctId: string) => distinctId.startsWith(COOKIELESS_ID_PREFIX)
