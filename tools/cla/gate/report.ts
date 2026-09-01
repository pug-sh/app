// What a contributor actually meets when the gate fails: the annotation on the checks page, the job
// summary, and the pull request comment.

import type { Principal, SignatureFile } from './check.ts'
import { signaturesPath } from './github.ts'

export type Report = {
  text: string // job log, plus the ::error:: annotation shown on the checks page
  markdown: string // job summary, rendered on the checks page without opening the log
  comment: string // pull request comment, the only report seen without opening the job log
}

// What the report needs from the run. Config satisfies it structurally.
export type ReportContext = {
  repo: string
  baseRef: string
  serverURL: string
  opener: Principal
}

// GitHub's workflow-command encoding. An error can carry a value the pull request chose — a login
// out of the signature file — and a raw newline in one would start a second command on the line below.
export const escapeAnnotation = (s: string) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')

// Identifies the gate's own comment so a re-run edits it instead of posting another. Invisible in
// the rendered comment.
export const commentMarker = '<!-- cla-gate:signature-request -->'

// The gate's two labels. They are mutually exclusive, so setting one clears the other; create them
// in the repository so they get a deliberate colour.
export const labelSigned = 'cla: signed'
export const labelUnsigned = 'cla: not signed'

const isoDate = (now: Date) => now.toISOString().slice(0, 10)

// Serialised in the field order the file uses, so the entry a contributor is told to paste keeps
// whatever shape the gate parses back.
const entryJson = (p: Principal, version: string, indent: string, now: Date) =>
  JSON.stringify({ login: p.login, id: p.id, date: isoDate(now), cla: version }, null, 2)
    .split('\n')
    .map(l => indent + l)
    .join('\n')

const loginsOf = (ps: Principal[]) => ps.map(p => p.login)

const splitByOpener = (missing: Principal[], openerId: number) => ({
  mine: missing.find(p => p.id === openerId),
  others: missing.filter(p => p.id !== openerId),
})

// "a", "a and b", "a, b and c".
export const joinNames = (names: string[]) => {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// A trailer address is whatever the commit message said, so it reaches markdown only inside a code
// span, which renders it literally. The backtick that would end the span early is dropped rather
// than escaped: an address has no use for one, and a half-escaped span is worse than a missing
// character.
const mdCode = (s: string) => `\`${s.replaceAll('`', '')}\``

const verbatim = (s: string) => s

// appendOnly will not take a co-author's signature out of this pull request's own contents, and an
// assistant holds no copyright to license, so each block has to name the way out or the gate is red
// with none. quote renders the trailer address for whichever surface the blocks are bound for; a
// login needs none of it, since it comes back from the API rather than out of the commit.
const trailerBlocks = (others: Principal[], unknown: string[], quote: (s: string) => string) => {
  const out: string[] = []
  if (others.length > 0) {
    const verb =
      others.length > 1
        ? 'have work in this pull request and have not signed'
        : 'has work in this pull request and has not signed'
    out.push(`${joinNames(loginsOf(others))} ${verb}. They can sign by commenting \`/sign\` here.`)
  }
  if (unknown.length > 0) {
    const lead = unknown.length > 1 ? 'Co-authored-by trailers name ' : 'A Co-authored-by trailer names '
    // The address never opens the line: one starting "::" is a workflow command, and this line goes
    // to the log as well.
    out.push(
      `${lead}${joinNames(unknown.map(quote))}, which the check cannot identify. Use the ` +
        `${quote('<id>+<login>@users.noreply.github.com')} address GitHub writes itself, or drop the trailer if it names an assistant.`,
    )
  }
  return out
}

// Only the opener is mentioned: every other login can be invented by a Co-authored-by trailer,
// which would let a pull request notify anyone it names.
const signMarkdown = (
  claURL: string,
  head: SignatureFile,
  mine: Principal | undefined,
  blocks: string[],
  now: Date,
  mention: boolean,
) => {
  // The comment notifies the opener. With nothing for them to sign, a heading demanding their
  // signature reads as a demand they have already met.
  const heading = mine === undefined ? '## CLA check blocked' : '## CLA signature required'
  const tail = mine === undefined ? ' Still outstanding:' : ''

  let md = `${heading}\n\n`
  md += `Thanks for contributing! Everyone with work in this pull request has to sign the [Contributor License Agreement](${claURL}) before it can merge.${tail}\n`
  if (mine !== undefined) {
    const name = mention ? `@${mine.login}` : mine.login
    md += `\n**${name}** — comment \`/sign\` on this pull request and that is done. To sign by hand instead, add this to the \`signatures\` array in \`${signaturesPath}\`, then commit and push:\n\n`
    md += `\`\`\`json\n${entryJson(mine, head.claVersion, '', now)}\n\`\`\`\n`
  }
  for (const b of blocks) md += `\n${b}\n`
  return md
}

// The report carries the contributor's entry already filled in, so signing is a copy and a commit
// rather than a hunt through documentation for a numeric id they have never needed.
//
// Only the opener's entry is offered: appendOnly accepts no other, so printing one for a co-author
// would be advice that fails on the next run.
export const unsignedReport = (
  cfg: ReportContext,
  head: SignatureFile,
  missing: Principal[],
  unknown: string[],
  now: Date,
): Report => {
  const { mine, others } = splitByOpener(missing, cfg.opener.id)
  const claURL = `${cfg.serverURL}/${cfg.repo}/blob/${cfg.baseRef}/CLA.md`
  const named = [...loginsOf(missing), ...unknown]

  // The names carry a trailer address, which is the pull request's to choose, so the annotation is
  // encoded: a bare %0A in one would start a second command.
  let text = `::error::CLA ${head.claVersion} not signed by: ${escapeAnnotation(named.join(', '))}\n`
  text += `\nThe agreement: ${claURL}\n`
  if (mine !== undefined) {
    text += '\nComment /sign on the pull request, or add this entry to\n'
    text += `${signaturesPath} and push it:\n\n`
    text += `${entryJson(mine, head.claVersion, '  ', now)}\n`
  }
  for (const b of trailerBlocks(others, unknown, verbatim)) text += `\n${b}\n`

  const marked = trailerBlocks(others, unknown, mdCode)
  return {
    text,
    markdown: signMarkdown(claURL, head, mine, marked, now, false),
    comment: `${commentMarker}\n${signMarkdown(claURL, head, mine, marked, now, true)}`,
  }
}

// Replaces a request comment once the signature lands, so a merged pull request is not left showing
// a demand that has already been met.
export const signedComment = (version: string) => `${commentMarker}\nCLA ${version} signed — thanks!\n`

// Like problemComment, the reason stays in the log: it quotes a login out of the pull request's own
// file. The comment only has to get the contributor there.
export const rejectedComment = () =>
  `${commentMarker}\nThe change to \`${signaturesPath}\` was rejected. See the job log on the checks tab for what to fix.\n`

export const problemComment = () =>
  `${commentMarker}\nThe CLA check did not finish. See the job log on the checks tab for what went wrong.\n`
