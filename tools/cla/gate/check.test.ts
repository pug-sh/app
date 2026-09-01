import { describe, expect, test } from 'bun:test'
import {
  appendOnly,
  coauthorEmails,
  invalidReason,
  noreplyLogin,
  type Principal,
  parseSignatureFile,
  principals,
  type SignatureFile,
  signed,
  unsigned,
  webFlowId,
} from './check.ts'
import { commit, file, sig, user } from './test-support.ts'

// Each case takes a file that validates and breaks exactly one thing about it, so what is under test
// is the field named in the case, not a wall of JSON.
describe('a signature that records nothing is rejected', () => {
  const cases: [string, (f: SignatureFile) => void, string][] = [
    [
      'missing id',
      f => {
        f.signatures![0]!.id = 0
      },
      'id is missing',
    ],
    [
      'empty login',
      f => {
        f.signatures![0]!.login = ''
      },
      'login is empty',
    ],
    [
      'bad date',
      f => {
        f.signatures![0]!.date = 'yesterday'
      },
      'date is not a real',
    ],
    [
      'impossible day',
      f => {
        f.signatures![0]!.date = '2026-02-30'
      },
      'date is not a real',
    ],
    [
      'impossible month',
      f => {
        f.signatures![0]!.date = '2026-99-99'
      },
      'date is not a real',
    ],
    [
      'unpadded date',
      f => {
        f.signatures![0]!.date = '2026-2-3'
      },
      'date is not a real',
    ],
    [
      'malformed cla',
      f => {
        f.signatures![0]!.cla = ''
      },
      'cla is missing or malformed',
    ],
    [
      'no cla_version',
      f => {
        f.claVersion = ''
      },
      'cla_version is missing',
    ],
    [
      'multiline cla_version',
      f => {
        f.claVersion = 'v1\n::error::injected'
      },
      'must be one line',
    ],
    [
      'signatures absent',
      f => {
        f.signatures = null
      },
      'signatures is missing',
    ],
    [
      'same id twice at one version',
      f => {
        f.signatures!.push(sig('b', 1))
      },
      'repeats the id and version',
    ],
  ]

  for (const [name, corrupt, want] of cases) {
    test(name, () => {
      const f = file(sig('a', 1))
      expect(invalidReason(f)).toBeNull()
      corrupt(f)
      expect(invalidReason(f)).toContain(want)
    })
  }
})

// The absent key must decode to null rather than an empty array: that is the only thing separating
// "this file has no signatures key" from "the array is empty".
test('an absent signatures key decodes to null', () => {
  const f = parseSignatureFile('{"cla_version":"v1"}')
  expect(f.signatures).toBeNull()
  expect(invalidReason(f)).toContain('signatures is missing')
})

// A signatures value that is not an array must fail to decode rather than being iterated as an
// object, which a shape-blind check accepts silently.
test('signatures must be an array', () => {
  expect(() => parseSignatureFile('{"cla_version":"v1","signatures":{"a":{"id":1}}}')).toThrow(
    'signatures is not an array',
  )
})

// An id is what identity is matched on, so one that is not a whole number is a decode failure rather
// than a zero that quietly matches nobody.
test('an id that is not a whole number fails to decode', () => {
  for (const raw of ['"876188"', '1.5', 'true']) {
    expect(() =>
      parseSignatureFile(
        `{"cla_version":"v1","signatures":[{"login":"a","id":${raw},"date":"2026-01-01","cla":"v1"}]}`,
      ),
    ).toThrow()
  }
})

test('a principal is identified by id, not by login', () => {
  const head = file(sig('alice', 1))
  // A rename does not lose the signature, and re-registering the freed login does not inherit it.
  const renamed = unsigned(head, file(), [user('alice-renamed', 1)])
  expect(renamed.missing).toEqual([])
  expect(renamed.checked).toHaveLength(1)

  const impostor = unsigned(head, file(), [user('alice', 99)])
  expect(impostor.missing).toHaveLength(1)
})

// The bot exemption reads the account type from the API. A login merely shaped like a bot's is a
// person; a glob-based allowlist could be tricked into exempting one by adding a file named after it.
test('only real bots are exempt', () => {
  const head = file()
  expect(unsigned(head, file(), [{ id: 1, login: 'dependabot[bot]', type: 'Bot' }]).missing).toEqual([])
  for (const login of ['dependabott', 'renovateb', 'github-actionso', 'dependabot[bot]']) {
    expect(unsigned(head, file(), [user(login, 5)]).missing).toHaveLength(1)
  }
})

