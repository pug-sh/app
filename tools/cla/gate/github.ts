// The GitHub API surface the gate depends on, and the one client that implements it.

import {
  asInt,
  asObject,
  asString,
  type Commit,
  decodeCommit,
  decodePrincipal,
  type Principal,
  parseSignatureFile,
  type SignatureFile,
} from './check.ts'
import { logDebug, logError } from './log.ts'

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export class NotFound extends Error {}

// The contents API refusing a write whose blob sha is stale, which means a signature landed between
// our read and our write rather than that anything failed. The caller re-reads and retries; every
// other non-2xx is terminal.
export class Conflict extends Error {}

// An empty run list, which is not a missing resource: a contributor can comment /sign before the
// checker has ever run. Kept apart from NotFound so a 404 — a renamed workflow file — cannot be
// reported as "the first one will pass" on a check that will never run.
export class NoRuns extends Error {}

export type WorkflowRun = { id: number }
export type Comment = { id: number; body: string; authorType: string }
export type Label = { name: string }

// The part of the pull request the signer needs and the issue_comment payload does not carry: where
// to commit, whether it is still open, and how many commits to expect so a list truncated at
// GitHub's 250 cap is caught rather than silently under-reporting who has work here.
export type PullRequest = {
  state: string
  commits: number
  user: Principal
  headSha: string
  baseRef: string
}

// Named consumer-side so the gate can be unit-tested against a fake instead of the live API. Every
// implementation must reject a missing resource with NotFound, which resolveCoauthors reads as "no
// such account" rather than as an API failure; an empty run list with NoRuns; and a write refused
// for a stale blob sha with Conflict, which is the only thing the signer's retry keys on.
export type GitHubAPI = {
  signatureFile(ref: string): Promise<SignatureFile>
  signatureFileMeta(ref: string): Promise<{ file: SignatureFile; sha: string }>
  putSignatureFile(branch: string, file: SignatureFile, sha: string, message: string, author: Principal): Promise<void>
  pullCommits(pr: number): Promise<Commit[]>
  mergeBase(base: string, head: string): Promise<string>
  userByLogin(login: string): Promise<Principal>
  pullRequest(pr: number): Promise<PullRequest>
  latestWorkflowRun(workflowFile: string, headSha: string): Promise<WorkflowRun>
  rerunWorkflow(runId: number): Promise<void>
  comments(pr: number): Promise<Comment[]>
  createComment(pr: number, body: string): Promise<void>
  updateComment(id: number, body: string): Promise<void>
  labels(pr: number): Promise<Label[]>
  addLabel(pr: number, name: string): Promise<void>
  removeLabel(pr: number, name: string): Promise<void>
}

// The one place the file's location is written down. The gate reads it two ways — raw for a
// decision, with metadata for a write — and a disagreement between them would read one file and
// overwrite another.
export const signaturesPath = 'tools/cla/signatures.json'

const requestTimeout = 30_000

// The address GitHub itself writes for a commit made through the web UI, and the only address form
// the gate's own trailer resolution accepts.
export const noreplyEmail = (p: Principal) => `${p.id}+${p.login}@users.noreply.github.com`

// Reproduces the file's on-disk shape — two-space indent, trailing newline, fields in this order —
// so a signature recorded by /sign leaves no reformatting diff against one added by hand, and the
// next hand-edit does not rewrite the file.
export const marshalSignatureFile = (f: SignatureFile) => {
  const body = {
    cla_version: f.claVersion,
    signatures: (f.signatures ?? []).map(s => ({ login: s.login, id: s.id, date: s.date, cla: s.cla })),
  }
  return `${JSON.stringify(body, null, 2)}\n`
}

const nextPageRe = /<([^>]+)>;\s*rel="next"/

export type ClientOptions = {
  token: string
  repo: string
  baseURL?: string
  // The run deadline. Combined with a per-request timeout, so one stuck call cannot spend it all.
  signal?: AbortSignal
}

