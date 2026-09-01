import { expect, test } from 'bun:test'
import type { Principal, SignatureFile } from './check.ts'
import { NoRuns, NotFound } from './github.ts'
import {
  commandOf,
  Declined,
  loadSignConfig,
  maySign,
  nearMiss,
  refusalOf,
  runSign,
  sign,
  signCommand,
} from './sign.ts'
import { alice, bob, caught, coauthored, commit, newSigner, signable, user, withEnv } from './test-support.ts'

const signEnv = {
  GITHUB_REPOSITORY: 'pug-sh/app',
  PR_NUMBER: '107',
  COMMENTER_ID: '1',
  COMMENTER_LOGIN: 'alice',
  COMMENTER_TYPE: 'User',
  GH_TOKEN: 'token',
}

const empty: SignatureFile = { claVersion: 'v1', signatures: [] }

const signedBy = (...ps: Principal[]): SignatureFile => ({
  claVersion: 'v1',
  signatures: ps.map(p => ({ login: p.login, id: p.id, date: '2026-09-01', cla: 'v1' })),
})

test('loadSignConfig reads the commenter', () => {
  const cfg = withEnv(signEnv, loadSignConfig)
  expect(cfg.commenter).toEqual(alice)
  expect(cfg.pr).toBe(107)
  expect(cfg.repo).toBe('pug-sh/app')
})

// Every one of these weakens the signer if it is missing rather than wrong: a zero id names nobody,
// and an empty token downgrades the run to the unauthenticated rate limit and then fails the write
// with a 401.
test('loadSignConfig rejects what it cannot trust', () => {
  for (const blank of ['GITHUB_REPOSITORY', 'COMMENTER_LOGIN', 'GH_TOKEN', 'COMMENTER_TYPE']) {
    const err = withEnv({ ...signEnv, GITHUB_TOKEN: '', [blank]: '' }, () => caughtSync(loadSignConfig))
    expect(err, blank).toBeInstanceOf(Error)
  }
  expect(withEnv({ ...signEnv, COMMENTER_ID: '0' }, () => caughtSync(loadSignConfig))).toBeInstanceOf(Error)
})

const caughtSync = (fn: () => unknown) => {
  try {
    fn()
    return undefined
  } catch (err) {
    return err
  }
}

test('maySign refuses a stranger', () => {
  const refusal = maySign(
    user('carol', 999),
    user('poluruprvn', 876188),
    [user('poluruprvn', 876188)],
    empty,
    empty,
    'v1',
  )
  expect(refusalOf(refusal)).toBe('not-a-principal')
})

// The whole point of signing by comment: a co-author can sign in the pull request they co-wrote
// instead of opening a throwaway one of their own.
test('maySign accepts a co-author', () => {
  expect(
    maySign(alice, user('poluruprvn', 876188), [user('poluruprvn', 876188), alice], empty, empty, 'v1'),
  ).toBeUndefined()
})

test('maySign refuses someone already signed on the base branch', () => {
  expect(refusalOf(maySign(alice, alice, [alice], empty, signedBy(alice), 'v1'))).toBe('already-signed')
})

// A signature already in the pull request's own head counts too. Writing a second one would put the
// id in the file twice once the branch merges the base, and the file is rejected for a repeated id
// and version outright — failing the gate for the crime of signing enthusiastically.
test('maySign refuses someone already signed in head', () => {
  expect(refusalOf(maySign(alice, alice, [alice], signedBy(alice), empty, 'v1'))).toBe('already-signed')
})

// A signature at a retired version is not a signature at the one in force.
test('maySign accepts someone signed only at an older version', () => {
  const onBase: SignatureFile = {
    claVersion: 'v2',
    signatures: [{ login: 'alice', id: 1, date: '2026-08-31', cla: 'v1' }],
  }
  expect(maySign(alice, alice, [alice], { claVersion: 'v2', signatures: [] }, onBase, 'v2')).toBeUndefined()
})

test('maySign refuses a bot', () => {
  const dependabot = { id: 49699333, login: 'dependabot[bot]', type: 'Bot' }
  expect(refusalOf(maySign(dependabot, dependabot, [dependabot], empty, empty, 'v1'))).toBe('bot')
})

