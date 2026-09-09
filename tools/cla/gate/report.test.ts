import { expect, test } from 'bun:test'
import { appendOnly, invalidReason, type Principal, parseSignatureFile, type SignatureFile } from './check.ts'
import { commentMarker, joinNames, type ReportContext, signedComment, unsignedReport } from './report.ts'
import { file, fixedNow, sig, user } from './test-support.ts'

// carol opens every report test: the entry the report hands out is the opener's, because appendOnly
// will not accept anyone else's.
const reportCfg = (): ReportContext => ({
  repo: 'pug-sh/app',
  baseRef: 'main',
  serverURL: 'https://github.com',
  opener: user('carol', 42),
})

const carol = user('carol', 42)
const dave = user('dave', 7)

test('the report fills in the contributor’s entry', () => {
  const r = unsignedReport(reportCfg(), file(), [carol], [], fixedNow)

  expect(r.text.startsWith('::error::CLA v1 not signed by: carol\n')).toBe(true)
  for (const want of ['"login": "carol"', '"id": 42', '"date": "2026-08-30"', '"cla": "v1"']) {
    expect(r.text).toContain(want)
    expect(r.markdown).toContain(want)
  }
  const claURL = 'https://github.com/pug-sh/app/blob/main/CLA.md'
  expect(r.text).toContain(claURL)
  expect(r.markdown).toContain(claURL)
})

// The block is one entry for the contributor to append, so it has to parse as a signature — and
// appending it must be the whole of what the gate wants back.
test('the report emits an appendable entry', () => {
  const head = file(sig('alice', 1))
  const r = unsignedReport(reportCfg(), head, [carol], [], fixedNow)

  const block = r.comment.split('```json\n')[1]?.split('```')[0]
  expect(block).toBeDefined()

  const entry = parseSignatureFile(`{"cla_version":"v1","signatures":[${block}]}`).signatures![0]!
  expect(entry.id).toBe(42)
  expect(entry.login).toBe('carol')
  expect(entry.cla).toBe('v1')
  expect(entry.date).toBe('2026-08-30')

  // Appending it and changing nothing else is the whole of the instruction, so it has to be the
  // whole of what the gate asks for.
  const signed: SignatureFile = { claVersion: 'v1', signatures: [...head.signatures!, entry] }
  expect(invalidReason(signed)).toBeNull()
  expect(appendOnly(head, signed, reportCfg().opener, 'v1')).toBeNull()
})

// A login other than the opener's can be invented by a Co-authored-by trailer, so mentioning one
// would let any pull request make the bot notify anyone it names. Only the opener is mentioned.
test('only the opener is mentioned', () => {
  const r = unsignedReport(reportCfg(), file(), [carol, user('torvalds', 7)], [], fixedNow)

  expect(r.comment).toContain('@carol')
  expect(r.comment).not.toContain('@torvalds')
  expect(r.markdown).not.toContain('@carol')
  expect(r.comment.startsWith(commentMarker)).toBe(true)
  expect(signedComment('v1').startsWith(commentMarker)).toBe(true)
})

// A co-author is named but handed no entry: appendOnly would reject one added here, so printing it
// would be advice that fails on the next run.
test('a co-author is named but gets no entry', () => {
  const r = unsignedReport(reportCfg(), file(), [carol, dave], [], fixedNow)

  for (const part of [r.text, r.comment, r.markdown]) {
    expect(part).toContain('dave')
    expect(part).not.toContain('"id": 7')
    expect(part).toContain('commenting `/sign`')
  }
})

// The opener may already have signed, leaving only a co-author outstanding. There is then nothing
// for this pull request to add, and the report must not imply otherwise.
test('with only a co-author outstanding, no entry is offered', () => {
  const r = unsignedReport(reportCfg(), file(), [dave], [], fixedNow)

  expect(r.comment).not.toContain('```json')
  expect(r.comment).toContain('dave')
  expect(r.comment).toContain('commenting `/sign`')
  expect(r.comment).not.toContain('\n\n\n')
})

// A trailer address is commit-message text the pull request chose. It reaches an annotation, a log
// line and a comment, and must be inert in all three.
test('a hostile trailer address is neutralised', () => {
  const hostile = ['a%0A::error::forged@x', '[click](https://evil.example)', 'back`tick@x']
  const r = unsignedReport(reportCfg(), file(), [carol], hostile, fixedNow)

  const lines = r.text.split(/[\r\n]/).filter(l => l !== '')
  expect(lines[0]!.startsWith('::error::')).toBe(true)
  expect(lines[0]).not.toContain('%0A::error::')
  for (const l of lines.slice(1)) expect(l.startsWith('::')).toBe(false)

  // Markdown gets it inside a code span, so a link renders as its own text.
  expect(r.comment).toContain('`[click](https://evil.example)`')
  expect(r.comment).toContain('`backtick@x`')
  expect(r.comment).not.toContain('back`tick')
})

// The opener is who the comment notifies. With nothing left for them to sign, a heading demanding a
// signature reads as a demand they have already met.
test('the heading follows what is blocking', () => {
  const mine = unsignedReport(reportCfg(), file(), [carol], [], fixedNow).comment
  expect(mine.startsWith(`${commentMarker}\n## CLA signature required`)).toBe(true)

  const theirs = unsignedReport(reportCfg(), file(), [dave], [], fixedNow).comment
  expect(theirs.startsWith(`${commentMarker}\n## CLA check blocked`)).toBe(true)
  expect(theirs).not.toContain('signature required')
  expect(theirs).toContain('Still outstanding:')
})

// A comma-joined list reads as one subject taking a singular verb, so the count has to reach the
// verb and the noun as well as the join.
test('the blocks agree in number', () => {
  const one: Principal[] = [dave]
  const two: Principal[] = [dave, user('erin', 8)]

  const single = unsignedReport(reportCfg(), file(), one, ['a@x'], fixedNow).comment
  expect(single).toContain('dave has work')
  expect(single).toContain('A Co-authored-by trailer names')

  const plural = unsignedReport(reportCfg(), file(), two, ['a@x', 'b@y'], fixedNow).comment
  expect(plural).toContain('dave and erin have work')
  expect(plural).toContain('Co-authored-by trailers name')
  expect(plural).toContain('`a@x` and `b@y`')

  expect(joinNames(['a', 'b', 'c'])).toBe('a, b and c')
})
