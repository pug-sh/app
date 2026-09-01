// The signer records a signature on behalf of someone who asked for it in a pull request comment.
//
// A comment's author is the one identity in this flow GitHub attests. A commit's author, its
// committer and a Co-authored-by trailer are all self-asserted, which is exactly why the checker
// refuses to take a signature from any of them; a comment carries no such doubt, so it can execute
// the agreement where those cannot. The signature is still written as a commit, authored as the
// contributor, so the record lives in git history under the identity that agreed.

import {
  invalidReason,
  isBot,
  type Principal,
  principals,
  type Signature,
  type SignatureFile,
  signedAt,
} from './check.ts'
import { env, message, number, resolveCoauthors, runTimeout } from './gate.ts'
import { Conflict, type GitHubAPI, NoRuns, newClient, type PullRequest, signaturesPath } from './github.ts'
import { logError, logInfo } from './log.ts'
import { escapeAnnotation } from './report.ts'

// The checker's workflow — not this one — re-run once a signature lands so the pull request's own
// required check turns green rather than a second check merely agreeing with it.
const checkerWorkflowFile = 'cla.yaml'

// The whole comment, not a prefix of it. The workflow gates on a prefix because Actions expressions
// cannot trim, so this is the authoritative match.
export const signCommand = '/sign'

export type SignConfig = {
  repo: string
  pr: number
  baseBranch: string
  commenter: Principal
  serverURL: string
  token: string
}

export const loadSignConfig = (): SignConfig => {
  const cfg: SignConfig = {
    repo: env('GITHUB_REPOSITORY', ''),
    pr: number('PR_NUMBER'),
    baseBranch: env('BASE_BRANCH', 'main'),
    commenter: { id: number('COMMENTER_ID'), login: env('COMMENTER_LOGIN', ''), type: env('COMMENTER_TYPE', '') },
    serverURL: env('GITHUB_SERVER_URL', 'https://github.com'),
    token: env('GH_TOKEN', env('GITHUB_TOKEN', '')),
  }
  // Each of these weakens the signer if it is missing rather than wrong: a zero id names nobody to
  // sign for, and an absent token downgrades the run to the unauthenticated rate limit before
  // failing the write outright.
  if (cfg.repo === '') throw new Error('GITHUB_REPOSITORY is empty')
  if (cfg.token === '') throw new Error('GH_TOKEN is empty')
  if (cfg.commenter.id === 0) throw new Error('COMMENTER_ID is zero')
  if (cfg.commenter.login === '') throw new Error('COMMENTER_LOGIN is empty')
  // No "User" fallback: isBot() reads everything except "Bot" as human, so a renamed payload field
  // would sign for a bot rather than refuse one.
  if (cfg.commenter.type === '') throw new Error('COMMENTER_TYPE is empty')
  if (cfg.pr <= 0) throw new Error(`PR_NUMBER is ${cfg.pr}`)
  return cfg
}

export type RefusalReason = 'not-a-principal' | 'already-signed' | 'bot'

// A refusal a contributor can meet. The message is reported verbatim in the reply, so whichever one
// fires is the whole of what they are told.
export class Refusal extends Error {
  reason: RefusalReason

  constructor(reason: RefusalReason, message: string) {
    super(message)
    this.reason = reason
  }
}

// Marks a refusal decline has already replied to, so sign does not post a second, vaguer comment on
// top of the specific one.
export class Declined extends Error {
  refusal: Error

  constructor(refusal: Error, message: string) {
    super(message)
    this.refusal = refusal
  }
}

// The refusal behind an error, however it was wrapped, so a caller can tell a stranger's /sign from
// a lost race without matching on prose.
export const refusalOf = (err: unknown): RefusalReason | undefined => {
  if (err instanceof Refusal) return err.reason
  if (err instanceof Declined) return refusalOf(err.refusal)
  return undefined
}

