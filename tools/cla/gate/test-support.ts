// The fake API, the fixtures and the small helpers the tests share. Not a test file itself, so bun
// does not try to run it.

import type { Commit, Principal, Signature, SignatureFile } from './check.ts'
import type { Checker, Config } from './gate.ts'
import {
  type Comment,
  Conflict,
  type GitHubAPI,
  type Label,
  NotFound,
  type PullRequest,
  type WorkflowRun,
} from './github.ts'
import type { Signer } from './sign.ts'

export const sig = (login: string, id: number): Signature => ({ login, id, date: '2026-01-01', cla: 'v1' })

export const file = (...signatures: Signature[]): SignatureFile => ({ claVersion: 'v1', signatures })

export const user = (login: string, id: number): Principal => ({ id, login, type: 'User' })

export const commit = (
  sha: string,
  author: Principal | null,
  committer: Principal | null,
  message: string,
): Commit => ({
  sha,
  author,
  committer,
  message,
})

export const fixedNow = new Date(Date.UTC(2026, 7, 30, 12, 0, 0))

export const alice = user('alice', 1)

// The error a promise rejected with, so a test can assert on its type and its message the way the
// code does rather than on prose alone.
export const caught = async (p: Promise<unknown>) => {
  try {
    await p
    return undefined
  } catch (err) {
    return err
  }
}

export type Sink = { write: (s: string) => void; text: () => string }

export const sink = (): Sink => {
  const parts: string[] = []
  return { write: s => parts.push(s), text: () => parts.join('') }
}

