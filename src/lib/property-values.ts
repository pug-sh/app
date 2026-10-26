import { formatCountryName } from './location'

export const COUNTRY_PROPERTY = '$country'

// The backend's ISO 3166-1 alpha-2 set (geo.countryCodes): the 249 assigned codes plus XK, which
// Cloudflare returns for Kosovo. A $country outside it was sent by a caller and is shown as sent.
const COUNTRY_CODES = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ
  BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR
  CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
  ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ
  LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ
  MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF
  PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI
  SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR
  TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`
  .trim()
  .split(/\s+/)

const KNOWN_COUNTRIES = new Set(COUNTRY_CODES)

// Names people use that the CLDR name doesn't contain.
const COUNTRY_ALIASES = new Map([
  ['AE', ['UAE']],
  ['BA', ['Bosnia']],
  ['CD', ['DR Congo', 'Democratic Republic of the Congo']],
  ['CG', ['Republic of the Congo']],
  ['CI', ['Ivory Coast']],
  ['CV', ['Cabo Verde']],
  ['CZ', ['Czech Republic']],
  ['FK', ['Falklands']],
  ['GB', ['UK', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland']],
  ['HK', ['Hong Kong']],
  ['MK', ['Macedonia']],
  ['MM', ['Myanmar', 'Burma']],
  ['MO', ['Macao', 'Macau']],
  ['NL', ['Holland']],
  ['PS', ['Palestine']],
  ['SZ', ['Swaziland']],
  ['TL', ['East Timor']],
  ['TR', ['Turkey']],
  ['US', ['USA', 'America', 'United States of America']],
  ['VA', ['Vatican']],
])

// Cloudflare's CF-IPContinent codes.
const CONTINENTS = new Map([
  ['AF', 'Africa'],
  ['AN', 'Antarctica'],
  ['AS', 'Asia'],
  ['EU', 'Europe'],
  ['NA', 'North America'],
  ['OC', 'Oceania'],
  ['SA', 'South America'],
  ['T1', 'Tor network'],
])

const languageNames = new Intl.DisplayNames(['en'], { type: 'language', languageDisplay: 'standard', fallback: 'none' })

// Ingest canonicalizes tags, so any other spelling matches nothing and is shown as sent.
const localeLabel = (value: string) => {
  try {
    return Intl.getCanonicalLocales(value)[0] === value ? (languageNames.of(value) ?? value) : value
  } catch {
    return value
  }
}

type ValueDomain = {
  label: (value: string) => string
  // The closed set, if any: the picker lists it and typed text resolves against it.
  values?: readonly string[]
  aliases?: ReadonlyMap<string, readonly string[]>
}

const DOMAINS = new Map<string, ValueDomain>([
  [
    COUNTRY_PROPERTY,
    {
      label: value => (KNOWN_COUNTRIES.has(value) ? formatCountryName(value) : value),
      values: COUNTRY_CODES,
      aliases: COUNTRY_ALIASES,
    },
  ],
  ['$continent', { label: value => CONTINENTS.get(value) ?? value, values: [...CONTINENTS.keys()] }],
  ['$locale', { label: localeLabel }],
])

const withoutAccents = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '')

const matchKey = (text: string) =>
  withoutAccents(text)
    .toLowerCase()
    .replace(/^\s*the\s+/, '')
    .replaceAll('&', 'and')
    .replace(/[^\p{L}\p{N}]/gu, '')

export const labelsPropertyValues = (property: string) => DOMAINS.has(property)

export const propertyValueLabel = (property: string, value: string) => DOMAINS.get(property)?.label(value) ?? value

export const knownPropertyValues = (property: string) => DOMAINS.get(property)?.values ?? []

// What a value is found by besides its code. cmdk folds case only, so "turkiye" would miss Türkiye
// and "saint lucia" would miss St. Lucia.
export const propertyValueKeywords = (property: string, value: string) => {
  const domain = DOMAINS.get(property)
  if (!domain) return []
  const label = domain.label(value)
  const spelled = withoutAccents(label)
    .replace(/^St\. /, 'Saint ')
    .replaceAll(' & ', ' and ')
  return [...new Set([label, spelled, ...(domain.aliases?.get(value) ?? [])])]
}

const resolvers = new Map<string, Map<string, string>>()

const resolverFor = (property: string, values: readonly string[]) => {
  const cached = resolvers.get(property)
  if (cached) return cached
  const byKey = new Map(values.map(value => [matchKey(value), value]))
  for (const value of values) {
    for (const keyword of propertyValueKeywords(property, value)) {
      const key = matchKey(keyword)
      if (!byKey.has(key)) byKey.set(key, value)
    }
  }
  resolvers.set(property, byKey)
  return byKey
}

// Typed text to its code by code, name or alias, ignoring case, accents and punctuation. The backend
// matches exactly, so a typed "in" would otherwise filter on nothing.
export const resolvePropertyValue = (property: string, input: string) => {
  const values = DOMAINS.get(property)?.values
  if (!values) return input
  return resolverFor(property, values).get(matchKey(input)) ?? input
}
