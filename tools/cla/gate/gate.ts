// The checker: holds a pull request until everyone with work in it has signed the Contributor
// License Agreement.
//
// Everyone whose copyright can reach the repository through the pull request — commit author,
// committer, co-author, and the person who opened it — must appear in tools/cla/signatures.json.
// The file is read both at the pull request's head, where a hand-written signature lands, and at the
// base branch tip, where a /sign comment lands one. A hand-written edit must be append-only and may
// only add the person who opened it, so a co-author signs by commenting /sign instead.
//
// Commits and the signature file are read over the API, so no file the pull request controls is read
// off the runner. The checker's own code and workflow are the base branch's copies, which is the
// workflow's doing, not this program's.

import { appendFile } from 'node:fs/promises'
import {
  appendOnly,
  type Commit,
  coauthorEmails,
  invalidReason,
  isAssistant,
  noreplyLogin,
  type Principal,
  principals,
  unsigned,
} from './check.ts'
import { type Comment, type GitHubAPI, type Label, NotFound, newClient, signaturesPath } from './github.ts'
import { logDebug, logError, logInfo } from './log.ts'
import {
  commentMarker,
  escapeAnnotation,
  labelSigned,
  labelUnsigned,
  nothingToSignComment,
  problemComment,
  rejectedComment,
  signedComment,
  unsignedReport,
} from './report.ts'

export const runTimeout = 5 * 60 * 1000

// The gate's ordinary failure. check has already printed the report, which carries its own ::error::
// annotation, so main must not add a second one.
export class Unsigned extends Error {}

export type Config = {
  repo: string
  pr: number
  prCommits: number
  headSha: string
  baseSha: string
  baseRef: string
  opener: Principal
  serverURL: string
  summaryPath: string
  token: string
}

export const env = (key: string, fallback: string) => {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

export const number = (key: string) => {
  const raw = process.env[key] ?? ''
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isSafeInteger(n))
    throw new Error(`${key}: ${JSON.stringify(raw)} is not a whole number`)
  return n
}

export const loadConfig = (): Config => {
  const cfg: Config = {
    repo: env('GITHUB_REPOSITORY', ''),
    pr: number('PR_NUMBER'),
    prCommits: number('PR_COMMITS'),
    headSha: env('PR_HEAD_SHA', ''),
    baseSha: env('PR_BASE_SHA', ''),
    baseRef: env('PR_BASE_REF', 'main'),
    opener: { id: number('PR_USER_ID'), login: env('PR_USER_LOGIN', ''), type: env('PR_USER_TYPE', 'User') },
    serverURL: env('GITHUB_SERVER_URL', 'https://github.com'),
    summaryPath: env('GITHUB_STEP_SUMMARY', ''),
    token: env('GH_TOKEN', env('GITHUB_TOKEN', '')),
  }
  // Every one of these silently weakens the gate if it is missing rather than wrong: an empty ref
  // reads as the default branch, and an absent token downgrades the run to the unauthenticated rate
  // limit.
  if (cfg.repo === '') throw new Error('GITHUB_REPOSITORY is empty')
  if (cfg.headSha === '') throw new Error('PR_HEAD_SHA is empty')
  if (cfg.baseSha === '') throw new Error('PR_BASE_SHA is empty')
  if (cfg.token === '') throw new Error('GH_TOKEN is empty')
  if (cfg.opener.id === 0) throw new Error('PR_USER_ID is zero')
  if (cfg.opener.login === '') throw new Error('PR_USER_LOGIN is empty')
  if (cfg.pr <= 0) throw new Error(`PR_NUMBER is ${cfg.pr}`)
  return cfg
}

// Everything the gate talks to. run assembles it once so check itself reaches for no ambient state —
// not the API, not stdout, not the clock.
export type Checker = {
  cfg: Config
  gh: GitHubAPI
  out: (s: string) => void
  now: () => Date
}

export const run = async () => {
  let cfg: Config
  try {
    cfg = loadConfig()
  } catch (err) {
    throw new Error(`configuration: ${err instanceof Error ? err.message : String(err)}`)
  }
  const c: Checker = {
    cfg,
    gh: newClient({ token: cfg.token, repo: cfg.repo, signal: AbortSignal.timeout(runTimeout) }),
    out: s => process.stdout.write(s),
    now: () => new Date(),
  }
  await check(c)
}

// A gate that fell over must not leave "signed — thanks!" standing on a red check, nor advice the
// contributor has just followed and failed on.
export const check = async (c: Checker) => {
  try {
    await verdict(c)
  } catch (err) {
    // Wrapped, so a failure while reporting the fault cannot replace the fault itself: the original
    // is the only thing that says what went wrong.
    if (!(err instanceof Unsigned)) {
      try {
        await upsertComment(c, problemComment(), false)
        await syncLabels(c, '', labelSigned)
      } catch (nested) {
        logError('could not report the checker fault', { error: nested })
      }
    }
    throw err
  }
}

