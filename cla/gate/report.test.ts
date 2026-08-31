import { expect, test } from 'bun:test'
import { appendOnly, type Signature, validate } from './check.ts'
import { file, fixedNow, sig, user } from './fixtures.ts'
import { commentMarker, escapeAnnotation, signedComment, unsignedReport } from './report.ts'

// carol opens every report test: the entry the report hands out is the opener's, because appendOnly
// will not accept anyone else's.
const carol = user('carol', 42)
const dave = user('dave', 7)
const cfg = { repo: 'pug-sh/app', baseRef: 'main', serverURL: 'https://github.com', opener: carol }
const claURL = 'https://github.com/pug-sh/app/blob/main/CLA.md'

test("the report fills in the contributor's entry", () => {
  const r = unsignedReport(cfg, file(), [carol], [], fixedNow)

  expect(r.text.startsWith('::error::CLA v1 not signed by: carol\n')).toBe(true)
  for (const part of [r.text, r.markdown]) {
    for (const want of ['"login": "carol"', '"id": 42', '"date": "2026-08-30"', '"cla": "v1"', claURL]) {
      expect(part).toContain(want)
    }
  }
})

// The block is one entry for the contributor to append, so it has to parse as a signature — and
// appending it must be the whole of what the gate wants back.
test('the entry the report prints is the one the gate accepts', () => {
  const head = file(sig('alice', 1))
  const r = unsignedReport(cfg, head, [carol], [], fixedNow)

  const block = r.comment.split('```json\n')[1]?.split('```')[0]
  expect(block).toBeDefined()
  const entry = JSON.parse(block as string) as Signature
  expect(entry).toEqual({ login: 'carol', id: 42, date: '2026-08-30', cla: 'v1' })

  const signed = file(...head.signatures, entry)
  expect(validate(signed)).toBeNull()
  expect(appendOnly(head, signed, carol, 'v1')).toBeNull()
})

// A login other than the opener's can be invented by a Co-authored-by trailer, so mentioning one
// would let any pull request make the bot notify anyone it names.
test('only the opener is mentioned', () => {
  const r = unsignedReport(cfg, file(), [carol, user('torvalds', 7)], [], fixedNow)

  expect(r.comment).toContain('@carol')
  expect(r.comment).not.toContain('@torvalds')
  expect(r.markdown).not.toContain('@carol')
  expect(r.comment.startsWith(commentMarker)).toBe(true)
  // Or the signed note posts as a second comment instead of replacing the request.
  expect(signedComment('v1').startsWith(commentMarker)).toBe(true)
})

// appendOnly would reject an entry added here for someone else, so printing one would be advice
// that fails on the next run.
test('a co-author is named but handed no entry', () => {
  const r = unsignedReport(cfg, file(), [carol, dave], [], fixedNow)

  for (const part of [r.text, r.comment, r.markdown]) {
    expect(part).toContain('dave')
    expect(part).not.toContain('"id": 7')
    expect(part).toContain('opened themselves')
  }
})

// The opener may already have signed, leaving only a co-author outstanding. There is then nothing
// for this pull request to add, and the report must not imply otherwise.
test('with only a co-author outstanding the report offers no entry', () => {
  const r = unsignedReport(cfg, file(), [dave], [], fixedNow)

  expect(r.comment).not.toContain('```json')
  expect(r.comment).toContain('dave')
  expect(r.comment).toContain('opened themselves')
  expect(r.comment).not.toContain('\n\n\n')
})

// A trailer address is commit-message text the pull request chose. It reaches an annotation, a log
// line and a comment, and must be inert in all three.
test('a hostile trailer address is neutralised', () => {
  const hostile = ['a%0A::error::forged@x', '[click](https://evil.example)', 'back`tick@x']
  const r = unsignedReport(cfg, file(), [carol], hostile, fixedNow)

  const lines = r.text.split(/[\r\n]/).filter(l => l !== '')
  expect(lines[0].startsWith('::error::')).toBe(true)
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
  const mine = unsignedReport(cfg, file(), [carol], [], fixedNow).comment
  expect(mine.startsWith(`${commentMarker}\n## CLA signature required`)).toBe(true)

  const theirs = unsignedReport(cfg, file(), [dave], [], fixedNow).comment
  expect(theirs.startsWith(`${commentMarker}\n## CLA check blocked`)).toBe(true)
  expect(theirs).not.toContain('signature required')
  expect(theirs).toContain('Still outstanding:')
})

// A comma-joined list reads as one subject taking a singular verb, so the count has to reach the
// verb and the noun as well as the join.
test('the blocks agree in number', () => {
  const single = unsignedReport(cfg, file(), [dave], ['a@x'], fixedNow).comment
  expect(single).toContain('dave has work')
  expect(single).toContain('A Co-authored-by trailer names')

  const plural = unsignedReport(cfg, file(), [dave, user('erin', 8)], ['a@x', 'b@y'], fixedNow).comment
  expect(plural).toContain('dave and erin have work')
  expect(plural).toContain('Co-authored-by trailers name')
  expect(plural).toContain('`a@x` and `b@y`')

  const three = unsignedReport(cfg, file(), [dave, user('erin', 8), user('frank', 9)], [], fixedNow).comment
  expect(three).toContain('dave, erin and frank have work')
})

// The annotation is one line, and a raw break in a value starts a second workflow command below it.
// The trailer case only ever exercised the percent rule.
test('escapeAnnotation encodes the line breaks, not just the percent', () => {
  expect(escapeAnnotation('a\nb')).toBe('a%0Ab')
  expect(escapeAnnotation('a\rb')).toBe('a%0Db')
  expect(escapeAnnotation('100%')).toBe('100%25')
})

// validate() is what keeps a break out of cla_version, and it lives two modules from here.
test('a hostile cla_version cannot forge a second command', () => {
  const head = { cla_version: 'v1\n::error::forged', signatures: [] }
  const r = unsignedReport(cfg, head, [carol], [], fixedNow)

  expect(r.text.split('\n').filter(l => l.startsWith('::'))).toHaveLength(1)
})

// A transient 404 on /users lands in unidentified. Folding that into one "not signed by" list
// accused a contributor of not signing when the real fact was an outage.
test('an address the check could not identify is not reported as unsigned', () => {
  const outage = unsignedReport(cfg, file(), [], ['a@x'], fixedNow)
  expect(outage.text).toContain('could not identify: a@x')
  expect(outage.text).not.toContain('not signed by')

  const both = unsignedReport(cfg, file(), [carol], ['a@x'], fixedNow)
  expect(both.text).toContain('not signed by: carol')
  expect(both.text).toContain('could not identify: a@x')
})
