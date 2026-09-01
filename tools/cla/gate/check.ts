// The signature file, and every decision taken from it: who must sign, who has, and what a pull
// request is allowed to change about the record.

export type Signature = {
  login: string
  id: number
  date: string
  cla: string
}

export type SignatureFile = {
  claVersion: string
  // null is the key being absent, which invalidReason rejects; [] is a file with no signatures yet.
  signatures: Signature[] | null
}

// Anyone whose copyright can reach the repo through a pull request.
export type Principal = {
  id: number
  login: string
  type: string
}

export type Commit = {
  sha: string
  author: Principal | null
  committer: Principal | null
  message: string
}

export const isBot = (p: Principal) => p.type === 'Bot'

const asObject = (v: unknown, what: string) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what} is not a JSON object`)
  return v as Record<string, unknown>
}

// null is absent rather than wrong, matching what a Go decoder does with it.
const asString = (v: unknown, field: string) => {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') throw new Error(`${field} is not a string`)
  return v
}

const asInt = (v: unknown, field: string) => {
  if (v === undefined || v === null) return 0
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new Error(`${field} is not a whole number`)
  return v
}

export const decodePrincipal = (v: unknown, what: string): Principal | null => {
  if (v === undefined || v === null) return null
  const o = asObject(v, what)
  return {
    id: asInt(o.id, `${what}.id`),
    login: asString(o.login, `${what}.login`),
    type: asString(o.type, `${what}.type`),
  }
}

export const decodeCommit = (v: unknown, what: string): Commit => {
  const o = asObject(v, what)
  const message =
    o.commit === undefined || o.commit === null
      ? ''
      : asString(asObject(o.commit, `${what}.commit`).message, `${what}.commit.message`)
  return {
    sha: asString(o.sha, `${what}.sha`),
    author: decodePrincipal(o.author, `${what}.author`),
    committer: decodePrincipal(o.committer, `${what}.committer`),
    message,
  }
}

// JSON.parse takes any shape, so what a typed decoder would have rejected is rejected here: a
// signatures object rather than an array, an id that is a string. An absent key stays absent.
export const parseSignatureFile = (text: string): SignatureFile => {
  const root = asObject(JSON.parse(text), 'the signature file')
  let signatures: Signature[] | null = null
  if (root.signatures !== undefined && root.signatures !== null) {
    if (!Array.isArray(root.signatures)) throw new Error('signatures is not an array')
    signatures = root.signatures.map((entry, i) => {
      const s = asObject(entry, `signatures[${i}]`)
      return {
        login: asString(s.login, `signatures[${i}].login`),
        id: asInt(s.id, `signatures[${i}].id`),
        date: asString(s.date, `signatures[${i}].date`),
        cla: asString(s.cla, `signatures[${i}].cla`),
      }
    })
  }
  return { claVersion: asString(root.cla_version, 'cla_version'), signatures }
}

// A version is echoed into the job log, where GitHub reads ::workflow:: commands line by line, so
// it must not carry a newline.
const versionRe = /^[A-Za-z0-9._-]+$/

// A real calendar day, not the shape of one: 2026-2-3 and 2026-02-30 are both rejected.
const validDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(0)
  dt.setUTCFullYear(year, month - 1, day)
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
}

// Rejects a file that records agreement to nothing — an entry with no id names nobody. Returns the
// reason, or null. The version is held to versionRe because report.ts interpolates it unescaped.
export const invalidReason = (f: SignatureFile): string | null => {
  if (f.claVersion === '') return 'cla_version is missing or empty'
  if (!versionRe.test(f.claVersion)) {
    return `cla_version "${f.claVersion}" must be one line of letters, digits, dot, dash or underscore`
  }
  if (f.signatures === null) return 'signatures is missing'

  const seen = new Map<string, number>()
  for (const [i, s] of f.signatures.entries()) {
    let problem = ''
    if (s.login === '') problem = 'login is empty'
    else if (s.id === 0) problem = 'id is missing or zero'
    else if (!validDate(s.date)) problem = 'date is not a real YYYY-MM-DD date'
    else if (!versionRe.test(s.cla)) problem = 'cla is missing or malformed'
    if (problem !== '') return `signatures[${i}] (${s.login}): ${problem}`

    // Keyed by version too: a version bump is signed by adding an entry, so the same id
    // legitimately appears once per version it has agreed to.
    const key = `${s.id}/${s.cla}`
    const prev = seen.get(key)
    if (prev !== undefined) return `signatures[${i}] repeats the id and version already used by signatures[${prev}]`
    seen.set(key, i)
  }
  return null
}

// signedAt is signed() against a version the caller chooses, so the base branch's file can be
// searched for the version the pull request's head declares rather than its own.
export const signedAt = (f: SignatureFile, id: number, version: string) =>
  (f.signatures ?? []).some(s => s.id === id && s.cla === version)

// An entry left at a superseded version reads as unsigned, so a version bump hands the contributor
// the ordinary sign-me report instead of failing the file as a whole.
export const signed = (f: SignatureFile, id: number) => signedAt(f, id, f.claVersion)

// GitHub's committer for web-UI merges and applied suggestions, matched on the id: a login is
// resolved from a commit email the contributor chooses, so excluding by name would let anyone
// drop out of the check.
export const webFlowId = 19864447

// principals reads the author and the committer of every commit. Both are self-asserted — `--author=`
// and GIT_COMMITTER_EMAIL are free to set — so neither proves who pushed; they are collected because
// each names a distinct copyright holder. The opener comes from the webhook and cannot be forged.
export const principals = (commits: Commit[], opener: Principal) => {
  const found: Principal[] = []
  const unlinked: string[] = []
  for (const c of commits) {
    if (c.author === null || c.committer === null) {
      unlinked.push(c.sha)
      continue
    }
    for (const p of [c.author, c.committer]) if (p.id !== webFlowId) found.push(p)
  }
  found.push(opener)
  return { found, unlinked }
}

const coauthorRe = /^[ \t]*co-authored-by:[^<>\n]*<([^>\n]+)>/gim

// A co-author holds copyright and is invisible to the commits endpoint, so without this a
// pair-written commit licenses only half of what it contains.
export const coauthorEmails = (commits: Commit[]) => {
  const out = new Set<string>()
  for (const c of commits) {
    for (const m of c.message.matchAll(coauthorRe)) {
      // A lone CR ends a line for both the Actions log and CommonMark, so leaving one in would let
      // a trailer forge a workflow command and break out of the code span the report renders it in.
      out.add(m[1].replaceAll('\r', '').trim().toLowerCase())
    }
  }
  return [...out].sort()
}

// An assistant holds no copyright, so a trailer naming one names no principal. Blocking would make
// every contributor using one rewrite their branch over a line that licenses nothing. Add to this
// list rather than loosening the check, so an address that might be a person still stops the gate.
const assistantEmails = [
  'noreply@anthropic.com', // Claude Code's default Co-authored-by trailer
]

export const isAssistant = (email: string) => assistantEmails.includes(email)

const noreplyRe = /^(?:\d+\+)?([A-Za-z0-9-]+(?:\[bot\])?)@users\.noreply\.github\.com$/

// The id in the <id>+<login> form is discarded rather than read: the whole address comes from a
// commit message, so an id taken on trust there would let a pull request sign for anyone it named.
export const noreplyLogin = (email: string) => noreplyRe.exec(email)?.[1] ?? ''

const sameEntry = (a: Signature, b: Signature) =>
  a.id === b.id && a.login === b.login && a.date === b.date && a.cla === b.cla

// appendOnly keeps existing entries immutable and takes only the opener's own signature. The opener
// is the one principal in the pull request's own contents that cannot be forged: an author, a
// committer and a trailer are all self-asserted, so accepting a signature for any principal would
// let a pull request sign for anyone it named. A /sign comment is the other unforgeable identity,
// and it writes to the base branch rather than through here.
//
// inForce comes from the base branch tip, not from base: a branch that predates a version bump
// would otherwise sign the retired version and pass. Returns the reason to reject, or null.
export const appendOnly = (
  base: SignatureFile,
  head: SignatureFile,
  signer: Principal,
  inForce: string,
): string | null => {
  if (head.claVersion !== inForce) {
    return `cla_version is "${inForce}" on the base branch but "${head.claVersion}" here; it is set on the base branch, not by a contribution, so merge the base branch if this one is behind`
  }
  const headEntries = head.signatures ?? []
  for (const b of base.signatures ?? []) {
    if (!headEntries.some(h => sameEntry(h, b))) {
      return `this pull request edits or removes the signature of "${b.login}"; tools/cla/signatures.json is append-only`
    }
  }
  for (const h of headEntries) {
    if ((base.signatures ?? []).some(b => sameEntry(b, h))) continue
    if (h.id !== signer.id) {
      return `this pull request adds a signature for "${h.login}", who did not open it; you may only sign for yourself, so a co-author comments /sign on this pull request instead`
    }
    // Signing matches on the id, so a mismatched login would stand in the record as a signature by
    // whoever it names.
    if (h.login.toLowerCase() !== signer.login.toLowerCase()) {
      return `this signature records id ${h.id} under the login "${h.login}", but that id belongs to "${signer.login}"`
    }
    // You sign what is in force. A new entry at a retired version records an agreement never given,
    // and signed() reads it as unsigned anyway.
    if (h.cla !== head.claVersion) {
      return `this signature is recorded against CLA "${h.cla}", but "${head.claVersion}" is the version in force; sign the current one`
    }
  }
  return null
}

const byLogin = (a: Principal, b: Principal) => {
  if (a.login === b.login) return 0
  return a.login < b.login ? -1 : 1
}

// unsigned returns the principals that still owe a signature, deduplicated by id and with bots
// dropped: a machine-authored commit carries no human authorship to license. Every id here was
// resolved against the API, so a login cannot be shaped to look like a bot and slip through.
//
// A principal counts as signed from either file. head is the pull request's own, where a
// hand-written signature lands; onBase is the base branch as it stands now, where a /sign comment
// lands one. A contributor's first pull request predates their own signature, so head alone would
// read them as unsigned however many times they signed. Searching onBase at head's version is safe
// because appendOnly has already rejected a mismatch between the two files by the time this runs.
export const unsigned = (head: SignatureFile, onBase: SignatureFile, ps: Principal[]) => {
  const seen = new Set<number>()
  const checked: Principal[] = []
  const missing: Principal[] = []
  for (const p of ps) {
    if (isBot(p) || p.id === 0 || seen.has(p.id)) continue
    seen.add(p.id)
    checked.push(p)
    if (!signed(head, p.id) && !signedAt(onBase, p.id, head.claVersion)) missing.push(p)
  }
  return { missing: missing.sort(byLogin), checked: checked.sort(byLogin) }
}
