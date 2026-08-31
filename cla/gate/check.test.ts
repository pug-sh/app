import { expect, test } from 'bun:test'
import {
  appendOnly,
  coauthorEmails,
  hasSigned,
  noreplyLogin,
  parseSignatureFile,
  principals,
  type Signature,
  type SignatureFile,
  unsigned,
  validate,
  webFlowID,
} from './check.ts'
import { commit, file, sig, user } from './fixtures.ts'

// Each case takes a file that validates and breaks exactly one thing about it, so what is under
// test is the field named in the case.
const corruptions: {
  name: string
  patch?: Partial<Signature>
  version?: string
  extra?: Signature
  want: string
}[] = [
  { name: 'the id is missing', patch: { id: 0 }, want: 'id is missing' },
  { name: 'the login is empty', patch: { login: '' }, want: 'login is empty' },
  { name: 'the date is not a date', patch: { date: 'yesterday' }, want: 'date is not a real' },
  { name: 'the day is impossible', patch: { date: '2026-02-30' }, want: 'date is not a real' },
  { name: 'the month is impossible', patch: { date: '2026-99-99' }, want: 'date is not a real' },
  { name: 'the date is unpadded', patch: { date: '2026-2-3' }, want: 'date is not a real' },
  { name: 'the cla is malformed', patch: { cla: '' }, want: 'cla is missing or malformed' },
  { name: 'cla_version is absent', version: '', want: 'cla_version is missing' },
  { name: 'cla_version spans a line', version: 'v1\n::error::injected', want: 'must be one line' },
  { name: 'the same id signs one version twice', extra: sig('b', 1), want: 'repeats the id and version' },
]

for (const { name, patch, version, extra, want } of corruptions) {
  test(`validate rejects a file where ${name}`, () => {
    const f = file(sig('a', 1))
    expect(validate(f)).toBeNull()
    Object.assign(f.signatures[0], patch)
    if (version !== undefined) f.cla_version = version
    if (extra) f.signatures.push(extra)
    expect(validate(f)).toContain(want)
  })
}

// The absent key is the only thing separating "this file has no signatures key" from "the array is
// empty", and an object-shaped one is what a jq-based check silently accepted.
test('parse rejects a signatures key that is absent or not an array', () => {
  expect(() => parseSignatureFile('{"cla_version":"v1"}')).toThrow('signatures is missing')
  expect(() => parseSignatureFile('{"cla_version":"v1","signatures":{"a":{"id":1}}}')).toThrow(
    'signatures must be an array',
  )
  expect(parseSignatureFile('{"cla_version":"v1","signatures":[]}')).toEqual(file())
})

// JSON.parse hands back whatever the file said, so the types the gate compares on have to be
// checked here rather than assumed: a string id would never equal the number the API returns.
test('parse rejects a signature field of the wrong type', () => {
  expect(() => parseSignatureFile('{"cla_version":"v1","signatures":[{"id":"42"}]}')).toThrow('must be a whole number')
  expect(() => parseSignatureFile('{"cla_version":"v1","signatures":[{"login":42}]}')).toThrow('must be a string')
  expect(() => parseSignatureFile('{"cla_version":1,"signatures":[]}')).toThrow('must be a string')
  // Past 2^53 two ids parse to the same number, which would hand one account the other's signature.
  expect(() => parseSignatureFile('{"cla_version":"v1","signatures":[{"id":9007199254740993}]}')).toThrow(
    'must be a whole number',
  )
})

// An absent field decodes to its zero value, so validate names it rather than the parser failing on
// the first one it meets.
test('parse leaves a missing field to validate', () => {
  const f = parseSignatureFile('{"cla_version":"v1","signatures":[{"login":"a"}]}')
  expect(f.signatures[0]).toEqual({ login: 'a', id: 0, date: '', cla: '' })
  expect(validate(f)).toContain('id is missing or zero')
})

test('a signature is matched by id, so a rename keeps it and re-registering the login does not', () => {
  const head = file(sig('alice', 1))
  const renamed = unsigned(head, [user('alice-renamed', 1)])
  expect(renamed.missing).toEqual([])
  expect(renamed.checked).toHaveLength(1)
  expect(unsigned(head, [user('alice', 99)]).missing).toHaveLength(1)
})

// The exemption reads the account type from the API: a login merely shaped like a bot's is a person.
test('only a real bot account is exempt', () => {
  expect(unsigned(file(), [{ id: 1, login: 'dependabot[bot]', type: 'Bot' }]).missing).toEqual([])
  for (const login of ['dependabott', 'renovateb', 'github-actionso', 'dependabot[bot]']) {
    expect(unsigned(file(), [user(login, 5)]).missing).toHaveLength(1)
  }
})

test('unsigned deduplicates by id and skips an unresolved one', () => {
  const people = [user('alice', 1), user('alice', 1), user('bob', 2), user('', 0)]
  const { missing, checked } = unsigned(file(sig('alice', 1)), people)
  expect(checked).toHaveLength(2)
  expect(missing.map(p => p.login)).toEqual(['bob'])
})

// Setting --author to someone who has signed does not launder the commit.
test('the committer is checked, not just the author', () => {
  const { found, unlinked } = principals([commit('a1', user('alice', 1), user('mallory', 2), 'x')], user('alice', 1))
  expect(unlinked).toEqual([])
  expect(unsigned(file(sig('alice', 1)), found).missing.map(p => p.login)).toEqual(['mallory'])
})