test('the commenter is appended and committed to the base branch', async () => {
  const gh = signable()
  await sign(newSigner(gh, alice))

  // The base branch, never the head: the token cannot push to a fork, which is the case the gate
  // exists for.
  expect(gh.putBranch).toBe('main')
  expect(gh.putFile?.signatures).toEqual([{ login: 'alice', id: 1, date: '2026-08-30', cla: 'v1' }])
  expect(gh.rerunId).toBe(991)
})

// A conflict means another signature landed between the read and the write, so the signer re-reads
// and appends to the file as it now stands.
test('a conflict is retried once, against the file as it now stands', async () => {
  const gh = signable()
  gh.putConflicts = 1
  gh.landed = { login: 'bob', id: 2, date: '2026-08-29', cla: 'v1' }

  await sign(newSigner(gh, alice))
  expect(gh.putAttempts).toBe(2)
  // Appending to the file as re-read, not to the copy the first attempt built: bob's signature is a
  // recorded agreement and losing it is unrecoverable.
  expect(gh.putFile?.signatures?.map(s => s.login)).toEqual(['bob', 'alice'])
})

// Two in a row is not congestion, it is a bug, and spinning would hold the runner while making it
// worse.
test('a second conflict gives up', async () => {
  const gh = signable()
  gh.putConflicts = 2

  expect(await caught(sign(newSigner(gh, alice)))).toBeInstanceOf(Error)
  expect(gh.putAttempts).toBe(2)
})

test('a stranger is refused and nothing is written', async () => {
  const gh = signable()
  const err = await caught(sign(newSigner(gh, user('carol', 999))))

  expect(refusalOf(err)).toBe('not-a-principal')
  expect(gh.putAttempts).toBe(0)
  expect(gh.posted).toHaveLength(1)
  expect(gh.posted[0]!.body).toContain('@carol')
})

// A double /sign must not paint the pull request red: the signature is there, so the job is green and
// the reply just says so.
test('a second /sign is green and writes nothing', async () => {
  const gh = signable()
  gh.files.main = signedBy(alice)

  await sign(newSigner(gh, alice))
  expect(gh.putAttempts).toBe(0)
  expect(gh.posted).toHaveLength(1)
})

// A truncated commit list would drop principals and refuse someone who really is one, so it is a
// fault rather than a refusal.
test('a truncated commit list is a fault, not a refusal', async () => {
  const gh = signable()
  gh.pr.commits = 3

  const err = await caught(sign(newSigner(gh, alice)))
  expect((err as Error).message).toContain('commits')
  expect(gh.putAttempts).toBe(0)
})

test('runSign refuses an empty configuration', async () => {
  const err = await withEnv({ COMMENT_BODY: signCommand, GITHUB_REPOSITORY: '', PR_NUMBER: '' }, () =>
    caught(runSign()),
  )
  expect(err).toBeInstanceOf(Error)
})

// Actions expressions cannot trim, so the workflow's `if:` is only a prefilter and the exact match
// happens here.
test('a comment that merely mentions the command is ignored', async () => {
  const err = await withEnv({ COMMENT_BODY: "I'll /sign this later, promise" }, () => caught(runSign()))
  expect(err).toBeUndefined()
})

test('surrounding whitespace is tolerated', async () => {
  // Reaching the configuration error proves the body was accepted as the command.
  const err = await withEnv({ COMMENT_BODY: '  /sign\r\n', GITHUB_REPOSITORY: '', PR_NUMBER: '' }, () =>
    caught(runSign()),
  )
  expect(err).toBeInstanceOf(Error)
})

// A signature committed to any other branch is one the checker never reads, so the contributor is
// refused rather than told it landed.
test('a pull request targeting another branch is refused', async () => {
  const gh = signable()
  gh.pr.baseRef = 'release/1.2'

  // Seeded, so a missing file cannot stand in for the guard: without it the signer reads this branch
  // happily and commits to it.
  gh.files['release/1.2'] = { claVersion: 'v1', signatures: [] }

  const err = await caught(sign(newSigner(gh, alice)))
  expect(err).toBeInstanceOf(Declined)
  expect((err as Error).message).toContain('release/1.2')
  expect(gh.putAttempts).toBe(0)
  expect(gh.posted[0]!.body).toContain('release/1.2')
})

