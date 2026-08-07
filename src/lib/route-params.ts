import { useMemo } from 'react'
import { useParams } from 'wouter'

// Read route params through this, never wouter's useParams directly.
//
// Profile IDs are customer distinct IDs — very often an email — so every link that builds one runs
// it through encodeURIComponent, which is required: an unescaped `/` or `#` in a distinct ID would
// otherwise break the route. wouter hands params back exactly as they appear in the URL. Its own
// unescaping is decodeURI, which by design leaves reserved characters (`@`, `#`, `&`, `+`) encoded,
// so nothing downstream ever reverses that encodeURIComponent.
//
// A raw param therefore reaches the page as `a%40b.com` three ways over: rendered as display text,
// sent to the RPC as a distinct ID no profile has, and re-encoded to `a%2540b.com` by the next link
// the page builds from it.
const decodeSegment = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    // A malformed escape (a lone `%`) throws. Keep the raw segment — a param that round-trips
    // wrong is better than a route that crashes.
    return value
  }
}

export const useRouteParams = <T extends Record<string, string>>() => {
  const params = useParams<T>()
  // wouter caches the params object across renders while the values are shallow-equal; memoizing on
  // it preserves that referential stability for callers listing params in a dep array.
  return useMemo(() => {
    const decoded: Record<string, string> = {}
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') decoded[key] = decodeSegment(value)
    }
    return decoded as T
  }, [params])
}
