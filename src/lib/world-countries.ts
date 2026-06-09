import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
// world-atlas ships countries-110m as a TopoJSON whose feature ids are UN M49 numeric codes.
import countries110m from 'world-atlas/countries-110m.json'

// UN M49 numeric → ISO 3166-1 alpha-2. world-atlas keys countries by the numeric code, while our
// activity data is alpha-2 uppercase, so we join through this table.
const M49_TO_ALPHA2: Record<string, string> = {
  '004': 'AF',
  '008': 'AL',
  '010': 'AQ',
  '012': 'DZ',
  '016': 'AS',
  '020': 'AD',
  '024': 'AO',
  '028': 'AG',
  '031': 'AZ',
  '032': 'AR',
  '036': 'AU',
  '040': 'AT',
  '044': 'BS',
  '048': 'BH',
  '050': 'BD',
  '051': 'AM',
  '052': 'BB',
  '056': 'BE',
  '060': 'BM',
  '064': 'BT',
  '068': 'BO',
  '070': 'BA',
  '072': 'BW',
  '074': 'BV',
  '076': 'BR',
  '084': 'BZ',
  '086': 'IO',
  '090': 'SB',
  '092': 'VG',
  '096': 'BN',
  '100': 'BG',
  '104': 'MM',
  '108': 'BI',
  '112': 'BY',
  '116': 'KH',
  '120': 'CM',
  '124': 'CA',
  '132': 'CV',
  '136': 'KY',
  '140': 'CF',
  '144': 'LK',
  '148': 'TD',
  '152': 'CL',
  '156': 'CN',
  '158': 'TW',
  '162': 'CX',
  '166': 'CC',
  '170': 'CO',
  '174': 'KM',
  '175': 'YT',
  '178': 'CG',
  '180': 'CD',
  '184': 'CK',
  '188': 'CR',
  '191': 'HR',
  '192': 'CU',
  '196': 'CY',
  '203': 'CZ',
  '204': 'BJ',
  '208': 'DK',
  '212': 'DM',
  '214': 'DO',
  '218': 'EC',
  '222': 'SV',
  '226': 'GQ',
  '231': 'ET',
  '232': 'ER',
  '233': 'EE',
  '234': 'FO',
  '238': 'FK',
  '242': 'FJ',
  '246': 'FI',
  '248': 'AX',
  '250': 'FR',
  '254': 'GF',
  '258': 'PF',
  '260': 'TF',
  '262': 'DJ',
  '266': 'GA',
  '268': 'GE',
  '270': 'GM',
  '275': 'PS',
  '276': 'DE',
  '288': 'GH',
  '292': 'GI',
  '296': 'KI',
  '300': 'GR',
  '304': 'GL',
  '308': 'GD',
  '312': 'GP',
  '316': 'GU',
  '320': 'GT',
  '324': 'GN',
  '328': 'GY',
  '332': 'HT',
  '334': 'HM',
  '336': 'VA',
  '340': 'HN',
  '344': 'HK',
  '348': 'HU',
  '352': 'IS',
  '356': 'IN',
  '360': 'ID',
  '364': 'IR',
  '368': 'IQ',
  '372': 'IE',
  '376': 'IL',
  '380': 'IT',
  '384': 'CI',
  '388': 'JM',
  '392': 'JP',
  '398': 'KZ',
  '400': 'JO',
  '404': 'KE',
  '408': 'KP',
  '410': 'KR',
  '414': 'KW',
  '417': 'KG',
  '418': 'LA',
  '422': 'LB',
  '426': 'LS',
  '428': 'LV',
  '430': 'LR',
  '434': 'LY',
  '438': 'LI',
  '440': 'LT',
  '442': 'LU',
  '446': 'MO',
  '450': 'MG',
  '454': 'MW',
  '458': 'MY',
  '462': 'MV',
  '466': 'ML',
  '470': 'MT',
  '474': 'MQ',
  '478': 'MR',
  '480': 'MU',
  '484': 'MX',
  '492': 'MC',
  '496': 'MN',
  '498': 'MD',
  '499': 'ME',
  '500': 'MS',
  '504': 'MA',
  '508': 'MZ',
  '512': 'OM',
  '516': 'NA',
  '520': 'NR',
  '524': 'NP',
  '528': 'NL',
  '531': 'CW',
  '533': 'AW',
  '534': 'SX',
  '535': 'BQ',
  '540': 'NC',
  '548': 'VU',
  '554': 'NZ',
  '558': 'NI',
  '562': 'NE',
  '566': 'NG',
  '570': 'NU',
  '574': 'NF',
  '578': 'NO',
  '580': 'MP',
  '583': 'FM',
  '584': 'MH',
  '585': 'PW',
  '586': 'PK',
  '591': 'PA',
  '598': 'PG',
  '600': 'PY',
  '604': 'PE',
  '608': 'PH',
  '612': 'PN',
  '616': 'PL',
  '620': 'PT',
  '624': 'GW',
  '626': 'TL',
  '630': 'PR',
  '634': 'QA',
  '638': 'RE',
  '642': 'RO',
  '643': 'RU',
  '646': 'RW',
  '652': 'BL',
  '654': 'SH',
  '659': 'KN',
  '660': 'AI',
  '662': 'LC',
  '663': 'MF',
  '666': 'PM',
  '670': 'VC',
  '674': 'SM',
  '678': 'ST',
  '682': 'SA',
  '686': 'SN',
  '688': 'RS',
  '690': 'SC',
  '694': 'SL',
  '702': 'SG',
  '703': 'SK',
  '704': 'VN',
  '705': 'SI',
  '706': 'SO',
  '710': 'ZA',
  '716': 'ZW',
  '724': 'ES',
  '728': 'SS',
  '729': 'SD',
  '732': 'EH',
  '740': 'SR',
  '744': 'SJ',
  '748': 'SZ',
  '752': 'SE',
  '756': 'CH',
  '760': 'SY',
  '762': 'TJ',
  '764': 'TH',
  '768': 'TG',
  '772': 'TK',
  '776': 'TO',
  '780': 'TT',
  '784': 'AE',
  '788': 'TN',
  '792': 'TR',
  '795': 'TM',
  '796': 'TC',
  '798': 'TV',
  '800': 'UG',
  '804': 'UA',
  '807': 'MK',
  '818': 'EG',
  '826': 'GB',
  '831': 'GG',
  '832': 'JE',
  '833': 'IM',
  '834': 'TZ',
  '840': 'US',
  '850': 'VI',
  '854': 'BF',
  '858': 'UY',
  '860': 'UZ',
  '862': 'VE',
  '876': 'WF',
  '882': 'WS',
  '887': 'YE',
  '894': 'ZM',
}