const verdict = async (c: Checker) => {
  logInfo('checking signatures', { repo: c.cfg.repo, pr: c.cfg.pr, head: c.cfg.headSha })

  const head = await read(c.gh, c.cfg.headSha, `reading ${signaturesPath} at the pull request head`)
  const headProblem = invalidReason(head)
  if (headProblem !== null) throw new Error(`${signaturesPath} is invalid: ${headProblem}`)

  let commits: Commit[]
  try {
    commits = await c.gh.pullCommits(c.cfg.pr)
  } catch (err) {
    throw new Error(`listing commits: refusing to pass on an unverified list: ${message(err)}`)
  }
  // GitHub caps this endpoint at 250 and reports the truncation as success, so the count is compared
  // against the pull request's own total.
  if (commits.length !== c.cfg.prCommits) {
    throw new Error(
      `listed ${commits.length} of the pull request's ${c.cfg.prCommits} commits, so some authors would go unchecked; GitHub caps this endpoint at 250, so squash or split a pull request that large, otherwise re-run the job`,
    )
  }

  const { found, unlinked } = principals(commits, c.cfg.opener)
  if (unlinked.length > 0) {
    throw new Error(
      `these commits have an email that is not linked to a GitHub account, so their author cannot be identified: ${unlinked.join(', ')}\n` +
        `Add the address at ${c.cfg.serverURL}/settings/emails, or rewrite the commits to use your @users.noreply.github.com address`,
    )
  }

  // An unidentified co-author blocks the gate like an unsigned one — a trailer names a copyright
  // holder either way — but is reported rather than raised: it is the contributor's to fix, and a
  // checker error would bury the report.
  const { found: coauthors, unknown } = await resolveCoauthors(c.gh, commits)
  const people = [...found, ...coauthors]

  const base = await baseFile(c)
  // The base branch as it stands now, not the event's pinned base.sha. A workflow re-run replays the
  // original payload, so a signature committed by a /sign comment after the event fired would be
  // invisible on exactly the run that has to see it. signatureFile passes its ref to ?ref=, which
  // takes a branch name; baseRef is a base-repo branch and never the pull request's.
  const inForce = await read(c.gh, c.cfg.baseRef, `reading ${signaturesPath} on ${c.cfg.baseRef}`)
  // Validated like head: unsigned now takes a passing verdict from this file, and signedAt compares
  // only the id and the version.
  const inForceProblem = invalidReason(inForce)
  if (inForceProblem !== null) {
    throw new Error(`${signaturesPath} on ${c.cfg.baseRef} is invalid: ${inForceProblem}`)
  }

  const rejection = appendOnly(base, head, c.cfg.opener, inForce.claVersion)
  if (rejection !== null) {
    // A rejected edit is the contributor's to fix, like an unsigned CLA, so it takes the same label
    // and comment rather than reading as a broken gate.
    c.out(`::error::${escapeAnnotation(rejection)}\n`)
    await upsertComment(c, rejectedComment(), true)
    await syncLabels(c, labelUnsigned, labelSigned)
    throw new Unsigned(rejection)
  }

  const { missing, checked } = unsigned(head, inForce, people)
  if (missing.length > 0 || unknown.length > 0) {
    const report = unsignedReport(c.cfg, head, missing, unknown, c.now())
    c.out(report.text)
    await writeSummary(c, report.markdown)
    await upsertComment(c, report.comment, true)
    await syncLabels(c, labelUnsigned, labelSigned)
    throw new Unsigned('cla not signed')
  }
  // A pull request authored entirely by bots — dependabot and friends — has no human copyright to
  // license, so there is nothing to sign for.
  if (checked.length === 0) {
    c.out(`CLA ${head.claVersion}: no human authors across ${commits.length} commit(s); nothing to sign\n`)
    await upsertComment(c, nothingToSignComment(head.claVersion), false)
    await syncLabels(c, labelSigned, labelUnsigned)
    return
  }

  c.out(
    `CLA ${head.claVersion} verified for ${checked.length} principal(s) across ${commits.length} commit(s): ${checked.map(p => p.login).join(', ')}\n`,
  )
  await upsertComment(c, signedComment(head.claVersion), false)
  await syncLabels(c, labelSigned, labelUnsigned)
}

export const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

const read = async (gh: GitHubAPI, ref: string, what: string) => {
  try {
    return await gh.signatureFile(ref)
  } catch (err) {
    throw new Error(`${what}: ${message(err)}`)
  }
}

// Reads the signature file as it stands at the merge base. The event's base.sha is the base branch
// tip, which moves as other pull requests merge, so comparing against it reads a signature added
// meanwhile as one this pull request deleted.
const baseFile = async (c: Checker) => {
  let mergeBase: string
  try {
    mergeBase = await c.gh.mergeBase(c.cfg.baseSha, c.cfg.headSha)
  } catch (err) {
    throw new Error(`finding where this pull request left ${c.cfg.baseRef}: ${message(err)}`)
  }
  try {
    return await c.gh.signatureFile(mergeBase)
  } catch (err) {
    // Not read as an empty history: that would let a pull request present arbitrary entries as
    // pre-existing. A branch older than the gate itself hits this, so it names the way out.
    if (err instanceof NotFound) {
      throw new Error(
        `${signaturesPath} does not exist at ${mergeBase}, where this pull request left ${c.cfg.baseRef}; merge ${c.cfg.baseRef} into this branch so it includes the file`,
      )
    }
    throw new Error(`reading ${signaturesPath} at ${mergeBase}: ${message(err)}`)
  }
}

