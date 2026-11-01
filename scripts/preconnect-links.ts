// The preconnect tags a build's index.html carries. pug.sh and docs.pug.sh make off-site links navigate faster on
// click, so they go with the rest of what Pug hosts, behind the air gap. The map host is the deployment's own setting
// and applies either way, marked crossorigin: map assets are CORS fetches and won't reuse a plain preconnect.

// A host:port with no scheme parses as a scheme of its own, whose origin is the string 'null'.
const webOrigin = (value: string | undefined) => {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

export const preconnectLinks = (env: Record<string, string | undefined>) => {
  const links: string[] = []
  if ((env.VITE_PUG_SERVICES_ENABLED ?? '').trim() === 'true') {
    links.push('<link rel="preconnect" href="https://pug.sh" />')
    links.push('<link rel="preconnect" href="https://docs.pug.sh" />')
  }
  const map = webOrigin(env.VITE_MAP_ASSETS_URL)
  if (map) links.push(`<link rel="preconnect" href="${map}" crossorigin />`)
  return links
}
