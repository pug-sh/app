import type { Commit, Principal, Signature, SignatureFile } from './check.ts'
import { type Comment, type GitHubAPI, type Label, NotFound } from './github.ts'
import type { Checker, Config } from './main.ts'

export const sig = (login: string, id: number): Signature => ({ login, id, date: '2026-01-01', cla: 'v1' })
export const file = (...signatures: Signature[]): SignatureFile => ({ cla_version: 'v1', signatures })
export const user = (login: string, id: number): Principal => ({ id, login, type: 'User' })

// The gate's own comment, as it comes back from the API on a later run.
export const botComment = (id: number, body: string): Comment => ({ id, body, botAuthor: true })

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

export const fixedNow = new Date('2026-08-30T12:00:00Z')

// Stands in for the API so the gate's decisions can be exercised without a network or a token.
export class FakeGitHub implements GitHubAPI {
  files: Record<string, SignatureFile> = {}
  commits: Commit[] = []
  byLogin: Record<string, Principal> = {}
  lookupErr: Error | null = null
  base = '' // ref check should read the base file at; defaults to "base"

  posted: Comment[] = []
  edits = 0
  listErr: Error | null = null
  writeErr: Error | null = null

  labelled: string[] = []
  labelWrites = 0

  constructor(init: Partial<FakeGitHub> = {}) {
    Object.assign(this, init)
  }

  async signatureFile(ref: string): Promise<SignatureFile> {
    const f = this.files[ref]
    if (!f) throw new NotFound(`no signature file at ${ref}`)
    return f
  }

  async pullCommits(): Promise<Commit[]> {
    return this.commits
  }

  async mergeBase(): Promise<string> {
    return this.base === '' ? 'base' : this.base
  }

  async userByLogin(login: string): Promise<Principal> {
    if (this.lookupErr) throw this.lookupErr
    const p = this.byLogin[login]
    if (!p) throw new NotFound(login)
    return p
  }

  async comments(): Promise<Comment[]> {
    if (this.listErr) throw this.listErr
    return this.posted
  }

  async createComment(_pr: number, body: string) {
    if (this.writeErr) throw this.writeErr
    this.posted.push({ id: this.posted.length + 1, body, botAuthor: true })
  }

  async updateComment(id: number, body: string) {
    if (this.writeErr) throw this.writeErr
    const existing = this.posted.find(c => c.id === id)
    if (!existing) throw new NotFound(String(id))
    existing.body = body
    this.edits++
  }

  async labels(): Promise<Label[]> {
    if (this.listErr) throw this.listErr
    return this.labelled.map(name => ({ name }))
  }

  async addLabel(_pr: number, name: string) {
    if (this.writeErr) throw this.writeErr
    this.labelWrites++
    this.labelled.push(name)
  }

  async removeLabel(_pr: number, name: string) {
    if (this.writeErr) throw this.writeErr
    this.labelWrites++
    this.labelled = this.labelled.filter(n => n !== name)
  }
}

export function newChecker(gh: GitHubAPI, cfg: Partial<Config> = {}) {
  const written: string[] = []
  const c: Checker = {
    cfg: {
      repo: 'pug-sh/app',
      pr: 7,
      prCommits: 1,
      headSHA: 'head',
      baseSHA: 'base',
      baseRef: 'main',
      serverURL: 'https://github.com',
      apiURL: 'https://api.github.invalid',
      summaryPath: '',
      token: 'token',
      opener: user('alice', 1),
      ...cfg,
    },
    gh,
    out: s => {
      written.push(s)
    },
    now: () => fixedNow,
  }
  return { c, output: () => written.join('') }
}
