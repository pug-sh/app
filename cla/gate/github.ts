import { type Commit, type Principal, parseSignatureFile, type SignatureFile } from './check.ts'
import { log, message } from './log.ts'

// resolveCoauthors keys its unidentified-vs-error split on this, so every method must report a
// missing resource with it rather than as an API failure.
export class NotFound extends Error {}

export type Comment = { id: number; body: string; botAuthor: boolean }
export type Label = { name: string }

// The GitHub surface the gate depends on, named consumer-side so check can be unit-tested against
// a fake instead of the live API.
export type GitHubAPI = {
  signatureFile(ref: string): Promise<SignatureFile>
  pullCommits(pr: number): Promise<Commit[]>
  mergeBase(base: string, head: string): Promise<string>
  userByLogin(login: string): Promise<Principal>
  comments(pr: number): Promise<Comment[]>
  createComment(pr: number, body: string): Promise<void>
  updateComment(id: number, body: string): Promise<void>
  labels(pr: number): Promise<Label[]>
  addLabel(pr: number, name: string): Promise<void>
  removeLabel(pr: number, name: string): Promise<void>
}

const obj = (v: unknown) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : 0)

const toPrincipal = (v: unknown): Principal | null => {
  const p = obj(v)
  if (!p) return null
  const id = int(p.id)
  return id === 0 ? null : { id, login: str(p.login), type: str(p.type) }
}

const toCommit = (v: unknown): Commit => {
  const c = obj(v)
  const message = c && obj(c.commit)?.message
  if (typeof message !== 'string') throw new Error('a commit arrived without a message')
  return {
    sha: str(c?.sha),
    author: toPrincipal(c?.author),
    committer: toPrincipal(c?.committer),
    message,
  }
}

const toComment = (v: unknown): Comment => {
  const c = obj(v) ?? {}
  return { id: int(c.id), body: str(c.body), botAuthor: str(obj(c.user)?.type) === 'Bot' }
}

const nextPageRe = /<([^>]+)>;\s*rel="next"/

function decode(body: string, what: string, endpoint: string) {
  try {
    return JSON.parse(body) as unknown
  } catch (err) {
    log('ERROR', `a ${what} response did not decode`, { endpoint, error: err })
    throw new Error(`a ${what} response did not decode: ${message(err)}`)
  }
}