// issue_comment fires on a closed pull request too, and a merged one's head is gone once the fork is
// deleted.
test('a closed pull request is refused', async () => {
  const gh = signable()
  gh.pr.state = 'closed'

  expect(await caught(sign(newSigner(gh, alice)))).toBeInstanceOf(Declined)
  expect(gh.putAttempts).toBe(0)
})

// An unlinked email drops its commit's author from the principal list, so the bare refusal would tell
// someone with commits here that they have none.
test('an unlinked commit email is explained', async () => {
  const gh = signable()
  gh.pr.commits = 2
  gh.commits.push({ sha: 'c2', author: null, committer: null, message: '' })

  const err = await caught(sign(newSigner(gh, user('bob', 2))))
  expect(refusalOf(err)).toBe('not-a-principal')
  expect(gh.posted[0]!.body).toContain('c2')
})

// The signer must never be the thing that makes the file unparseable for everyone else, so it
// validates what it is about to write.
test('nothing is written when the result would be invalid', async () => {
  const gh = signable()
  gh.files.main = { claVersion: 'v1 draft', signatures: [] }

  expect(await caught(sign(newSigner(gh, alice)))).toBeInstanceOf(Error)
  expect(gh.putAttempts).toBe(0)
})

// "We could not reach GitHub" must not reach a co-author as "you have no work here", so a lookup
// failure is raised rather than silently shrinking the list.
test('a co-author lookup failure is raised', async () => {
  const gh = signable()
  gh.commits = [commit('c1', alice, alice, 'feat\n\nCo-authored-by: Bob <bob@users.noreply.github.com>\n')]
  gh.lookupErr = new Error('502 bad gateway')

  expect(await caught(sign(newSigner(gh, alice)))).toBeInstanceOf(Error)
  expect(gh.putAttempts).toBe(0)
})

// An issue_comment run attaches to no check on the pull request, so an error that only annotates the
// job is a comment nobody replied to.
test('an outright failure still replies', async () => {
  const gh = signable()
  gh.putErr = new Error('403 protected branch')

  expect(await caught(sign(newSigner(gh, alice)))).toBeInstanceOf(Error)
  expect(gh.posted).toHaveLength(1)
  expect(gh.posted[0]!.body).toContain('@alice')
})

// decline has already posted the specific reason; a second, vaguer comment on top of it would be
// worse than none.
test('a refusal is not replied to twice', async () => {
  const gh = signable()
  expect(await caught(sign(newSigner(gh, user('carol', 999))))).toBeInstanceOf(Declined)
  expect(gh.posted).toHaveLength(1)
})

// The signature is committed before the check is re-run, so nothing after that point may report a
// signing that happened as one that did not.
test('a committed signature survives a failed re-run and a failed comment', async () => {
  const cases: [string, (gh: ReturnType<typeof signable>) => void, string][] = [
    [
      'no run yet',
      gh => {
        gh.runErr = new NoRuns('no run yet')
      },
      'first one will pass',
    ],
    [
      'lookup failed',
      gh => {
        gh.runErr = new NotFound('gone')
      },
      'could not be re-run',
    ],
    [
      'rerun failed',
      gh => {
        gh.rerunErr = new Error('409')
      },
      'could not be re-run',
    ],
  ]
  for (const [name, set, want] of cases) {
    const gh = signable()
    set(gh)
    await sign(newSigner(gh, alice))
    expect(gh.putFile, name).not.toBeNull()
    expect(gh.posted[0]!.body, name).toContain(want)
  }

  const gh = signable()
  gh.writeErr = new Error('502')
  await sign(newSigner(gh, alice))
  expect(gh.putFile).not.toBeNull()
})