// Turns Co-authored-by trailers into principals. It takes the API rather than hanging off the
// checker: the signer needs exactly this list to decide who may sign, and two implementations of
// "who is a principal" — one deciding who must sign and one deciding who may — is the single
// disagreement this system cannot survive. A trailer is commit-message text, so nothing in it is
// taken on trust: the address only chooses which login is looked up, and the id always comes back
// from the API.
//
// Only the noreply form is resolved. Any other address would have to go through user search, which
// sees only emails public on a profile, so it answers for a minority of people and spends the
// strictest rate limit we touch to do it; a commit's own author needs none of this, because GitHub
// resolves that one server-side against emails we cannot see.
//
// An unresolved address comes back as unknown for the report; an API that failed to answer is an
// error instead, since "we could not reach GitHub" must not reach the contributor as "your co-author
// has not signed". A known assistant is neither: it names no copyright holder, so it is skipped.
export const resolveCoauthors = async (gh: GitHubAPI, commits: Commit[]) => {
  const found: Principal[] = []
  const unknown: string[] = []
  for (const email of coauthorEmails(commits)) {
    if (isAssistant(email)) {
      logDebug('skipping a trailer that names an assistant', { email })
      continue
    }
    const login = noreplyLogin(email)
    if (login === '') {
      unknown.push(email)
      continue
    }
    let p: Principal
    try {
      p = await gh.userByLogin(login)
    } catch (err) {
      if (!(err instanceof NotFound)) {
        throw new Error(
          `resolving the co-author ${email}: ${message(err)}\nIf GitHub's API was erroring, re-running the job is enough`,
        )
      }
      unknown.push(email)
      continue
    }
    if (p.id === 0) unknown.push(email)
    else found.push(p)
  }
  return { found, unknown }
}

// Reads first so a run that changes nothing writes nothing: a label event fires every subscriber on
// the pull request. Best-effort, like the comment.
const syncLabels = async (c: Checker, add: string, remove: string) => {
  // A failed read leaves the state unknown rather than empty, and both writes are attempted anyway:
  // returning early here left a stale "cla: signed" standing on a run that had just failed.
  let current: Label[] | null = null
  try {
    current = await c.gh.labels(c.cfg.pr)
  } catch (err) {
    writeFailed(c, 'could not list the pull request labels', err)
  }
  const has = (name: string) => current?.some(l => l.name === name)
  if (remove !== '' && has(remove) !== false) {
    try {
      await c.gh.removeLabel(c.cfg.pr, remove)
    } catch (err) {
      writeFailed(c, 'could not remove the stale cla label', err)
    }
  }
  if (add !== '' && has(add) !== true) {
    try {
      await c.gh.addLabel(c.cfg.pr, add)
    } catch (err) {
      writeFailed(c, 'could not add the cla label', err)
    }
  }
}

// Edits the marked comment in place, so a contributor pushing five times is notified once.
// Best-effort: failing the gate because a comment did not post would block a pull request that is
// signed.
const upsertComment = async (c: Checker, body: string, create: boolean) => {
  let existing: Comment[]
  try {
    existing = await c.gh.comments(c.cfg.pr)
  } catch (err) {
    writeFailed(c, 'could not list the pull request comments', err)
    return
  }
  // The marker is not identity: anyone can open a comment with it, and taking the earliest match
  // would let them capture every later report — the gate would edit their comment forever and never
  // post its own. The author has to be a bot as well, which the token's own comments always are.
  // Prefix, not contains: quote-reply copies the marker into the quoting user's comment.
  const mine = existing.find(cm => cm.authorType === 'Bot' && cm.body.startsWith(commentMarker))
  if (mine !== undefined) {
    if (mine.body === body) return
    try {
      await c.gh.updateComment(mine.id, body)
    } catch (err) {
      writeFailed(c, 'could not update the signature comment', err)
    }
    return
  }
  if (!create) return
  try {
    await c.gh.createComment(c.cfg.pr, body)
  } catch (err) {
    writeFailed(c, 'could not post the signature comment', err)
  }
}

// Annotates too: the signed run that most needs this seen exits 0, and nobody opens a green job's log.
const writeFailed = (c: Checker, msg: string, err: unknown) => {
  logError(msg, { repo: c.cfg.repo, pr: c.cfg.pr, error: err })
  c.out(`::warning::${escapeAnnotation(msg)}\n`)
}

// Best-effort: the summary is presentation, and the verdict is already carried by the exit code and
// the annotation.
const writeSummary = async (c: Checker, markdown: string) => {
  if (c.cfg.summaryPath === '') return
  try {
    await appendFile(c.cfg.summaryPath, markdown, { mode: 0o600 })
  } catch (err) {
    logError('could not write the job summary', { path: c.cfg.summaryPath, error: err })
  }
}