// Decides whether this comment records a signature, and when it does not, which reason the
// contributor is told.
//
// commenter is GitHub-attested, so its identity is not in question. opener is the pull request's
// author, equally attested. people is every principal on the pull request: the opener, every commit
// author and committer, and every resolved Co-authored-by trailer. head is the pull request's own
// signature file and onBase the base branch's. version is the one in force.
//
// More than one reason can be true at once — a bot that is not a principal and has somehow signed
// hits three — so the order of the checks is the order of the contributor's experience: whichever
// fires first is the only message they read. Returns undefined to accept.
export const maySign = (
  commenter: Principal,
  opener: Principal,
  people: Principal[],
  head: SignatureFile,
  onBase: SignatureFile,
  version: string,
) => {
  // A bot first. It is the one refusal that holds whatever the pull request says.
  if (isBot(commenter)) return new Refusal('bot', 'a bot holds no copyright, so it has nothing to license')
  // Before principal-hood, deliberately. Someone who signed on an earlier pull request and comments
  // /sign on a colleague's would otherwise be told they have no work here — true, and it sends them
  // hunting for a problem they do not have. Both files are searched at the version in force, never
  // at their own: onBase can declare a different one mid-bump.
  //
  // head is the pull request's own file, so it is credited only to the opener. appendOnly takes a
  // hand-written signature from nobody else, which makes an entry there naming anyone else forged —
  // and crediting it would let a pull request refuse a co-author's /sign as already signed, on a
  // green job, having recorded nothing.
  const inHead = commenter.id === opener.id && signedAt(head, commenter.id, version)
  if (inHead || signedAt(onBase, commenter.id, version)) {
    return new Refusal('already-signed', 'you have already signed the version in force')
  }
  // The only security-relevant check, and the one never to soften: without it the file fills with
  // entries from people who have never contributed.
  if (!people.some(p => p.id === commenter.id)) {
    return new Refusal('not-a-principal', 'you have no commits, and no co-author trailer, in this pull request')
  }
  return undefined
}

// One retry, not a loop. A conflict means another signature landed; a second one in the time it
// takes to re-read is not congestion but a bug, and spinning on it would hold the runner while
// making it worse.
const putRetries = 1

// Advice, not an apology: the signature is committed either way, so what the contributor needs is
// the one action that gets their check re-run.
const rerunFailed =
  '\n\nThe CLA check could not be re-run automatically — push any commit, or ask a maintainer to re-run it.'

// The same advice for someone whose signature was already on file: a repeat /sign is usually an
// attempt to clear a check that never got re-run.
const stillRed = '\n\nIf the CLA check is still red, push any commit or ask a maintainer to re-run it.'

export type Signer = {
  cfg: SignConfig
  gh: GitHubAPI
  now: () => Date
}

// A contributor who typed /sign must be answered. An issue_comment run attaches to no check on the
// pull request, so an error that only annotates the job is a comment nobody replied to.
export const sign = async (s: Signer) => {
  try {
    await record(s)
  } catch (err) {
    if (!(err instanceof Declined)) {
      await reply(s, `@${s.cfg.commenter.login} — \`/sign\` could not be recorded: ${message(err)}`)
    }
    throw err
  }
}

