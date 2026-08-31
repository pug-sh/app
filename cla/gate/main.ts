import { appendFileSync } from 'node:fs'
import {
  appendOnly,
  type Commit,
  coauthorEmails,
  isAssistant,
  noreplyLogin,
  type Principal,
  principals,
  unsigned,
  validate,
} from './check.ts'
import { type Comment, type GitHubAPI, type Label, NotFound, newClient } from './github.ts'
import { log, message } from './log.ts'
import {
  commentMarker,
  escapeAnnotation,
  labelSigned,
  labelUnsigned,
  problemComment,
  rejectedComment,
  signedComment,
  unlinkedComment,
  unsignedReport,
} from './report.ts'

const runTimeoutMs = 5 * 60_000

// One /users lookup is spent per distinct trailer address, and a fork pull request chooses both the
// commit count and the trailers. Uncapped, it can burn the repository's hourly token quota.
const maxCoauthors = 50

// The gate's ordinary failure. The report is already printed with its own ::error:: annotation, so
// main must not add a second one.
export class Unsigned extends Error {}

export type Config = {
  repo: string
  pr: number
  prCommits: number
  headSHA: string
  baseSHA: string
  baseRef: string
  opener: Principal
  serverURL: string
  apiURL: string
  summaryPath: string
  token: string
}

// Everything the gate talks to, assembled once so check reaches for no ambient state — not the API,
// not stdout, not the clock.
export type Checker = { cfg: Config; gh: GitHubAPI; out: (s: string) => void; now: () => Date }

type Env = Record<string, string | undefined>

const or = (v: string | undefined, fallback: string) => (v === undefined || v === '' ? fallback : v)

function int(env: Env, key: string) {
  const v = env[key] ?? ''
  if (!/^[+-]?\d+$/.test(v) || !Number.isSafeInteger(Number(v))) {
    throw new Error(`${key}: ${JSON.stringify(v)} is not a whole number`)
  }
  return Number(v)
}

export function loadConfig(env: Env = process.env): Config {
  const cfg: Config = {
    repo: env.GITHUB_REPOSITORY ?? '',
    pr: int(env, 'PR_NUMBER'),
    prCommits: int(env, 'PR_COMMITS'),
    headSHA: env.PR_HEAD_SHA ?? '',
    baseSHA: env.PR_BASE_SHA ?? '',
    baseRef: or(env.PR_BASE_REF, 'main'),
    opener: { id: int(env, 'PR_USER_ID'), login: env.PR_USER_LOGIN ?? '', type: or(env.PR_USER_TYPE, 'User') },
    serverURL: or(env.GITHUB_SERVER_URL, 'https://github.com'),
    apiURL: or(env.GITHUB_API_URL, 'https://api.github.com'),
    summaryPath: env.GITHUB_STEP_SUMMARY ?? '',
    token: or(env.GH_TOKEN, env.GITHUB_TOKEN ?? ''),
  }
  // Every one of these silently weakens the gate if it is missing rather than wrong: an empty ref
  // reads as the default branch, and an absent token drops the run to the unauthenticated rate limit.
  if (cfg.repo === '') throw new Error('GITHUB_REPOSITORY is empty')
  if (cfg.headSHA === '') throw new Error('PR_HEAD_SHA is empty')
  if (cfg.baseSHA === '') throw new Error('PR_BASE_SHA is empty')
  if (cfg.token === '') throw new Error('GH_TOKEN is empty')
  if (cfg.opener.id === 0) throw new Error('PR_USER_ID is zero')
  if (cfg.opener.login === '') throw new Error('PR_USER_LOGIN is empty')
  return cfg
}

const fault =
  (what: string) =>
  (err: unknown): never => {
    throw new Error(`${what}: ${message(err)}`)
  }

async function attempt(c: Checker, msg: string, p: Promise<unknown>) {
  try {
    await p
  } catch (err) {
    writeFailed(c, msg, err)
  }
}

export async function check(c: Checker) {
  try {
    await verdict(c)
  } catch (err) {
    // A gate that fell over must not leave "signed — thanks!" standing on a red check, nor advice
    // the contributor has just followed and failed on.
    if (!(err instanceof Unsigned)) {
      await upsertComment(c, problemComment(), false)
      await syncLabels(c, '', labelSigned)
    }
    throw err
  }
}

