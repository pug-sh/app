import type { Principal, Signature, SignatureFile } from './check.ts'

type ReportConfig = { repo: string; baseRef: string; serverURL: string; opener: Principal }

export type Report = {
  text: string // job log, plus the ::error:: annotation shown on the checks page
  markdown: string // job summary, rendered on the checks page without opening the log
  comment: string // pull request comment, the only report seen without opening the job log
}

// GitHub's workflow-command encoding. An error can carry a value the pull request chose — a login
// out of cla/signatures.json — and a raw newline in one would start a second command below it.
export const escapeAnnotation = (s: string) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')

// Identifies the gate's own comment so a re-run edits it instead of posting another. Invisible in
// the rendered comment.
export const commentMarker = '<!-- cla-gate:signature-request -->'

// The gate's two labels. They are mutually exclusive, so setting one clears the other; create them
// in the repository so they get a deliberate colour.
export const labelSigned = 'cla: signed'
export const labelUnsigned = 'cla: not signed'

// Built from the Signature shape rather than written out by hand, so the entry a contributor is
// told to paste keeps whatever shape the gate parses back.
function entryJSON(p: Principal, version: string, indent: string, now: Date) {
  const entry: Signature = { login: p.login, id: p.id, date: now.toISOString().slice(0, 10), cla: version }
  return JSON.stringify(entry, null, 2)
    .split('\n')
    .map(line => indent + line)
    .join('\n')
}

// A trailer address is whatever the commit message said, so it reaches markdown only inside a code
// span. The backtick that would end the span early is dropped rather than escaped.
const mdCode = (s: string) => `\`${s.replaceAll('`', '')}\``

const verbatim = (s: string) => s

// Renders a list into the sentence around it: "a", "a and b", "a, b and c".
function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const loginsOf = (ps: Principal[]) => ps.map(p => p.login)

function splitByOpener(missing: Principal[], openerID: number) {
  return {
    mine: missing.find(p => p.id === openerID) ?? null,
    others: missing.filter(p => p.id !== openerID),
  }
}

// appendOnly will not take a co-author's signature from this pull request, and an assistant holds no
// copyright, so each block has to name the way out or the gate is red with none.
function trailerBlocks(others: Principal[], unidentified: string[], quote: (s: string) => string) {
  const out: string[] = []
  if (others.length > 0) {
    const verb =
      others.length > 1
        ? 'have work in this pull request and have not signed'
        : 'has work in this pull request and has not signed'
    out.push(
      `${joinNames(loginsOf(others))} ${verb}. Everyone signs in a pull request they opened themselves, so this one cannot sign for them.`,
    )
  }
  if (unidentified.length > 0) {
    // The address never opens the line: one starting "::" is a workflow command, and this line goes
    // to the log as well.
    const lead = unidentified.length > 1 ? 'Co-authored-by trailers name ' : 'A Co-authored-by trailer names '
    out.push(
      `${lead}${joinNames(unidentified.map(quote))}, which the check cannot identify. Use the ${quote('<id>+<login>@users.noreply.github.com')} address GitHub writes itself, or drop the trailer if it names an assistant.`,
    )
  }
  return out
}

// Only the opener is mentioned: every other login can be invented by a Co-authored-by trailer,
// which would let a pull request notify anyone it names.
function signMarkdown(
  claURL: string,
  head: SignatureFile,
  mine: Principal | null,
  blocks: string[],
  now: Date,
  mention: boolean,
) {
  // The comment notifies the opener. With nothing for them to sign, a heading demanding their
  // signature reads as a demand they have already met.
  const heading = mine ? '## CLA signature required' : '## CLA check blocked'
  const tail = mine ? '' : ' Still outstanding:'
  const md = [
    `${heading}\n\n`,
    `Thanks for contributing! Everyone with work in this pull request has to sign the [Contributor License Agreement](${claURL}) before it can merge.${tail}\n`,
  ]
  if (mine) {
    const name = mention ? `@${mine.login}` : mine.login
    md.push(
      `\n**${name}** — add this to the \`signatures\` array in \`cla/signatures.json\`, then commit and push. That commit is your signature.\n\n\`\`\`json\n${entryJSON(mine, head.cla_version, '', now)}\n\`\`\`\n`,
    )
  }
  for (const b of blocks) md.push(`\n${b}\n`)
  return md.join('')
}

// What a contributor actually meets when the gate fails: their entry already filled in, so signing
// is a copy and a commit. Only the opener's is offered, since appendOnly accepts no other.
export function unsignedReport(
  cfg: ReportConfig,
  head: SignatureFile,
  missing: Principal[],
  unidentified: string[],
  now: Date,
): Report {
  const { mine, others } = splitByOpener(missing, cfg.opener.id)
  const claURL = `${cfg.serverURL}/${cfg.repo}/blob/${cfg.baseRef}/CLA.md`
  const named: string[] = []
  if (missing.length > 0) named.push(`not signed by: ${loginsOf(missing).join(', ')}`)
  if (unidentified.length > 0) named.push(`could not identify: ${unidentified.join(', ')}`)

  // The names carry a trailer address, which is the pull request's to choose, so the annotation is
  // encoded: a bare %0A in one would start a second command.
  const text = [
    `::error::CLA ${escapeAnnotation(head.cla_version)} ${escapeAnnotation(named.join('; '))}\n`,
    `\nThe agreement: ${claURL}\n`,
  ]
  if (mine) {
    text.push('\nAdd this entry to cla/signatures.json, then commit and push — that\ncommit is your signature:\n\n')
    text.push(`${entryJSON(mine, head.cla_version, '  ', now)}\n`)
  }
  for (const b of trailerBlocks(others, unidentified, verbatim)) text.push(`\n${b}\n`)

  const marked = trailerBlocks(others, unidentified, mdCode)
  return {
    text: text.join(''),
    markdown: signMarkdown(claURL, head, mine, marked, now, false),
    comment: `${commentMarker}\n${signMarkdown(claURL, head, mine, marked, now, true)}`,
  }
}

// Replaces a request comment once the signature lands, so a merged pull request is not left showing
// a demand that has already been met.
export const signedComment = (version: string) => `${commentMarker}\nCLA ${version} signed — thanks!\n`

// The reason stays in the log: it quotes a login out of the pull request's own file, which would
// break out of any markup used here.
export const rejectedComment = () =>
  `${commentMarker}\nThe change to \`cla/signatures.json\` was rejected. See the job log on the checks tab for what to fix.\n`

// An unlinked commit email is the contributor's to fix, so it gets a comment naming the remedy
// rather than the generic "did not finish".
export const unlinkedComment = (serverURL: string) =>
  `${commentMarker}\nA commit in this pull request has an author email that is not linked to a GitHub account, so the CLA check cannot identify who wrote it. Add the address at ${serverURL}/settings/emails, or rewrite the commits to use your \`@users.noreply.github.com\` address. See the job log on the checks tab for the commits involved.\n`

export const problemComment = () =>
  `${commentMarker}\nThe CLA check did not finish. See the job log on the checks tab for what went wrong.\n`