const record = async (s: Signer) => {
  let pr: PullRequest
  try {
    pr = await s.gh.pullRequest(s.cfg.pr)
  } catch (err) {
    throw new Error(`reading pull request ${s.cfg.pr}: ${message(err)}`)
  }
  logInfo('recording a signature', {
    repo: s.cfg.repo,
    pr: s.cfg.pr,
    commenter: s.cfg.commenter.login,
    base: pr.baseRef,
  })

  // issue_comment carries no branch filter, so the target is checked here: a signature committed to
  // any other branch is one the checker never reads, and the contributor would be told it landed.
  if (pr.baseRef !== s.cfg.baseBranch) {
    return decline(
      s,
      new Error(`signatures are recorded on ${s.cfg.baseBranch} only, and this pull request targets ${pr.baseRef}`),
    )
  }
  // issue_comment fires on a closed pull request too, and a merged one's head is gone once the fork
  // is deleted.
  if (pr.state !== 'open') return decline(s, new Error(`this pull request is ${pr.state}; sign on an open one`))
  // The same check loadConfig applies to PR_HEAD_SHA, for the same reason: an empty ref reads as the
  // default branch, so the head file would be read from somewhere else entirely.
  if (pr.headSha === '') throw new Error('the pull request response carries no head sha')

  let commits
  try {
    commits = await s.gh.pullCommits(s.cfg.pr)
  } catch (err) {
    throw new Error(`listing commits: refusing to sign against an unverified list: ${message(err)}`)
  }
  // The checker's own 250-cap guard. A truncated list here would drop principals and refuse a
  // contributor who really is one.
  if (commits.length !== pr.commits) {
    throw new Error(
      `listed ${commits.length} of the pull request's ${pr.commits} commits, so a principal could be missed; GitHub caps that endpoint at 250, so squash or split a pull request that large, otherwise re-run the job`,
    )
  }

  // An unlinked commit, or a trailer the checker could not resolve, drops that person from people
  // entirely, so a contributor who does have work here would otherwise be refused for having none.
  // Both are collected so the refusal can name them instead of flatly denying they exist.
  const { found, unlinked } = principals(commits, pr.user)
  const { found: coauthors, unknown } = await resolveCoauthors(s.gh, commits)
  const people = [...found, ...coauthors]
  const unidentified = [...unlinked, ...unknown]

  let head: SignatureFile
  try {
    head = await s.gh.signatureFile(pr.headSha)
  } catch (err) {
    throw new Error(`reading ${signaturesPath} at the pull request head: ${message(err)}`)
  }

  for (let attempt = 0; ; attempt++) {
    let onBase: SignatureFile
    let sha: string
    try {
      ;({ file: onBase, sha } = await s.gh.signatureFileMeta(pr.baseRef))
    } catch (err) {
      throw new Error(`reading ${signaturesPath} on ${pr.baseRef}: ${message(err)}`)
    }

    const refusal = maySign(s.cfg.commenter, pr.user, people, head, onBase, onBase.claVersion)
    if (refusal !== undefined) {
      if (refusal.reason === 'not-a-principal' && unidentified.length > 0) {
        return decline(
          s,
          new Refusal(
            refusal.reason,
            `${refusal.message}; the check could not identify who these belong to, so if one of them is yours, fix that first: ${unidentified.join(', ')}`,
          ),
        )
      }
      return decline(s, refusal)
    }

    const entry: Signature = {
      login: s.cfg.commenter.login,
      id: s.cfg.commenter.id,
      date: s.now().toISOString().slice(0, 10),
      cla: onBase.claVersion,
    }
    const signedFile: SignatureFile = {
      claVersion: onBase.claVersion,
      signatures: [...(onBase.signatures ?? []), entry],
    }
    // Validate what is about to be written, not what was read: the signer must never be the thing
    // that makes the file unparseable for everyone else.
    const problem = invalidReason(signedFile)
    if (problem !== null) throw new Error(`the signature would make ${signaturesPath} invalid: ${problem}`)

    const msg = `chore(cla): sign ${signedFile.claVersion} for @${s.cfg.commenter.login}`
    try {
      await s.gh.putSignatureFile(pr.baseRef, signedFile, sha, msg, s.cfg.commenter)
    } catch (err) {
      if (err instanceof Conflict && attempt < putRetries) {
        logInfo('another signature landed first; re-reading', { attempt: attempt + 1 })
        continue
      }
      throw new Error(`committing the signature to ${pr.baseRef}: ${message(err)}`)
    }
    return confirm(s, pr, signedFile.claVersion)
  }
}