test('principals are deduplicated and unknown ids skipped', () => {
  const people = [user('alice', 1), user('alice', 1), user('bob', 2), user('', 0)]
  const { missing, checked } = unsigned(file(sig('alice', 1)), file(), people)
  expect(checked).toHaveLength(2)
  expect(missing.map(p => p.login)).toEqual(['bob'])
})

// Setting --author to someone who has signed does not launder the commit: the committer is the
// account that actually pushed it.
test('the committer is checked, not just the author', () => {
  const { found, unlinked } = principals([commit('a1', user('alice', 1), user('mallory', 2), 'x')], user('alice', 1))
  expect(unlinked).toEqual([])
  expect(unsigned(file(sig('alice', 1)), file(), found).missing.map(p => p.login)).toEqual(['mallory'])
})

// Excluded by id: the login comes from a commit email the contributor chooses, so anyone could have
// named themselves web-flow and dropped out of the check.
test("github's web-flow committer is ignored, but only by id", () => {
  const real = principals([commit('a1', user('alice', 1), user('web-flow', webFlowId), 'x')], user('alice', 1))
  expect(unsigned(file(sig('alice', 1)), file(), real.found).missing).toEqual([])

  const impostor = principals([commit('a1', user('alice', 1), user('web-flow', 5), 'x')], user('alice', 1))
  expect(unsigned(file(sig('alice', 1)), file(), impostor.found).missing).toHaveLength(1)
})