async function verdict(c: Checker) {
  log('INFO', 'checking signatures', { repo: c.cfg.repo, pr: c.cfg.pr, head: c.cfg.headSHA })

  const head = await c.gh
    .signatureFile(c.cfg.headSHA)
    .catch(fault('reading cla/signatures.json at the pull request head'))
  const invalid = validate(head)
  if (invalid !== null) throw new Error(`cla/signatures.json is invalid: ${invalid}`)

  const commits = await c.gh
    .pullCommits(c.cfg.pr)
    .catch(fault('listing commits: refusing to pass on an unverified list'))
  // GitHub caps this endpoint at 250 and reports the truncation as success, so the count is
  // compared against the pull request's own total.
  if (commits.length !== c.cfg.prCommits) {
    throw new Error(
      `listed ${commits.length} of the pull request's ${c.cfg.prCommits} commits, so some authors would go unchecked; GitHub caps this endpoint at 250, so squash or split a pull request that large, otherwise re-run the job`,
    )
  }

  const { found, unlinked } = principals(commits, c.cfg.opener)
  if (unlinked.length > 0) {
    // The contributor's to fix, like a rejected edit, so it takes the same label and comment rather
    // than reading as a gate that fell over with nothing to act on.
    const problem = `these commits have an email that is not linked to a GitHub account, so their author cannot be identified: ${unlinked.join(', ')}\nAdd the address at ${c.cfg.serverURL}/settings/emails, or rewrite the commits to use your @users.noreply.github.com address`
    c.out(`::error::${escapeAnnotation(problem)}\n`)
    await upsertComment(c, unlinkedComment(c.cfg.serverURL), true)
    await syncLabels(c, labelUnsigned, labelSigned)
    throw new Unsigned(problem)
  }

  // An unidentified co-author blocks the gate like an unsigned one — a trailer names a copyright
  // holder either way — but is reported rather than raised, since a fault would bury the report.
  const { coauthors, unidentified } = await resolveCoauthors(c, commits)
  const people = [...found, ...coauthors]

  const base = await baseFile(c)
  const inForce = await c.gh
    .signatureFile(c.cfg.baseSHA)
    .catch(fault(`reading cla/signatures.json on ${c.cfg.baseRef}`))
  const rejected = appendOnly(base, head, c.cfg.opener, inForce.cla_version)
  if (rejected !== null) {
    // A rejected edit is the contributor's to fix, like an unsigned CLA, so it takes the same label
    // and comment rather than reading as a broken gate.
    c.out(`::error::${escapeAnnotation(rejected)}\n`)
    await upsertComment(c, rejectedComment(), true)
    await syncLabels(c, labelUnsigned, labelSigned)
    throw new Unsigned(rejected)
  }

  const { missing, checked } = unsigned(head, people)
  if (missing.length > 0 || unidentified.length > 0) {
    const report = unsignedReport(c.cfg, head, missing, unidentified, c.now())
    c.out(report.text)
    writeSummary(c, report.markdown)
    await upsertComment(c, report.comment, true)
    await syncLabels(c, labelUnsigned, labelSigned)
    throw new Unsigned('cla not signed')
  }

  // A pull request authored entirely by bots — dependabot and friends — has no human copyright to
  // license, so there is nothing to sign for.
  if (checked.length === 0) {
    c.out(`CLA ${head.cla_version}: no human authors across ${commits.length} commit(s); nothing to sign\n`)
  } else {
    const logins = checked.map(p => p.login).join(', ')
    c.out(
      `CLA ${head.cla_version} verified for ${checked.length} principal(s) across ${commits.length} commit(s): ${logins}\n`,
    )
  }
  await upsertComment(c, signedComment(head.cla_version), false)
  await syncLabels(c, labelSigned, labelUnsigned)
}

// Reads first so a run that changes nothing writes nothing: a label event fires every subscriber on
// the pull request. Best-effort, like the comment.
async function syncLabels(c: Checker, add: string, remove: string) {
  let current: Label[]
  try {
    current = await c.gh.labels(c.cfg.pr)
  } catch (err) {
    writeFailed(c, 'could not list the pull request labels', err)
    return
  }
  const has = (name: string) => current.some(l => l.name === name)
  if (remove !== '' && has(remove)) {
    await attempt(c, 'could not remove the stale cla label', c.gh.removeLabel(c.cfg.pr, remove))
  }
  if (add !== '' && !has(add)) {
    await attempt(c, 'could not add the cla label', c.gh.addLabel(c.cfg.pr, add))
  }
}