const padM49 = (id: string | number) => String(id).padStart(3, '0')

// --- Antimeridian cut ---
//
// world-atlas 110m stores Russia, Fiji, and Antarctica as single rings that cross the ±180°
// meridian. d3 renders on a sphere so it never matters there, but MapLibre draws in planar
// Mercator, where an uncut ring is filled the "long way" and shows as a faint horizontal band
// across the whole map. We split each crossing ring into in-range [-180, 180] pieces. Pole-
// wrapping rings (Antarctica) can't be closed this way, so we validate and keep the original —
// it sits below the choropleth's latitude crop and stays off-screen.

const ringCrosses = (ring: Position[]) => {
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) return true
  }
  return false
}

const interpLat = (lon1: number, lat1: number, lon2: number, lat2: number, boundary: number) => {
  const lon2u = lon2 + (lon2 - lon1 > 180 ? -360 : lon2 - lon1 < -180 ? 360 : 0)
  const d = lon2u - lon1
  if (d === 0) return lat1
  return lat1 + ((boundary - lon1) / d) * (lat2 - lat1)
}

const splitRing = (ring: Position[]): Position[][] => {
  const chains: Position[][] = []
  let cur: Position[] = [ring[0]]
  for (let i = 1; i < ring.length; i++) {
    const [lon1, lat1] = ring[i - 1]
    const [lon2, lat2] = ring[i]
    if (Math.abs(lon2 - lon1) > 180) {
      const edge = lon1 > 0 ? 180 : -180
      const latC = interpLat(lon1, lat1, lon2, lat2, edge)
      cur.push([edge, latC])
      chains.push(cur)
      cur = [[-edge, latC], [lon2, lat2]]
    } else {
      cur.push([lon2, lat2])
    }
  }
  chains.push(cur)
  if (chains.length === 1) return [ring]

  // The ring is closed, so the trailing chain rejoins the leading one (same hemisphere).
  const first = chains.shift() as Position[]
  const last = chains.pop() as Position[]
  chains.push([...last.slice(0, -1), ...first])

  return chains.map((chain) => {
    const closed = [...chain]
    const a = closed[0]
    const b = closed[closed.length - 1]
    if (a[0] !== b[0] || a[1] !== b[1]) closed.push(a)
    return closed
  })
}

const cutPolygon = (polygon: Position[][]): Position[][][] => {
  if (!polygon.some(ringCrosses)) return [polygon]
  // A crossing polygon with holes is unsupported (none exist in 110m) — keep it intact.
  if (polygon.length > 1) return [polygon]
  return splitRing(polygon[0]).map((piece) => [piece])
}

const ringInRange = (ring: Position[]) => {
  let prev: number | null = null
  for (const [lon, lat] of ring) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false
    if (lon < -180.01 || lon > 180.01) return false
    if (prev !== null && Math.abs(lon - prev) > 180) return false
    prev = lon
  }
  return true
}

const cutAntimeridian = (geom: Geometry): Geometry => {
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return geom
  const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const out: Position[][][] = []
  for (const polygon of polygons) out.push(...cutPolygon(polygon))
  const cut: Geometry = { type: 'MultiPolygon', coordinates: out }
  // Pole-wrapping rings (Antarctica) fail validation — fall back to the original, off-screen anyway.
  return out.every((poly) => poly.every(ringInRange)) ? cut : geom
}

// Convert the TopoJSON to GeoJSON once at module load. Each feature gets a numeric `id` (the M49
// code) for MapLibre feature-state, plus an `alpha2` property for hit-testing/joins.
const topology = countries110m as unknown as Topology
const collection = feature(topology, topology.objects.countries) as FeatureCollection<Geometry>

export const WORLD_COUNTRIES: FeatureCollection<Geometry> = {
  type: 'FeatureCollection',
  features: collection.features.map((f): Feature<Geometry> => {
    const m49 = padM49(f.id ?? '')
    const alpha2 = M49_TO_ALPHA2[m49]
    return {
      ...f,
      id: Number(m49),
      geometry: cutAntimeridian(f.geometry),
      properties: { ...f.properties, alpha2 },
    }
  }),
}

// alpha-2 (uppercase) → numeric M49 id, for resolving activity data to feature ids.
export const ALPHA2_TO_M49: Record<string, number> = Object.fromEntries(
  Object.entries(M49_TO_ALPHA2).map(([m49, alpha2]) => [alpha2, Number(m49)]),
)