export const newClient = ({ token, repo, baseURL = 'https://api.github.com', signal }: ClientOptions): GitHubAPI => {
  const deadline = () => {
    const perRequest = AbortSignal.timeout(requestTimeout)
    if (signal === undefined) return perRequest
    return AbortSignal.any([signal, perRequest])
  }

  const headers = (accept: string) => {
    const h = new Headers({ Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' })
    if (token !== '') h.set('Authorization', `Bearer ${token}`)
    return h
  }

  // get reports its own failures: a 5xx and a rate limit reach the caller as the same "could not
  // resolve" outcome, and the log is what tells them apart.
  const get = async (endpoint: string, accept: string) => {
    logDebug('github request', { endpoint })
    let res: Response
    try {
      res = await fetch(endpoint, { headers: headers(accept), signal: deadline() })
    } catch (err) {
      logError('github request failed', { endpoint, error: err })
      throw err
    }
    const body = await res.text()
    if (res.status === 404) {
      logDebug('github reported not found', { endpoint })
      throw new NotFound(`GET ${endpoint}: not found`)
    }
    if (res.status !== 200) {
      const err = new Error(`GET ${endpoint}: ${res.status} ${res.statusText}: ${body.trim()}`)
      logError('github returned an unexpected status', {
        endpoint,
        status: res.status,
        rate_limit_remaining: res.headers.get('X-RateLimit-Remaining') ?? '',
        error: err,
      })
      throw err
    }
    return { body, headers: res.headers }
  }

  // GitHub answers a create with 201 and an edit with 200, so any 2xx counts.
  const send = async (method: string, endpoint: string, payload?: unknown) => {
    const h = headers('application/vnd.github+json')
    if (payload !== undefined) h.set('Content-Type', 'application/json')
    let res: Response
    try {
      res = await fetch(endpoint, {
        method,
        headers: h,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: deadline(),
      })
    } catch (err) {
      logError('github request failed', { endpoint, error: err })
      throw err
    }
    const body = await res.text()
    if (res.status === 409) {
      // Every 409 is retried once. A lost race is the common one; a refusal that will never succeed,
      // such as a protected branch the token cannot push to, costs one wasted attempt and then
      // surfaces with GitHub's own wording, which is what distinguishes them for whoever reads it.
      throw new Conflict(`conflict: ${body.trim()}`)
    }
    if (res.status < 200 || res.status > 299) {
      const err = new Error(`${method} ${endpoint}: ${res.status} ${res.statusText}: ${body.trim()}`)
      // The rate limit separates a throttled 403 from a permissions 403, which look identical here
      // and have opposite remedies.
      logError('github returned an unexpected status', {
        endpoint,
        status: res.status,
        rate_limit_remaining: res.headers.get('X-RateLimit-Remaining') ?? '',
        error: err,
      })
      throw err
    }
  }

  // Follows the Link header so the walk is complete. That completeness is what makes GitHub's 250
  // cap detectable at all — the caller compares the count against the pull request's own total.
  const listPaged = async <T>(endpoint: string, what: string, decode: (v: unknown, at: string) => T) => {
    const all: T[] = []
    let next = endpoint
    while (next !== '') {
      const { body, headers: h } = await get(next, 'application/vnd.github+json')
      let page: unknown
      try {
        page = JSON.parse(body)
      } catch (err) {
        logError(`a ${what} page did not decode`, { endpoint: next, error: err })
        throw err
      }
      if (!Array.isArray(page)) throw new Error(`a ${what} page is not an array: ${next}`)
      all.push(...page.map((entry, i) => decode(entry, `${what}[${all.length + i}]`)))
      next = nextPageRe.exec(h.get('Link') ?? '')?.[1] ?? ''
    }
    return all
  }

  const contentsURL = (ref: string) =>
    `${baseURL}/repos/${repo}/contents/${signaturesPath}?ref=${encodeURIComponent(ref)}`

  const decodeFile = (body: string, ref: string) => {
    try {
      return parseSignatureFile(body)
    } catch (err) {
      logError(`${signaturesPath} did not decode`, { ref, error: err })
      throw new Error(`${signaturesPath} could not be read: ${message(err)}`)
    }
  }

  const decodeComment = (v: unknown): Comment => {
    const o = v as { id?: unknown; body?: unknown; user?: { type?: unknown } }
    return {
      id: asInt(o.id, 'the comment id'),
      body: asString(o.body, 'the comment body'),
      authorType: asString(o.user?.type, 'the comment author type'),
    }
  }

  return {
    // Read over the API at a given ref, so the gate never depends on a checkout of the pull
    // request's own tree.
    async signatureFile(ref) {
      const { body } = await get(contentsURL(ref), 'application/vnd.github.raw')
      return decodeFile(body, ref)
    },

    // The same file as JSON rather than raw, for the blob sha. That sha is what makes the signer's
    // write conditional: without it a signature landing between the read and the write is silently
    // overwritten instead of rejected, and the loser never learns their signature is gone.
    async signatureFileMeta(ref) {
      const { body } = await get(contentsURL(ref), 'application/vnd.github+json')
      let meta: { sha?: unknown; content?: unknown; encoding?: unknown }
      try {
        meta = JSON.parse(body)
      } catch (err) {
        logError('the contents response did not decode', { ref, error: err })
        throw new Error(`the contents response for ${signaturesPath} did not decode: ${String(err)}`)
      }
      if (meta.encoding !== 'base64') {
        throw new Error(`the contents response for ${signaturesPath} is "${String(meta.encoding)}"-encoded, not base64`)
      }
      // GitHub wraps the encoding at 60 characters. Buffer and atob both ignore the newlines; the
      // strip is here so a stricter decoder could be swapped in without a silent breakage.
      const raw = Buffer.from(String(meta.content).replaceAll(/\s/g, ''), 'base64').toString('utf8')
      const sha = asString(meta.sha, 'the contents response sha')
      // The sha is the whole of what makes the signer's write conditional, so an absent one is an
      // error rather than an empty string GitHub would reject later for a reason nothing can read.
      if (sha === '') throw new Error(`the contents response for ${signaturesPath} carries no sha`)
      return { file: decodeFile(raw, ref), sha }
    },

    // Commits the file to branch. The contributor is the commit author and the workflow's token is
    // the committer, so the record lives in git history under the identity that agreed to it rather
    // than the bot's. sha makes the write conditional; a stale one comes back as Conflict.
    async putSignatureFile(branch, file, sha, message, author) {
      await send('PUT', `${baseURL}/repos/${repo}/contents/${signaturesPath}`, {
        message,
        content: Buffer.from(marshalSignatureFile(file), 'utf8').toString('base64'),
        sha,
        branch,
        author: { name: author.login, email: noreplyEmail(author) },
      })
    },

    // GitHub caps this endpoint at 250 commits and simply stops sending a next link, so the caller
    // compares the count against the pull request's own commit total rather than trusting the walk.
    async pullCommits(pr) {
      const all = await listPaged(`${baseURL}/repos/${repo}/pulls/${pr}/commits?per_page=100`, 'commit', decodeCommit)
      logDebug('listed commits', { pr, commits: all.length })
      return all
    },

    // The commit the pull request actually branched from. It is not in the event payload — base.sha
    // there is the base branch tip, which moves.
    async mergeBase(base, head) {
      const endpoint = `${baseURL}/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
      const { body } = await get(endpoint, 'application/vnd.github+json')
      let res: { merge_base_commit?: { sha?: unknown } }
      try {
        res = JSON.parse(body)
      } catch (err) {
        logError('the compare response did not decode', { error: err })
        throw err
      }
      const sha = String(res.merge_base_commit?.sha ?? '')
      if (sha === '') throw new Error('compare returned no merge base')
      return sha
    },

    async userByLogin(login) {
      const { body } = await get(`${baseURL}/users/${encodeURIComponent(login)}`, 'application/vnd.github+json')
      try {
        return decodePrincipal(JSON.parse(body), 'the user') ?? { id: 0, login: '', type: '' }
      } catch (err) {
        logError('a user lookup did not decode', { login, error: err })
        throw err
      }
    },

    async pullRequest(pr) {
      const { body } = await get(`${baseURL}/repos/${repo}/pulls/${pr}`, 'application/vnd.github+json')
      let out: {
        state?: unknown
        commits?: unknown
        user?: unknown
        head?: { sha?: unknown }
        base?: { ref?: unknown }
      }
      try {
        out = JSON.parse(body)
      } catch (err) {
        logError('the pull request response did not decode', { pr, error: err })
        throw new Error(`the pull request response did not decode: ${String(err)}`)
      }
      return {
        state: String(out.state ?? ''),
        commits: Number(out.commits ?? 0),
        user: decodePrincipal(out.user, 'the pull request author') ?? { id: 0, login: '', type: '' },
        headSha: String(out.head?.sha ?? ''),
        baseRef: String(out.base?.ref ?? ''),
      }
    },

    // The signer re-runs an existing run rather than dispatching a fresh one: only
    // pull_request_target runs attach to a pull request's checks, so a dispatched run would change
    // nothing the merge button can see.
    async latestWorkflowRun(workflowFile, headSha) {
      const endpoint = `${baseURL}/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?head_sha=${encodeURIComponent(headSha)}&per_page=1`
      const { body } = await get(endpoint, 'application/vnd.github+json')
      let page: { workflow_runs?: unknown }
      try {
        page = JSON.parse(body)
      } catch (err) {
        logError('the workflow runs response did not decode', { error: err })
        throw new Error(`the workflow runs response did not decode: ${String(err)}`)
      }
      const runs = page.workflow_runs
      // Only an empty list is "no run yet". A payload that is not a list at all is a shape we do not
      // recognise, and reporting that as "the first one will pass" would be a claim we cannot make.
      if (!Array.isArray(runs)) throw new Error('the workflow runs response carries no run list')
      if (runs.length === 0) throw new NoRuns('no run yet')
      return { id: asInt((runs[0] as { id?: unknown }).id, 'the workflow run id') }
    },

    async rerunWorkflow(runId) {
      await send('POST', `${baseURL}/repos/${repo}/actions/runs/${runId}/rerun`)
    },

    comments(pr) {
      return listPaged(`${baseURL}/repos/${repo}/issues/${pr}/comments?per_page=100`, 'comment', decodeComment)
    },

    async createComment(pr, body) {
      await send('POST', `${baseURL}/repos/${repo}/issues/${pr}/comments`, { body })
    },

    async updateComment(id, body) {
      await send('PATCH', `${baseURL}/repos/${repo}/issues/comments/${id}`, { body })
    },

    labels(pr) {
      return listPaged(`${baseURL}/repos/${repo}/issues/${pr}/labels?per_page=100`, 'label', (v, at) => ({
        name: asString(asObject(v, at).name, `${at}.name`),
      }))
    },

    async addLabel(pr, name) {
      await send('POST', `${baseURL}/repos/${repo}/issues/${pr}/labels`, { labels: [name] })
    },

    // Percent-encoded before it goes into the path: the name carries a space and a colon.
    async removeLabel(pr, name) {
      await send('DELETE', `${baseURL}/repos/${repo}/issues/${pr}/labels/${encodeURIComponent(name)}`)
    },
  }
}