// Edits the marked comment in place, so a contributor pushing five times is notified once.
// Best-effort: failing the gate because a comment did not post would block a signed pull request.
async function upsertComment(c: Checker, body: string, create: boolean) {
  let existing: Comment[]
  try {
    existing = await c.gh.comments(c.cfg.pr)
  } catch (err) {
    writeFailed(c, 'could not list the pull request comments', err)
    return
  }
  // The gate's own comment only. The marker is invisible once rendered, so anyone can post one, and
  // a write-scoped token will happily edit a comment it does not own — so matching on the marker
  // alone would let a contributor claim the slot, or have the gate overwrite someone else's comment.
  // Prefix, not contains, because quote-reply copies the marker into the quoting comment.
  const mine = existing.find(cm => cm.botAuthor && cm.body.startsWith(commentMarker))
  if (mine) {
    if (mine.body === body) return
    await attempt(c, 'could not update the signature comment', c.gh.updateComment(mine.id, body))
    return
  }
  if (create) await attempt(c, 'could not post the signature comment', c.gh.createComment(c.cfg.pr, body))
}

// Annotates too: the signed run that most needs this seen exits 0, and nobody opens a green job's log.
function writeFailed(c: Checker, msg: string, err: unknown) {
  log('ERROR', msg, { repo: c.cfg.repo, pr: c.cfg.pr, error: err })
  c.out(`::warning::${escapeAnnotation(msg)}\n`)
}

// The signature file as it stands at the merge base. The event's base.sha is the base branch tip,
// which moves as other pull requests merge, so comparing against it reads a signature added
// meanwhile as one this pull request deleted.
async function baseFile(c: Checker) {
  const mergeBase = await c.gh
    .mergeBase(c.cfg.baseSHA, c.cfg.headSHA)
    .catch(fault(`finding where this pull request left ${c.cfg.baseRef}`))
  return c.gh.signatureFile(mergeBase).catch((err: unknown) => {
    // A branch that left the base before the signature file existed. Reading it as an empty history
    // would disarm both append-only guards, so it stays fatal — but it is fixed by a merge, and the
    // message has to say so or the contributor meets a bare "not found".
    if (err instanceof NotFound) {
      throw new Error(
        `cla/signatures.json does not exist at ${mergeBase}, where this pull request left ${c.cfg.baseRef}; merge ${c.cfg.baseRef} into this branch to pick it up`,
      )
    }
    return fault(`reading cla/signatures.json at ${mergeBase}`)(err)
  })
}

// A trailer is commit-message text, so nothing in it is taken on trust — the address only chooses
// which login is looked up, and the id always comes back from the API.
export async function resolveCoauthors(c: Checker, commits: Commit[]) {
  const coauthors: Principal[] = []
  const unidentified: string[] = []
  const emails = coauthorEmails(commits)
  if (emails.length > maxCoauthors) {
    throw new Error(
      `${emails.length} distinct Co-authored-by addresses is more than this gate will resolve; split the pull request`,
    )
  }
  for (const email of emails) {
    if (isAssistant(email)) {
      log('INFO', 'skipped an assistant trailer', { email })
      continue
    }
    // Only the noreply form is resolved. Any other address would have to go through user search,
    // which sees only emails public on a profile and spends the strictest rate limit we touch.
    const login = noreplyLogin(email)
    if (login === '') {
      unidentified.push(email)
      continue
    }
    let p: Principal | null = null
    try {
      p = await c.gh.userByLogin(login)
    } catch (err) {
      // "We could not reach GitHub" must not reach the contributor as "your co-author has not signed".
      if (!(err instanceof NotFound)) {
        throw new Error(
          `resolving the co-author ${email}: ${message(err)}\nIf GitHub's API was erroring, re-running the job is enough`,
        )
      }
    }
    if (p === null || p.id === 0) {
      unidentified.push(email)
      continue
    }
    coauthors.push(p)
  }
  return { coauthors, unidentified }
}

// Best-effort: the summary is presentation, and the verdict is already carried by the exit code and
// the annotation.
function writeSummary(c: Checker, markdown: string) {
  if (c.cfg.summaryPath === '') return
  try {
    appendFileSync(c.cfg.summaryPath, markdown, { mode: 0o600 })
  } catch (err) {
    writeFailed(c, 'could not write the job summary', err)
  }
}

async function run() {
  let cfg: Config
  try {
    cfg = loadConfig()
  } catch (err) {
    throw new Error(`configuration: ${message(err)}`)
  }
  const gh = newClient({
    token: cfg.token,
    repo: cfg.repo,
    baseURL: cfg.apiURL,
    signal: AbortSignal.timeout(runTimeoutMs),
  })
  await check({ cfg, gh, out: s => process.stdout.write(s), now: () => new Date() })
}

async function main() {
  try {
    await run()
  } catch (err) {
    // An unsigned CLA has already been reported with its own annotation; anything else is a checker
    // fault that nothing has annotated yet.
    if (!(err instanceof Unsigned)) process.stdout.write(`::error::${escapeAnnotation(message(err))}\n`)
    process.exitCode = 1
  }
}

if (import.meta.main) await main()