// A commit whose email is not linked to an account must be reported, not dropped. A default applied
// to the whole stream, so a null author among linked ones vanished.
test('unlinked commits are reported, not dropped', () => {
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

test('co-author trailers are collected', () => {
  const message =
    'feat: thing\n\nCo-authored-by: Bob <99+bob@users.noreply.github.com>\nco-authored-by: Carol <carol@example.com>\n'
  expect(coauthorEmails([commit('a1', user('alice', 1), user('alice', 1), message)])).toEqual([
    '99+bob@users.noreply.github.com',
    'carol@example.com',
  ])
})

// The id in a noreply address is commit-message text. Taking it on trust let a pull request sign for
// anyone whose id it wrote into a trailer, so only the login survives parsing and it is resolved
// against the API.
test('noreplyLogin discards the embedded id', () => {
  const cases: Record<string, string> = {
    '99+bob@users.noreply.github.com': 'bob',
    'bob@users.noreply.github.com': 'bob',
    '49699333+dependabot[bot]@users.noreply.github.com': 'dependabot[bot]',
    'bob@example.com': '',
  }
  for (const [email, want] of Object.entries(cases)) expect(noreplyLogin(email)).toBe(want)
})

// A version bump is signed by adding an entry, so the old one stays and both coexist; only an entry
// at the file's current version counts as signed.
test('signed requires the current version', () => {
  const f: SignatureFile = {
    claVersion: 'v2',
    signatures: [
      { login: 'alice', id: 1, date: '2026-01-01', cla: 'v1' },
      { login: 'bob', id: 2, date: '2026-01-01', cla: 'v2' },
    ],
  }
  expect(invalidReason(f)).toBeNull()
  expect(signed(f, 1)).toBe(false)
  expect(signed(f, 2)).toBe(true)
})

// A trailer spanning a newline would inject its own workflow commands into the annotation stream
// when the address is echoed back.
test('a co-author trailer stops at the line end', () => {
  const message = 'feat\n\nCo-authored-by: X <bob@example.com\n::error::injected>\n'
  expect(coauthorEmails([commit('a1', user('alice', 1), user('alice', 1), message)])).toEqual([])
})

// A version bump retires the old text. An entry added against it would record an agreement never
// given, into a file that is append-only and is the record.
test('a new signature must be at the version in force', () => {
  const v1 = { login: 'alice', id: 1, date: '2025-01-01', cla: 'v1' }
  const at = (...signatures: (typeof v1)[]): SignatureFile => ({ claVersion: 'v2', signatures })
  const base = at(v1)
  const bob = user('bob', 2)

  const stale = at(v1, { login: 'bob', id: 2, date: '2026-08-31', cla: 'v1' })
  expect(appendOnly(base, stale, bob, 'v2')).toContain('version in force')

  // The bump does not invalidate what came before: alice's v1 entry is the record of what she agreed
  // to then, and stays as it is.
  const current = at(v1, { login: 'bob', id: 2, date: '2026-08-31', cla: 'v2' })
  expect(appendOnly(base, current, bob, 'v2')).toBeNull()
  expect(invalidReason(current)).toBeNull()
})

test('the signature file is append-only, and only for yourself', () => {
  const base = file(sig('alice', 1))
  const bob = user('bob', 2)

  expect(appendOnly(base, file(sig('alice', 1), sig('bob', 2)), bob, 'v1')).toBeNull()
  expect(appendOnly(base, file(sig('bob', 2)), bob, 'v1')).toContain('append-only')

  const edited = file(sig('alice', 1), sig('bob', 2))
  edited.signatures![0]!.date = '2020-01-01'
  expect(appendOnly(base, edited, bob, 'v1')).toContain('append-only')

  expect(appendOnly(base, file(sig('alice', 1), sig('stranger', 42)), bob, 'v1')).toContain('who did not open it')

  // GitHub folds case in a login, and the report hands out the canonical form, so a difference in
  // case is a typo rather than a different person.
  expect(appendOnly(base, file(sig('alice', 1), sig('BoB', 2)), bob, 'v1')).toBeNull()
})

// The id is what signing is matched on, so an entry pairing the opener's id with somebody else's
// login stood in the file as a signature by that other person.
test('a signature login must match the id it claims', () => {
  expect(appendOnly(file(), file(sig('torvalds', 2)), user('bob', 2), 'v1')).toContain('belongs to "bob"')
})

// Only the noreply form is ever looked up, so an ordinary address is unidentified rather than absent
// from GitHub — the report must not claim a search it skipped.
test('only the noreply form yields a login', () => {
  for (const addr of ['someone@example.com', 'woof@pug.sh', '1+alice@users.noreply.github.example']) {
    expect(noreplyLogin(addr)).toBe('')
  }
  const cases: Record<string, string> = {
    'alice@users.noreply.github.com': 'alice',
    '12345+alice@users.noreply.github.com': 'alice',
    '1+dependabot[bot]@users.noreply.github.com': 'dependabot[bot]',
  }
  for (const [addr, want] of Object.entries(cases)) expect(noreplyLogin(addr)).toBe(want)
})

// A lone CR ends a line for the Actions log and, per CommonMark, for the comment too — so a trailer
// carrying one could forge a workflow command and break out of the code span the report renders it in.
test('a trailer address cannot carry a carriage return', () => {
  const got = coauthorEmails([
    commit('a1', null, null, 'feat\n\nCo-authored-by: M <a\r\r[click](https://evil.example)@x>\n'),
  ])
  expect(got).toHaveLength(1)
  expect(got[0]).not.toContain('\r')
  expect(got[0]).not.toContain('\n')
})

// The version in force is the base branch's, not the merge base's: a branch cut before a bump would
// otherwise sign the retired version and pass.
test('a branch behind a version bump cannot sign the retired one', () => {
  const rejection = appendOnly(file(sig('alice', 1)), file(sig('alice', 1), sig('bob', 2)), user('bob', 2), 'v2')
  expect(rejection).toContain('merge the base branch')
})

// A /sign comment records the signature on the base branch, so a contributor's first pull request
// predates their own signature. head alone would read them as unsigned however many times they signed.
test('a signature on the base branch counts', () => {
  const head: SignatureFile = { claVersion: 'v1', signatures: [] }
  const onBase: SignatureFile = {
    claVersion: 'v1',
    signatures: [{ login: 'alice', id: 1, date: '2026-09-01', cla: 'v1' }],
  }
  const { missing, checked } = unsigned(head, onBase, [user('alice', 1)])
  expect(missing).toEqual([])
  expect(checked).toHaveLength(1)
})

// The base branch is searched at the version head declares, so a retired signature does not carry
// into a bumped version.
test('a base signature at another version does not count', () => {
  const head: SignatureFile = { claVersion: 'v2', signatures: [] }
  const onBase: SignatureFile = {
    claVersion: 'v2',
    signatures: [{ login: 'alice', id: 1, date: '2026-09-01', cla: 'v1' }],
  }
  expect(unsigned(head, onBase, [user('alice', 1)]).missing).toHaveLength(1)
})

// The pull request's own file still counts, which is the hand-edited path.
test('a signature in head still counts', () => {
  const head: SignatureFile = {
    claVersion: 'v1',
    signatures: [{ login: 'alice', id: 1, date: '2026-09-01', cla: 'v1' }],
  }
  const people: Principal[] = [user('alice', 1)]
  expect(unsigned(head, { claVersion: 'v1', signatures: [] }, people).missing).toEqual([])
})