// Excluded by id: the login comes from a commit email the contributor chooses, so anyone could have
// named themselves web-flow and dropped out of the check.
test("GitHub's web-flow committer is exempt, but only on its real id", () => {
  const real = principals([commit('a1', user('alice', 1), user('web-flow', webFlowID), 'x')], user('alice', 1))
  expect(unsigned(file(sig('alice', 1)), real.found).missing).toEqual([])

  const impostor = principals([commit('a1', user('alice', 1), user('web-flow', 5), 'x')], user('alice', 1))
  expect(unsigned(file(sig('alice', 1)), impostor.found).missing).toHaveLength(1)
})

// jq's `//` applied to the whole stream, so a null author among linked ones vanished.
test('a commit whose email is not linked to an account is reported, not dropped', () => {
  const { unlinked } = principals(
    [
      commit('a1', user('alice', 1), user('alice', 1), 'x'),
      commit('b2', null, null, 'y'),
      commit('c3', user('bob', 2), user('bob', 2), 'z'),
    ],
    user('alice', 1),
  )
  expect(unlinked).toEqual(['b2'])
})

test('co-authored-by trailers are collected, cased and sorted', () => {
  const msg =
    'feat: thing\n\nCo-authored-by: Bob <99+bob@users.noreply.github.com>\nco-authored-by: Carol <Carol@Example.com>\n'
  expect(coauthorEmails([commit('a1', user('alice', 1), user('alice', 1), msg)])).toEqual([
    '99+bob@users.noreply.github.com',
    'carol@example.com',
  ])
})

// A trailer spanning a newline would inject its own ::workflow:: commands when echoed back.
test('a trailer address stops at the line end', () => {
  const msg = 'feat\n\nCo-authored-by: X <bob@example.com\n::error::injected>\n'
  expect(coauthorEmails([commit('a1', user('alice', 1), user('alice', 1), msg)])).toEqual([])
})

// A lone CR ends a line for the Actions log and, per CommonMark, for the comment too.
test('a trailer address cannot carry a carriage return', () => {
  const msg = 'feat\n\nCo-authored-by: M <a\r\r[click](https://evil.example)@x>\n'
  const got = coauthorEmails([commit('a1', null, null, msg)])
  expect(got).toHaveLength(1)
  expect(got[0]).not.toContain('\r')
})

// The id in a noreply address is commit-message text. Taking it on trust let a pull request sign for
// anyone whose id it wrote into a trailer.
test('only the noreply form yields a login, and the embedded id is discarded', () => {
  for (const [email, want] of Object.entries({
    'alice@users.noreply.github.com': 'alice',
    '12345+alice@users.noreply.github.com': 'alice',
    '1+dependabot[bot]@users.noreply.github.com': 'dependabot[bot]',
    'someone@example.com': '',
    'woof@pug.sh': '',
    '1+alice@users.noreply.github.example': '',
  })) {
    expect(noreplyLogin(email)).toBe(want)
  }
})

// A version bump is signed by adding an entry, so the old one stays and both coexist.
test('only an entry at the version in force counts as signed', () => {
  const f: SignatureFile = {
    cla_version: 'v2',
    signatures: [
      { login: 'alice', id: 1, date: '2026-01-01', cla: 'v1' },
      { login: 'bob', id: 2, date: '2026-01-01', cla: 'v2' },
    ],
  }
  expect(validate(f)).toBeNull()
  expect(hasSigned(f, 1)).toBe(false)
  expect(hasSigned(f, 2)).toBe(true)
})

// A bump retires the old text, so an entry added against it would record an agreement never given.
test('a new signature must be at the version in force', () => {
  const alice = { login: 'alice', id: 1, date: '2025-01-01', cla: 'v1' }
  const v2 = (...s: (typeof alice)[]): SignatureFile => ({ cla_version: 'v2', signatures: s })
  const bob = user('bob', 2)

  const stale = v2(alice, { login: 'bob', id: 2, date: '2026-08-31', cla: 'v1' })
  expect(appendOnly(v2(alice), stale, bob, 'v2')).toContain('version in force')

  const current = v2(alice, { login: 'bob', id: 2, date: '2026-08-31', cla: 'v2' })
  expect(appendOnly(v2(alice), current, bob, 'v2')).toBeNull()
  // The bump does not invalidate what came before: alice's v1 entry stays as the record.
  expect(validate(current)).toBeNull()
})

test('appendOnly takes the opener’s own signature and nothing else', () => {
  const base = file(sig('alice', 1))
  const bob = user('bob', 2)

  expect(appendOnly(base, file(sig('alice', 1), sig('bob', 2)), bob, 'v1')).toBeNull()
  expect(appendOnly(base, file(sig('bob', 2)), bob, 'v1')).toContain('append-only')

  const edited = file(sig('alice', 1), sig('bob', 2))
  edited.signatures[0].date = '2020-01-01'
  expect(appendOnly(base, edited, bob, 'v1')).toContain('append-only')

  expect(appendOnly(base, file(sig('alice', 1), sig('stranger', 42)), bob, 'v1')).toContain('did not open it')
  // GitHub folds case in a login, and the report hands out the canonical form.
  expect(appendOnly(base, file(sig('alice', 1), sig('BoB', 2)), bob, 'v1')).toBeNull()
})

// The id is what signing is matched on, so an entry pairing the opener's id with somebody else's
// login stood in the file as a signature by that other person.
test('a signature login must match the id it claims', () => {
  expect(appendOnly(file(), file(sig('torvalds', 2)), user('bob', 2), 'v1')).toContain('belongs to "bob"')
})

// A branch cut before a bump would otherwise sign the retired version and pass.
test('a branch behind a version bump cannot sign the retired one', () => {
  const mergeBase = file(sig('alice', 1))
  const head = file(sig('alice', 1), sig('bob', 2))
  expect(appendOnly(mergeBase, head, user('bob', 2), 'v2')).toContain('Merge the base branch')
})
