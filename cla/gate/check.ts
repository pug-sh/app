// Identity is the numeric GitHub id: a login can be renamed and re-registered by someone else,
// which would silently transfer a signature.
export type Signature = { login: string; id: number; date: string; cla: string }
export type SignatureFile = { cla_version: string; signatures: Signature[] }

// Anyone whose copyright can reach the repo through a pull request.
export type Principal = { id: number; login: string; type: string }

export type Commit = { sha: string; author: Principal | null; committer: Principal | null; message: string }

// A version is echoed into a ::workflow:: command, which GitHub reads one line at a time.
const versionRe = /^[A-Za-z0-9._-]+$/

const quote = (s: string) => JSON.stringify(s)

function asString(v: unknown, what: string) {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') throw new Error(`${what} must be a string`)
  return v
}

// Beyond 2^53 an id loses precision in JSON.parse, so two accounts could collide on one signature.
function asID(v: unknown, what: string) {
  if (v === undefined || v === null) return 0
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new Error(`${what} must be a whole number`)
  return v
}

// Shape only. An absent field decodes to its zero value and is left to validate, which names the
// field and the entry; failing here would report a parse error against the file as a whole.
export function parseSignatureFile(text: string): SignatureFile {
  const raw: unknown = JSON.parse(text)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('the file is not a JSON object')
  const file = raw as Record<string, unknown>
  if (file.signatures === undefined || file.signatures === null) throw new Error('signatures is missing')
  if (!Array.isArray(file.signatures)) throw new Error('signatures must be an array')
  const signatures = file.signatures.map((entry: unknown, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`signatures[${i}] is not an object`)
    }
    const s = entry as Record<string, unknown>
    return {
      login: asString(s.login, `signatures[${i}].login`),
      id: asID(s.id, `signatures[${i}].id`),
      date: asString(s.date, `signatures[${i}].date`),
      cla: asString(s.cla, `signatures[${i}].cla`),
    }
  })
  return { cla_version: asString(file.cla_version, 'cla_version'), signatures }
}

// A real calendar day, not the shape of one: new Date rolls 2026-02-30 into March rather than
// rejecting it, so the parts are compared back.
function validDate(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(year, month - 1, day))
  return t.getUTCFullYear() === year && t.getUTCMonth() === month - 1 && t.getUTCDate() === day
}

// Rejects a signature file that records agreement to nothing: an entry with no id names nobody.
export function validate(f: SignatureFile) {
  if (f.cla_version === '') return 'cla_version is missing or empty'
  if (!versionRe.test(f.cla_version)) {
    return `cla_version ${quote(f.cla_version)} must be one line of letters, digits, dot, dash or underscore`
  }
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

// An entry left at a superseded version reads as unsigned, so a version bump hands the contributor
// the ordinary sign-me report instead of failing the file as a whole.
export function hasSigned(f: SignatureFile, id: number) {
  return f.signatures.some(s => s.id === id && s.cla === f.cla_version)
}

// GitHub's committer for web-UI merges and applied suggestions. Matched on the id because a login
// can be renamed and re-registered, which would move the exemption to whoever took the name.
export const webFlowID = 19864447

// Author and committer are both self-asserted, so neither proves who pushed; each is collected
// because it names a distinct copyright holder. The opener comes from the webhook and cannot be forged.
export function principals(commits: Commit[], opener: Principal) {
  const found: Principal[] = []
  const unlinked: string[] = []
  for (const c of commits) {
    if (!c.author || !c.committer) {
      unlinked.push(c.sha)
      continue
    }
    for (const p of [c.author, c.committer]) {
      if (p.id !== webFlowID) found.push(p)
    }
  }
  found.push(opener)
  return { found, unlinked }
}

// Anchored on \n rather than the m flag, which also treats a lone \r as a line start.
const coauthorRe = /(?:^|\n)[ \t]*co-authored-by:[^<>\n]*<([^>\n]+)>/gi

// A co-author holds copyright and is invisible to the commits endpoint, so without this a
// pair-written commit licenses only half of what it contains.
export function coauthorEmails(commits: Commit[]) {
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

// An assistant holds no copyright, so its trailer names no principal. Add to this list rather than
// loosening the check, so an address that might be a person still stops the gate.
const assistantEmails = ['noreply@anthropic.com']

export const isAssistant = (email: string) => assistantEmails.includes(email)

const noreplyRe = /^(?:\d+\+)?([A-Za-z0-9-]+(?:\[bot\])?)@users\.noreply\.github\.com$/

// The id in the <id>+<login> form is discarded rather than read: the whole address comes from a
// commit message, so an id taken on trust there would let a pull request sign for anyone it named.
export function noreplyLogin(email: string) {
  return noreplyRe.exec(email)?.[1] ?? ''
}

const entryKey = (s: Signature) => JSON.stringify([s.login, s.id, s.date, s.cla])

// Keeps existing entries immutable and takes only the opener's own signature. The opener is the one
// principal that cannot be forged, so accepting any other would let a pull request sign for anyone.
export function appendOnly(base: SignatureFile, head: SignatureFile, signer: Principal, inForce: string) {
  // inForce is the base branch tip, not the merge base: a branch that predates a version bump would
  // otherwise sign the retired version and pass.
  if (head.cla_version !== inForce) {
    return `cla_version is ${quote(inForce)} on the base branch but ${quote(head.cla_version)} here; it is set on the base branch, not by a contribution. Merge the base branch if this one is behind; a version bump lands by pushing to the base branch, not through a pull request`
  }
  const inHead = new Set(head.signatures.map(entryKey))
  for (const b of base.signatures) {
    if (!inHead.has(entryKey(b))) {
      return `this pull request edits or removes the signature of ${quote(b.login)}; cla/signatures.json is append-only`
    }
  }
  const inBase = new Set(base.signatures.map(entryKey))
  for (const h of head.signatures) {
    if (inBase.has(entryKey(h))) continue
    if (h.id !== signer.id) {
      return `this pull request adds a signature for ${quote(h.login)}, who did not open it; you may only sign for yourself, so a co-author signs in a pull request of their own`
    }
    // Signing matches on the id, so a mismatched login would stand in the record as a signature by
    // whoever it names.
    if (h.login.toLowerCase() !== signer.login.toLowerCase()) {
      return `this signature records id ${h.id} under the login ${quote(h.login)}, but that id belongs to ${quote(signer.login)}`
    }
    // A new entry at a retired version records an agreement never given, and hasSigned reads it as
    // unsigned anyway.
    if (h.cla !== head.cla_version) {
      return `this signature is recorded against CLA ${quote(h.cla)}, but ${quote(head.cla_version)} is the version in force; sign the current one`
    }
  }
  return null
}

const byLogin = (a: Principal, b: Principal) => (a.login < b.login ? -1 : a.login > b.login ? 1 : 0)

// Bots are dropped: a machine-authored commit carries no human authorship to license. Every id here
// was resolved against the API, so a login cannot be shaped to look like a bot and slip through.
export function unsigned(head: SignatureFile, people: Principal[]) {
  const seen = new Set<number>()
  const checked: Principal[] = []
  const missing: Principal[] = []
  for (const p of people) {
    if (p.type === 'Bot' || p.id === 0 || seen.has(p.id)) continue
    seen.add(p.id)
    checked.push(p)
    if (!hasSigned(head, p.id)) missing.push(p)
  }
  return { missing: missing.sort(byLogin), checked: checked.sort(byLogin) }
}