// More than one refusal can be true at once, and only the first is ever read. The order is a decision
// about what the contributor is told, not an accident: a stranger's refusal fails the job where
// already-signed exits green, so swapping those two turns a settled contributor's second /sign red.
test('maySign reports the first reason in order', () => {
  const botty = { id: 7, login: 'botty', type: 'Bot' }
  const signedFile = signedBy(alice, { ...botty, type: 'User' })

  // A bot that is also signed and also a stranger: all three are true.
  expect(refusalOf(maySign(botty, botty, [], signedFile, empty, 'v1'))).toBe('bot')
  // Signed on an earlier pull request, commenting on a colleague's: telling them they have no work
  // here is true and sends them hunting for nothing.
  expect(refusalOf(maySign(alice, alice, [], empty, signedFile, 'v1'))).toBe('already-signed')
})

// The premise of the whole design: the comment's author is who the signature is recorded for. Every
// writing test used a fixture whose opener and commenter were the same person, so recording the
// opener's identity instead passed.
test('the signature is recorded for the commenter, not the opener', async () => {
  const gh = coauthored()

  await sign(newSigner(gh, bob))

  expect(gh.putFile?.signatures).toEqual([{ login: 'bob', id: 2, date: '2026-08-30', cla: 'v1' }])
  expect(gh.putAuthor).toEqual(bob)
  expect(gh.putMessage).toContain('@bob')
  expect(gh.putBranch).toBe('main')
})

// The write is conditional on the blob sha it read, which is the only thing stopping a signature
// that landed in between from being silently overwritten.
test('the write carries the sha the file was read at', async () => {
  const gh = coauthored()

  await sign(newSigner(gh, bob))

  expect(gh.putSha).toBe('abc123')
})

// head is the pull request's own file, and appendOnly takes a hand-written signature from nobody but
// the opener — so an entry there naming a co-author is forged. Crediting it refused their /sign as
// already signed, on a green job, having recorded nothing.
test('a forged entry in the head file cannot block a co-author from signing', async () => {
  const gh = coauthored()
  gh.files.deadbeef = { claVersion: 'v1', signatures: [{ login: 'bob', id: 2, date: '2026-08-30', cla: 'v1' }] }

  await sign(newSigner(gh, bob))

  expect(gh.putFile?.signatures).toEqual([{ login: 'bob', id: 2, date: '2026-08-30', cla: 'v1' }])
})

// The opener's own hand-written signature is still credited: appendOnly is what makes that entry
// trustworthy, and asking them to sign twice would reject the file for a repeated id.
test('the opener is still credited for their own hand-written signature', async () => {
  const gh = coauthored()
  gh.files.deadbeef = { claVersion: 'v1', signatures: [{ login: 'alice', id: 1, date: '2026-08-30', cla: 'v1' }] }

  await sign(newSigner(gh, alice))

  expect(gh.putAttempts).toBe(0)
  expect(gh.posted[0]!.body).toContain('already signed')
})

// The workflow prefilters on the prefix, so a body opening with the command reaches the job whatever
// follows it. Exiting quietly on those left a green run, no comment and a red check.
test('commandOf separates the command from a near-miss and from an unrelated comment', () => {
  expect(commandOf('/sign')).toBe('sign')
  expect(commandOf('  /sign\r\n')).toBe('sign')
  expect(commandOf('/sign please')).toBe('near-miss')
  expect(commandOf('/signature of intent')).toBe('near-miss')
  expect(commandOf("I'll /sign this later, promise")).toBe('unrelated')
  expect(commandOf('')).toBe('unrelated')
})

test('a near-miss is answered with how to sign', async () => {
  const gh = signable()

  await nearMiss(newSigner(gh, alice))

  expect(gh.posted).toHaveLength(1)
  expect(gh.posted[0]!.body).toContain('on its own')
  expect(gh.putAttempts).toBe(0)
})

// An empty ref reads as the default branch, so the head file would be read from somewhere else
// entirely. The file is seeded at the empty ref so that read succeeds: without the guard the run
// carries on and signs, which is what this has to catch.
test('a pull request response with no head sha is refused', async () => {
  const gh = signable()
  gh.pr.headSha = ''
  gh.files[''] = { claVersion: 'v1', signatures: [] }

  const err = await caught(sign(newSigner(gh, alice)))
  expect((err as Error).message).toContain('no head sha')
  expect(gh.putAttempts).toBe(0)
})