// How the contributor learns what happened. Best-effort: failing the job over a comment would
// misreport a signature that did land. It annotates too, because the run that most needs this seen
// exits 0 and nobody opens a green log.
const reply = async (s: Signer, body: string) => {
  try {
    await s.gh.createComment(s.cfg.pr, body)
  } catch (err) {
    logError('could not post the reply', { error: err })
    process.stdout.write(`::warning::${escapeAnnotation(`could not post the reply: ${message(err)}`)}\n`)
  }
}

// Tells the contributor the signature landed and re-runs the checker, so the pull request's own
// required check turns green rather than a second one agreeing with it. The re-run is best-effort:
// the signature is committed either way, and failing here would report a signing that happened as
// one that did not.
const confirm = async (s: Signer, pr: PullRequest, version: string) => {
  let body = `Signed CLA **${version}** for @${s.cfg.commenter.login} — recorded in \`${signaturesPath}\` on \`${pr.baseRef}\`. Thanks!`

  try {
    const run = await s.gh.latestWorkflowRun(checkerWorkflowFile, pr.headSha)
    try {
      await s.gh.rerunWorkflow(run.id)
    } catch (err) {
      logError('could not re-run the CLA check', { error: err })
      body += rerunFailed
    }
  } catch (err) {
    if (err instanceof NoRuns) body += '\n\nNo CLA check has run here yet; the first one will pass.'
    else {
      logError('could not find the CLA run to re-run', { error: err })
      body += rerunFailed
    }
  }

  await reply(s, body)
}

// Reports why no signature was recorded.
//
// Already-signed is not a failure: a contributor commenting twice, or one whose first /sign landed
// before the check re-ran, already has what they came for, so the run says so and exits green. Every
// other reason fails the job, which is the only place an operator can see that a /sign was refused.
const decline = async (s: Signer, reason: Error) => {
  const settled = reason instanceof Refusal && reason.reason === 'already-signed'
  let body = `@${s.cfg.commenter.login} — ${reason.message}.`
  if (settled) body += stillRed
  else body += `\n\nSee [CLA.md](${s.cfg.serverURL}/${s.cfg.repo}/blob/HEAD/CLA.md) for how signing works.`
  await reply(s, body)
  if (settled) {
    logInfo('nothing to record', { commenter: s.cfg.commenter.login })
    return
  }
  throw new Declined(reason, `refused to sign for ${s.cfg.commenter.login}: declined: ${reason.message}`)
}

// What a comment body asks for. "unrelated" stays silent — the contributor meant something else, and
// a refusal under every "I'll /sign later" would be worse than saying nothing. "near-miss" is a body
// that opens with the command and carries anything else ("/sign please"); the workflow prefilters on
// that same prefix, so those do reach the job, and exiting quietly on one is the worst shape
// available — a green run, no comment, no annotation, and a check still red.
export const commandOf = (body: string) => {
  const trimmed = body.trim()
  if (!trimmed.startsWith(signCommand)) return 'unrelated'
  return trimmed === signCommand ? 'sign' : 'near-miss'
}

export const nearMiss = (s: Signer) =>
  reply(
    s,
    `@${s.cfg.commenter.login} — to sign, comment \`${signCommand}\` on its own, with nothing else in the comment.`,
  )

export const runSign = async () => {
  const asked = commandOf(process.env.COMMENT_BODY ?? '')
  if (asked === 'unrelated') {
    logInfo('comment is not the sign command; nothing to do')
    return
  }

  let cfg: SignConfig
  try {
    cfg = loadSignConfig()
  } catch (err) {
    throw new Error(`configuration: ${message(err)}`)
  }
  const gh = newClient({ token: cfg.token, repo: cfg.repo, signal: AbortSignal.timeout(runTimeout) })
  const s: Signer = { cfg, gh, now: () => new Date() }

  if (asked === 'near-miss') {
    logInfo('comment is not exactly the sign command')
    await nearMiss(s)
    return
  }

  await sign(s)
}
