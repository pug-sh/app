// One build serves both origins, so the static robots.txt can't single out the demo's. Crawlers must stay off it:
// every load they render signs in as the demo viewer, and each sign-in mints a session. Cloudflare Pages hands the
// project's VITE_ variables to Functions as well as to the build, so this reads the same origins `auth/demo.ts` does.
const originOf = (value: string | undefined) => {
  try {
    return new URL(value ?? '').origin
  } catch {
    return ''
  }
}

export const onRequest = (context: {
  request: Request
  env: { VITE_DEMO_ORIGIN?: string; VITE_APP_ORIGIN?: string }
  next: () => Promise<Response>
}) => {
  const demo = originOf(context.env.VITE_DEMO_ORIGIN)
  const app = originOf(context.env.VITE_APP_ORIGIN)
  if (!demo || !app || demo === app || new URL(context.request.url).origin !== demo) return context.next()
  return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