// Sets the variables for one call and puts the environment back, including the ones that were not
// set before: these tests run inside Actions, where GITHUB_* is already populated.
export const withEnv = <T>(vars: Record<string, string>, fn: () => T) => {
  const saved = new Map(Object.keys(vars).map(k => [k, process.env[k]]))
  for (const [k, v] of Object.entries(vars)) process.env[k] = v
  try {
    return fn()
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

export const withServer = async (
  handler: (req: Request) => Response | Promise<Response>,
  fn: (baseURL: string) => Promise<void>,
) => {
  const server = Bun.serve({ port: 0, fetch: handler })
  try {
    await fn(server.url.origin)
  } finally {
    await server.stop(true)
  }
}

export type FakeState = {
  files: Record<string, SignatureFile>
  commits: Commit[]
  byLogin: Record<string, Principal>
  lookupErr: Error | null
  base: string // ref check should read the base file at; defaults to "base"

  posted: Comment[]
  edits: number
  listErr: Error | null
  writeErr: Error | null

  labelled: string[]
  labelWrites: number

  // the signer's surface
  fileSha: string
  pr: PullRequest
  putFile: SignatureFile | null
  putBranch: string
  putSha: string
  putMessage: string
  putAuthor: Principal | null
  putAttempts: number
  putConflicts: number
  putErr: Error | null
  runErr: Error | null
  rerunId: number
  rerunErr: Error | null
  // Committed to the branch by the write that reports the conflict, so a retry that drops it is
  // visible rather than merely unobserved.
  landed: Signature | null
}

export type FakeGitHub = FakeState & GitHubAPI

// Stands in for the API so the gate's decisions can be exercised without a network or a token.
export const newFake = (init: Partial<FakeState> = {}): FakeGitHub => {
  const f: FakeState = {
    files: {},
    commits: [],
    byLogin: {},
    lookupErr: null,
    base: '',
    posted: [],
    edits: 0,
    listErr: null,
    writeErr: null,
    labelled: [],
    labelWrites: 0,
    fileSha: 'abc123',
    pr: { state: 'open', commits: 0, user: alice, headSha: '', baseRef: '' },
    putFile: null,
    putBranch: '',
    putSha: '',
    putMessage: '',
    putAuthor: null,
    putAttempts: 0,
    putConflicts: 0,
    putErr: null,
    runErr: null,
    rerunId: 0,
    rerunErr: null,
    landed: null,
    ...init,
  }

  const api: GitHubAPI = {
    async signatureFile(ref) {
      const found = f.files[ref]
      if (found !== undefined) return found
      // The checker reads the version in force at the base branch by name. In the ordinary case that
      // branch and the merge base carry the same file, so "main" falls back to the merge base's
      // entry; a test that needs them to differ — which is what a /sign comment produces — seeds
      // "main" explicitly.
      if (ref === 'main' && f.files.base !== undefined) return f.files.base
      throw new NotFound(`no file at ${ref}`)
    },

    async signatureFileMeta(ref) {
      const found = f.files[ref]
      if (found === undefined) throw new NotFound(`no file at ${ref}`)
      // A clone, because the signer appends to what it reads and a retry has to see the file as it
      // stands rather than its own half-finished previous attempt.
      return { file: { ...found, signatures: [...(found.signatures ?? [])] }, sha: f.fileSha }
    },

    async putSignatureFile(branch, sf, sha, message, author) {
      f.putAttempts++
      // The conditional write, for real: a stale sha is what GitHub rejects, so the fake rejects it
      // too rather than letting the retry tests pass against a write that was never conditional.
      if (sha !== f.fileSha) throw new Conflict(`sha ${sha} does not match ${f.fileSha}`)
      if (f.putConflicts > 0) {
        f.putConflicts--
        if (f.landed !== null) {
          const current = f.files[branch]
          if (current !== undefined) current.signatures = [...(current.signatures ?? []), f.landed]
          f.landed = null
          f.fileSha = `${f.fileSha}-2`
        }
        throw new Conflict('sha does not match')
      }
      if (f.putErr !== null) throw f.putErr
      f.putBranch = branch
      f.putFile = sf
      f.putSha = sha
      f.putMessage = message
      f.putAuthor = author
      f.files[branch] = sf
    },

    async pullRequest() {
      return f.pr
    },

    async latestWorkflowRun(): Promise<WorkflowRun> {
      if (f.runErr !== null) throw f.runErr
      return { id: 991 }
    },

    async rerunWorkflow(id) {
      f.rerunId = id
      if (f.rerunErr !== null) throw f.rerunErr
    },

    async pullCommits() {
      return f.commits
    },

    async mergeBase() {
      return f.base === '' ? 'base' : f.base
    },

    async userByLogin(login) {
      if (f.lookupErr !== null) throw f.lookupErr
      const p = f.byLogin[login]
      if (p === undefined) throw new NotFound(`no user ${login}`)
      return p
    },

    async comments() {
      if (f.listErr !== null) throw f.listErr
      return f.posted
    },

    async createComment(_pr, body) {
      if (f.writeErr !== null) throw f.writeErr
      f.posted.push({ id: f.posted.length + 1, body, authorType: 'Bot' })
    },

    async updateComment(id, body) {
      if (f.writeErr !== null) throw f.writeErr
      const existing = f.posted.find(c => c.id === id)
      if (existing === undefined) throw new NotFound(`no comment ${id}`)
      existing.body = body
      f.edits++
    },

    async labels(): Promise<Label[]> {
      if (f.listErr !== null) throw f.listErr
      return f.labelled.map(name => ({ name }))
    },

    async addLabel(_pr, name) {
      if (f.writeErr !== null) throw f.writeErr
      f.labelWrites++
      f.labelled.push(name)
    },

    async removeLabel(_pr, name) {
      if (f.writeErr !== null) throw f.writeErr
      f.labelWrites++
      f.labelled = f.labelled.filter(n => n !== name)
    },
  }

  return Object.assign(f, api)
}

export const checkerConfig = (): Config => ({
  repo: 'pug-sh/app',
  pr: 7,
  prCommits: 1,
  headSha: 'head',
  baseSha: 'base',
  baseRef: 'main',
  serverURL: 'https://github.com',
  summaryPath: '',
  token: 't',
  opener: alice,
})

export const newChecker = (gh: GitHubAPI, out: Sink): Checker => ({
  cfg: checkerConfig(),
  gh,
  out: out.write,
  now: () => fixedNow,
})

export const newSigner = (gh: GitHubAPI, commenter: Principal): Signer => ({
  cfg: { repo: 'pug-sh/app', pr: 107, baseBranch: 'main', serverURL: 'https://github.com', token: 't', commenter },
  gh,
  now: () => fixedNow,
})

// A pull request opened by alice with one commit of their own, nothing signed anywhere. The base
// branch and the head agree, which is the state a first-time contributor's pull request is in.
export const signable = () =>
  newFake({
    files: {
      main: { claVersion: 'v1', signatures: [] },
      deadbeef: { claVersion: 'v1', signatures: [] },
    },
    pr: { state: 'open', commits: 1, user: alice, headSha: 'deadbeef', baseRef: 'main' },
    commits: [{ sha: 'c1', author: alice, committer: alice, message: '' }],
  })

// alice opened it, bob wrote the second commit. Distinct identities, so a signature recorded for the
// wrong one is visible: signable() alone cannot tell the commenter from the opener.
export const bob = user('bob', 2)

export const coauthored = () =>
  newFake({
    files: {
      main: { claVersion: 'v1', signatures: [] },
      deadbeef: { claVersion: 'v1', signatures: [] },
    },
    pr: { state: 'open', commits: 2, user: alice, headSha: 'deadbeef', baseRef: 'main' },
    commits: [
      { sha: 'c1', author: alice, committer: alice, message: '' },
      { sha: 'c2', author: bob, committer: bob, message: '' },
    ],
  })
