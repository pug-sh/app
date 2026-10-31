import { MAX_THEME_BYTES } from './format'
import { checkThemeText, type RemoteId, type TextCheck } from './library'
import { parsePastedUrl } from './reference'
import type { Polarity } from './tokens'

// Members' browsers fetch a theme file straight from the host named, so the request says nothing about
// the member, and the answer is untrusted: capped at the install limit and validated like an install.

export type FetchFailure = 'network' | 'status' | 'too-large' | 'insecure' | 'timeout'
export type FetchResult = { ok: true; text: string } | { ok: false; reason: FetchFailure; status?: number }

/** How long a fetch may take, its answer and its body together. */
export const FETCH_TIMEOUT_MS = 10_000

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

// The global fetch, looked up at request time so a test can stub it.
const browserFetch: Fetcher = (url, init) => fetch(url, init)

// The body, up to maxBytes. Anything longer is abandoned mid-stream, so a host answering with something
// huge costs a member at most the limit. Null when it was longer.
const readCapped = async (response: Response, maxBytes: number) => {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

// The request and its body. What the network does wrong is thrown; what the host answers is returned.
const fetchWithin = async (
  url: string,
  fetcher: Fetcher,
  signal: AbortSignal,
  maxBytes: number,
): Promise<FetchResult> => {
  const response = await fetcher(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache', signal })
  if (response.url !== '' && !response.url.startsWith('https://')) return { ok: false, reason: 'insecure' }
  if (!response.ok) return { ok: false, reason: 'status', status: response.status }
  if (Number(response.headers.get('content-length')) > maxBytes) return { ok: false, reason: 'too-large' }
  const text = await readCapped(response, maxBytes)
  if (text === null) return { ok: false, reason: 'too-large' }
  return { ok: true, text }
}

/**
 * GETs a file as theme files are fetched: no cookies, no referrer, revalidated through the HTTP cache,
 * abandoned past maxBytes, and given up on after FETCH_TIMEOUT_MS. The content type is ignored: raw
 * GitHub serves text/plain.
 */
export const fetchCapped = async (url: string, maxBytes: number, fetcher = browserFetch): Promise<FetchResult> => {
  if (!url.startsWith('https://')) return { ok: false, reason: 'insecure' }
  // An abort fails the request, or the body mid-read, the way a dropped connection would.
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetchWithin(url, fetcher, deadline.signal, maxBytes)
  } catch {
    // A CORS refusal looks exactly like a network failure from inside the page: the browser hides the response.
    return { ok: false, reason: deadline.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** A theme file, capped at the install limit. */
export const fetchThemeText = (url: string, fetcher = browserFetch) => fetchCapped(url, MAX_THEME_BYTES, fetcher)

export type PastedTheme =
  | { ok: true; url: RemoteId; pin?: Polarity; check: TextCheck }
  | { ok: false; reason: 'not-a-url' | FetchFailure | 'not-json'; status?: number }

type PastedFailure = Extract<PastedTheme, { ok: false }>

// Which failure says the most when every guess failed: a 404 on the folder guess shouldn't hide that the
// link as written answered with a page, or was refused by CORS.
const TELLING: Record<PastedFailure['reason'], number> = {
  'not-a-url': 0,
  status: 1,
  'not-json': 2,
  timeout: 3,
  network: 4,
  'too-large': 5,
  insecure: 6,
}

const isJson = (text: string) => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Works out which file a pasted URL means: as written, else `<url>/theme.json`. The first answer that is
 * JSON is the file, checked like an install, so a broken theme is reported rather than skipped.
 */
export const resolvePastedTheme = async (input: string, fetcher = browserFetch): Promise<PastedTheme> => {
  const pasted = parsePastedUrl(input)
  if (!pasted) return { ok: false, reason: 'not-a-url' }
  let failure: PastedFailure = { ok: false, reason: 'not-json' }
  for (const url of pasted.urls) {
    const fetched = await fetchThemeText(url, fetcher)
    let next: PastedFailure
    if (!fetched.ok) next = { ok: false, reason: fetched.reason, status: fetched.status }
    else if (!isJson(fetched.text)) next = { ok: false, reason: 'not-json' }
    else return { ok: true, url: url as RemoteId, pin: pasted.pin, check: checkThemeText(fetched.text) }
    if (TELLING[next.reason] >= TELLING[failure.reason]) failure = next
  }
  return failure
}