export function newClient(opts: { token: string; repo: string; baseURL: string; signal?: AbortSignal }): GitHubAPI {
  const baseURL = opts.baseURL
  const issues = `${baseURL}/repos/${opts.repo}/issues`

  const headers = (accept: string) => {
    const h: Record<string, string> = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
    if (opts.token !== '') h.Authorization = `Bearer ${opts.token}`
    return h
  }

  // Per request, under the run's own deadline.
  const signal = () => {
    const timeout = AbortSignal.timeout(30_000)
    return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  }

  // Reports its own failures: a 5xx and a rate limit reach the caller as the same "could not
  // resolve" outcome, and the log is what tells them apart.
  async function get(endpoint: string, accept: string) {
    log('DEBUG', 'github request', { endpoint })
    const res = await fetch(endpoint, { headers: headers(accept), signal: signal() })
    const body = await res.text()
    if (res.status === 404) throw new NotFound(`GET ${endpoint}: not found`)
    if (!res.ok) {
      const err = new Error(`GET ${endpoint}: ${res.status} ${res.statusText}: ${body.trim()}`)
      log('ERROR', 'github returned an unexpected status', {
        endpoint,
        status: res.status,
        rate_limit_remaining: res.headers.get('X-RateLimit-Remaining') ?? '',
        error: err,
      })
      throw err
    }
    return { body, headers: res.headers }
  }

  // Follows the Link header, so a short read is detectable rather than read as a complete list.
  async function listPaged<T>(endpoint: string, what: string, decodePage: (v: unknown) => T) {
    const all: T[] = []
    let next = endpoint
    while (next !== '') {
      const res = await get(next, 'application/vnd.github+json')
      const page = decode(res.body, `${what} page`, next)
      if (!Array.isArray(page)) throw new Error(`a ${what} page is not an array`)
      all.push(...page.map(decodePage))
      next = nextPageRe.exec(res.headers.get('Link') ?? '')?.[1] ?? ''
      if (next !== '' && !next.startsWith(`${baseURL}/`)) throw new Error(`a ${what} page linked off ${baseURL}`)
    }
    return all
  }

  // GitHub answers a create with 201 and an edit with 200, so any 2xx counts.
  async function send(method: string, endpoint: string, payload?: unknown) {
    const h = headers('application/vnd.github+json')
    const init: RequestInit = { method, headers: h, signal: signal() }
    if (payload !== undefined) {
      h['Content-Type'] = 'application/json'
      init.body = JSON.stringify(payload)
    }
    const res = await fetch(endpoint, init)
    const body = await res.text()
    if (res.ok) return
    const err = new Error(`${method} ${endpoint}: ${res.status} ${res.statusText}: ${body.trim()}`)
    // The rate limit separates a throttled 403 from a permissions 403, which look identical here
    // and have opposite remedies.
    log('ERROR', 'github returned an unexpected status', {
      endpoint,
      status: res.status,
      rate_limit_remaining: res.headers.get('X-RateLimit-Remaining') ?? '',
      error: err,
    })
    throw err
  }

  return {
    // Read over the API at a given ref, so the gate never depends on a checkout of the pull
    // request's own tree.
    async signatureFile(ref) {
      const endpoint = `${baseURL}/repos/${opts.repo}/contents/cla/signatures.json?ref=${encodeURIComponent(ref)}`
      const res = await get(endpoint, 'application/vnd.github.raw')
      try {
        return parseSignatureFile(res.body)
      } catch (err) {
        log('ERROR', 'cla/signatures.json did not decode', { ref, error: err })
        throw new Error(`the file did not parse: ${message(err)}`)
      }
    },

    // GitHub caps this endpoint at 250 commits and simply stops sending a next link, so the caller
    // compares the count against the pull request's own total rather than trusting the walk.
    async pullCommits(pr) {
      const all = await listPaged(`${baseURL}/repos/${opts.repo}/pulls/${pr}/commits?per_page=100`, 'commit', toCommit)
      log('DEBUG', 'listed commits', { pr, commits: all.length })
      return all
    },

    // The commit the pull request actually branched from. It is not in the event payload — base.sha
    // there is the base branch tip, which moves.
    async mergeBase(base, head) {
      const endpoint = `${baseURL}/repos/${opts.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
      const res = await get(endpoint, 'application/vnd.github+json')
      const sha = str(obj(obj(decode(res.body, 'compare', endpoint))?.merge_base_commit)?.sha)
      if (sha === '') throw new Error('compare returned no merge base')
      return sha
    },

    async userByLogin(login) {
      const endpoint = `${baseURL}/users/${encodeURIComponent(login)}`
      const res = await get(endpoint, 'application/vnd.github+json')
      return toPrincipal(decode(res.body, 'user', endpoint)) ?? { id: 0, login: '', type: '' }
    },

    comments: pr => listPaged(`${issues}/${pr}/comments?per_page=100`, 'comment', toComment),

    createComment: (pr, body) => send('POST', `${issues}/${pr}/comments`, { body }),

    updateComment: (id, body) => send('PATCH', `${issues}/comments/${id}`, { body }),

    labels: pr =>
      listPaged(`${issues}/${pr}/labels?per_page=100`, 'label', v => {
        const name = str(obj(v)?.name)
        if (name === '') throw new Error('a label arrived without a name')
        return { name }
      }),

    addLabel: (pr, name) => send('POST', `${issues}/${pr}/labels`, { labels: [name] }),

    // The name is escaped, not interpolated: it carries a space and a colon.
    removeLabel: (pr, name) => send('DELETE', `${issues}/${pr}/labels/${encodeURIComponent(name)}`),
  }
}
