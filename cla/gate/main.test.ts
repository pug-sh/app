import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SignatureFile } from './check.ts'
import { botComment, commit, FakeGitHub, file, newChecker, sig, user } from './fixtures.ts'
import { check, loadConfig, resolveCoauthors, Unsigned } from './main.ts'
import { commentMarker, labelSigned, labelUnsigned, signedComment } from './report.ts'

const failure = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (err: unknown) => err,
  )

const bot = { id: 49699333, login: 'dependabot[bot]', type: 'Bot' }

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('check passes when every principal has signed', async () => {
  const { c, output } = newChecker(
    new FakeGitHub({
      files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
      commits: [commit('a1', user('alice', 1), user('alice', 1), 'feat: thing')],
    }),
  )

  await check(c)
  expect(output()).toContain('CLA v1 verified')
})

// alice opened it, so hers is the entry offered; bob authored the commit and is named, but only he
// can sign for himself.
test('check reports the unsigned contributor', async () => {
  const { c, output } = newChecker(
    new FakeGitHub({
      files: { head: file(), base: file() },
      commits: [commit('a1', user('bob', 2), user('bob', 2), 'feat: thing')],
    }),
  )

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  // main relies on the report carrying its own annotation; a second one would show a bare sentinel.
  expect(output().startsWith('::error::')).toBe(true)
  for (const want of ['alice', 'bob', '"id": 1', 'opened themselves']) expect(output()).toContain(want)
  expect(output()).not.toContain('"id": 2')
})

test('check refuses a truncated commit list', async () => {
  const { c } = newChecker(
    new FakeGitHub({
      files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
      commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
    }),
    { prCommits: 300 },
  )

  const err = await failure(check(c))
  expect(err).not.toBeInstanceOf(Unsigned)
  expect((err as Error).message).toContain("listed 1 of the pull request's 300 commits")
})

test('check writes the job summary', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-gate-'))
  temps.push(dir)
  const { c } = newChecker(
    new FakeGitHub({
      files: { head: file(), base: file() },
      commits: [commit('a1', user('bob', 2), user('bob', 2), 'x')],
    }),
    { summaryPath: join(dir, 'summary.md') },
  )

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(readFileSync(c.cfg.summaryPath, 'utf8')).toContain('## CLA signature required')
})

// A rate limit is not evidence that carol has no account, so it must not reach her as
// "unidentified" — that sends the contributor off to fix an address that was fine.
test('a co-author lookup failure is raised, not reported', async () => {
  const commits = [
    commit(
      'a1',
      user('alice', 1),
      user('alice', 1),
      'feat\n\nCo-authored-by: Carol <carol@users.noreply.github.com>\n',
    ),
  ]
  const { c } = newChecker(new FakeGitHub({ lookupErr: new Error('403 rate limit exceeded') }))

  expect(await failure(resolveCoauthors(c, commits))).toBeInstanceOf(Error)
})

// A plaintext address is not resolved at all: user search sees only emails public on a profile, so
// it answers for a minority and costs the strictest rate limit we touch.
test('a plaintext co-author address is reported, not resolved', async () => {
  const commits = [
    commit('a1', user('alice', 1), user('alice', 1), 'feat\n\nCo-authored-by: Carol <carol@example.com>\n'),
  ]
  const { c } = newChecker(new FakeGitHub())

  expect(await resolveCoauthors(c, commits)).toEqual({ coauthors: [], unidentified: ['carol@example.com'] })
})

// The pairing matters: an address that might belong to a person must still stop the gate, or the
// exemption is a hole rather than a rule.
test("an assistant trailer is skipped but a person's is not", async () => {
  const { c } = newChecker(new FakeGitHub())
  const trailer = (addr: string) => [
    commit('a1', user('alice', 1), user('alice', 1), `feat\n\nCo-authored-by: X <${addr}>\n`),
  ]

  expect(await resolveCoauthors(c, trailer('noreply@anthropic.com'))).toEqual({ coauthors: [], unidentified: [] })
  // A colleague at the same domain still holds copyright.
  expect((await resolveCoauthors(c, trailer('carol@anthropic.com'))).unidentified).toEqual(['carol@anthropic.com'])
})

test('the id-less noreply form is resolved through the API', async () => {
  const commits = [
    commit('a1', user('alice', 1), user('alice', 1), 'feat\n\nCo-authored-by: Bob <bob@users.noreply.github.com>\n'),
  ]
  const { c } = newChecker(new FakeGitHub({ byLogin: { bob: user('bob', 99) } }))

  expect(await resolveCoauthors(c, commits)).toEqual({ coauthors: [user('bob', 99)], unidentified: [] })
})

// The gate still blocks — a trailer names a copyright holder either way — but the contributor must
// meet the ordinary report, not an error that hides it.
test('an unidentified co-author blocks through the report', async () => {
  const gh = new FakeGitHub({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'feat\n\nCo-authored-by: Carol <carol@example.com>\n')],
  })
  const { c, output } = newChecker(gh)

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  for (const want of ['::error::', 'carol@example.com', 'drop the trailer']) expect(output()).toContain(want)
  expect(gh.posted).toHaveLength(1)
  expect(gh.posted[0].body).toContain('carol@example.com')
})

const requiredEnv = {
  GITHUB_REPOSITORY: 'pug-sh/app',
  PR_NUMBER: '7',
  PR_COMMITS: '1',
  PR_HEAD_SHA: 'head',
  PR_BASE_SHA: 'base',
  GH_TOKEN: 't',
  PR_USER_ID: '42',
  PR_USER_LOGIN: 'carol',
}

test('loadConfig falls back for the optional inputs', () => {
  const cfg = loadConfig({
    ...requiredEnv,
    GH_TOKEN: '',
    GITHUB_TOKEN: 't',
    GITHUB_SERVER_URL: '',
    GITHUB_STEP_SUMMARY: '',
    PR_BASE_REF: '',
    PR_USER_TYPE: '',
  })

  expect(cfg.baseRef).toBe('main')
  expect(cfg.serverURL).toBe('https://github.com')
  expect(cfg.token).toBe('t')
  expect(cfg.opener).toEqual(user('carol', 42))
})

// Every one of these silently weakens the gate if it is missing rather than wrong.
const missing: { name: string; env: Record<string, string>; want: string }[] = [
  { name: 'no pr number', env: { PR_NUMBER: '' }, want: 'PR_NUMBER' },
  { name: 'no commit total', env: { PR_COMMITS: 'many' }, want: 'PR_COMMITS' },
  { name: 'no opener', env: { PR_USER_ID: '' }, want: 'PR_USER_ID' },
  { name: 'no repo', env: { GITHUB_REPOSITORY: '' }, want: 'GITHUB_REPOSITORY is empty' },
  { name: 'no head', env: { PR_HEAD_SHA: '' }, want: 'PR_HEAD_SHA is empty' },
  { name: 'no base', env: { PR_BASE_SHA: '' }, want: 'PR_BASE_SHA is empty' },
  { name: 'no token', env: { GH_TOKEN: '' }, want: 'GH_TOKEN is empty' },
  // "0" parses, and an id of zero is dropped by unsigned(), which would empty the check.
  { name: 'zero opener', env: { PR_USER_ID: '0' }, want: 'PR_USER_ID is zero' },
  // appendOnly matches the entry's login against the opener's, so an empty one refuses every
  // signature the report hands out.
  { name: 'no opener login', env: { PR_USER_LOGIN: '' }, want: 'PR_USER_LOGIN is empty' },
]

for (const { name, env, want } of missing) {
  test(`loadConfig rejects an input it cannot check without: ${name}`, () => {
    expect(() => loadConfig({ ...requiredEnv, ...env })).toThrow(want)
  })
}

// A trailer that names a victim and adds their signature is stopped by appendOnly, not by the id
// provenance rule — that one is covered separately, where head equals base.
test('a forged co-author trailer cannot sign for a stranger', async () => {
  const { c, output } = newChecker(
    new FakeGitHub({
      files: {
        head: file(sig('mallory', 2), { login: 'victim', id: 42, date: '2026-08-30', cla: 'v1' }),
        base: file(sig('mallory', 2)),
      },
      commits: [
        commit(
          'a1',
          user('mallory', 2),
          user('mallory', 2),
          'feat\n\nCo-authored-by: V <42+bob@users.noreply.github.com>\n',
        ),
      ],
      byLogin: { bob: user('bob', 99) },
    }),
    { opener: user('mallory', 2) },
  )

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(output()).toContain('you may only sign for yourself')
})

// Naming a real login is the sharper attack: the id then comes back from the API and is genuinely
// the victim's, so only refusing every signature but the opener's stops it.
test('naming a real co-author still cannot sign for them', async () => {
  const { c, output } = newChecker(
    new FakeGitHub({
      files: { head: file(sig('mallory', 2), sig('victim', 777)), base: file(sig('mallory', 2)) },
      commits: [
        commit(
          'a1',
          user('mallory', 2),
          user('mallory', 2),
          'feat\n\nCo-authored-by: V <victim@users.noreply.github.com>\n',
        ),
      ],
      byLogin: { victim: user('victim', 777) },
    }),
    { opener: user('mallory', 2) },
  )

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(output()).toContain('who did not open it')
})

// `git commit --author=` is free to set, so the commit author was a second way to name a victim as a
// principal and then sign for them.
test('a forged commit author cannot sign for a stranger', async () => {
  const { c, output } = newChecker(
    new FakeGitHub({
      files: { head: file(sig('mallory', 2), sig('victim', 777)), base: file(sig('mallory', 2)) },
      commits: [commit('a1', user('victim', 777), user('mallory', 2), 'feat')],
    }),
    { opener: user('mallory', 2) },
  )

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(output()).toContain('who did not open it')
})

// Dropping it let the gate pass while never checking that person at all.
test('a noreply address that resolves to nobody is reported', async () => {
  const { c, output } = newChecker(
    new FakeGitHub({
      files: { head: file(sig('mallory', 2)), base: file(sig('mallory', 2)) },
      commits: [
        commit(
          'a1',
          user('mallory', 2),
          user('mallory', 2),
          'feat\n\nCo-authored-by: Real Person <0+realperson@users.noreply.github.com>\n',
        ),
      ],
    }),
    { opener: user('mallory', 2) },
  )

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(output()).toContain('0+realperson@users.noreply.github.com')
})

// dependabot and friends author no human copyright. Failing these shut every dependency update out.
test('an all-bot pull request passes and resolves a standing demand', async () => {
  const gh = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', bot, bot, 'chore(deps): bump x')],
    posted: [botComment(9, `${commentMarker}\n## Signature required`)],
  })
  const { c, output } = newChecker(gh, { opener: bot })

  await check(c)
  expect(output()).toContain('nothing to sign')
  expect(gh.edits).toBe(1)
  expect(gh.posted[0].body).not.toContain('Signature required')
})

// The base branch tip moves as others sign, and every stale branch would then read as deleting them.
test('a stale branch is not accused of deleting a signature', async () => {
  const { c } = newChecker(
    new FakeGitHub({
      base: 'mergebase',
      files: {
        mergebase: file(sig('alice', 1)),
        base: file(sig('alice', 1), sig('dave', 4)), // main moved on
        head: file(sig('alice', 1), sig('bob', 3)),
      },
      commits: [commit('a1', user('bob', 3), user('bob', 3), 'feat')],
    }),
    { opener: user('bob', 3) },
  )

  await check(c)
})

// An unsigned run must reach the contributor somewhere other than a job log, and must name them in
// a form GitHub notifies on.
test('check comments, mentioning the unsigned contributor', async () => {
  const gh = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
  })
  const { c } = newChecker(gh)

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(1)
  for (const want of [commentMarker, '@alice', '"id": 1']) expect(gh.posted[0].body).toContain(want)
})

// A contributor pushing repeatedly must be notified once; a second comment is a new notification.
test('check edits its own comment instead of posting another', async () => {
  const gh = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('bob', 2), user('bob', 2), 'x')],
    posted: [{ id: 5, body: "someone else's review", botAuthor: false }, botComment(9, `${commentMarker}\nstale`)],
  })
  const { c } = newChecker(gh)

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(2)
  expect(gh.edits).toBe(1)
  expect(gh.posted[1].body).toContain('bob')
  expect(gh.posted[1].body).not.toContain('stale')
})

// An edit bumps the comment's timestamp and reads as news to everyone watching the pull request.
test('check leaves an unchanged comment alone', async () => {
  const gh = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('bob', 2), user('bob', 2), 'x')],
  })
  const { c } = newChecker(gh)

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(1)
  expect(gh.edits).toBe(0)
})

// Once signed, the demand has been met. A pull request that was never asked gets no comment at all.
test('check resolves its comment once signed', async () => {
  const signed = () => ({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
  })

  const asked = new FakeGitHub({ ...signed(), posted: [botComment(9, `${commentMarker}\n## Signature required`)] })
  await check(newChecker(asked).c)
  expect(asked.posted).toHaveLength(1)
  expect(asked.posted[0].body).toContain('CLA v1 signed')

  const quiet = new FakeGitHub(signed())
  await check(newChecker(quiet).c)
  expect(quiet.posted).toEqual([])
})

// The comment is best-effort: a repository whose token cannot comment must still fail on the
// signature, not on the notification.
test('check keeps its verdict when commenting fails', async () => {
  const refusal = new Error('403 resource not accessible by integration')
  const unsignedPR = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('bob', 2), user('bob', 2), 'x')],
    writeErr: refusal,
  })
  expect(await failure(check(newChecker(unsignedPR).c))).toBeInstanceOf(Unsigned)

  const signed = {
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
    posted: [botComment(9, `${commentMarker}\n## Signature required`)],
  }
  await check(newChecker(new FakeGitHub({ ...signed, listErr: refusal })).c)

  // A refused edit must annotate: the run exits 0, so nobody opens its log and the gate would go
  // quiet unnoticed.
  const { c, output } = newChecker(new FakeGitHub({ ...signed, writeErr: refusal }))
  await check(c)
  expect(output()).toContain('::warning::')
})

// GitHub's quote-reply copies the marker in, and editing that comment would silence the gate.
test('check ignores a quoted marker', async () => {
  const gh = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
    posted: [{ id: 5, body: `> ${commentMarker}\n> ## Signature required\n\nwhy?`, botAuthor: false }],
  })

  expect(await failure(check(newChecker(gh).c))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(2)
  expect(gh.edits).toBe(0)
})

// A gate that fell over must not leave "signed" standing on a red check, nor repeat advice the
// contributor has just followed and failed on.
test('check replaces its comment when the gate cannot finish', async () => {
  // No file at the head sha: the gate cannot read what it is meant to judge.
  const broken = () => ({
    files: { base: file() },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
  })

  const gh = new FakeGitHub({ ...broken(), posted: [botComment(9, signedComment('v1'))] })
  expect(await failure(check(newChecker(gh).c))).not.toBeInstanceOf(Unsigned)
  expect(gh.edits).toBe(1)
  expect(gh.posted[0].body).not.toContain('signed')

  // Nothing standing means nothing to correct; a bare failure is not worth a comment.
  const quiet = new FakeGitHub(broken())
  expect(await failure(check(newChecker(quiet).c))).toBeInstanceOf(Error)
  expect(quiet.posted).toEqual([])
})

// The label is what makes CLA status visible in the pull request list, and a signed pull request
// still carrying "not signed" is worse than no label at all.
test('check labels each outcome', async () => {
  const unsignedPR = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
    labelled: ['enhancement', labelSigned],
  })
  expect(await failure(check(newChecker(unsignedPR).c))).toBeInstanceOf(Unsigned)
  expect(unsignedPR.labelled).toEqual(['enhancement', labelUnsigned])

  const signed = new FakeGitHub({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
    labelled: [labelUnsigned],
  })
  await check(newChecker(signed).c)
  expect(signed.labelled).toEqual([labelSigned])

  // A gate that could not finish knows nothing, but must not leave "signed" standing.
  const broken = new FakeGitHub({
    files: { base: file() },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
    labelled: [labelSigned],
  })
  expect(await failure(check(newChecker(broken).c))).not.toBeInstanceOf(Unsigned)
  expect(broken.labelled).toEqual([])
})

// A label event notifies everyone watching the pull request.
test('check does not rewrite a correct label', async () => {
  const gh = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
    labelled: [labelUnsigned],
  })

  expect(await failure(check(newChecker(gh).c))).toBeInstanceOf(Unsigned)
  expect(gh.labelWrites).toBe(0)
})

// Treating a missing merge-base file as an empty history disarmed both append-only guards, so a
// pull request could name its own cla_version.
test('a missing base file is a failure, not an empty history', async () => {
  const head: SignatureFile = {
    cla_version: 'vBOGUS',
    signatures: [{ login: 'mallory', id: 7, date: '2026-08-30', cla: 'vBOGUS' }],
  }
  const { c, output } = newChecker(
    new FakeGitHub({
      base: 'mergebase', // no file there
      files: { base: file(), head },
      commits: [commit('a1', user('mallory', 7), user('mallory', 7), 'feat')],
    }),
    { opener: user('mallory', 7) },
  )

  expect(await failure(check(c))).not.toBeInstanceOf(Unsigned)
  expect(output()).not.toContain('verified')
})

// A rejected edit is the contributor's to fix, so it takes the unsigned label and a comment rather
// than reading as a gate that fell over.
test('a rejected edit is reported like an unsigned CLA', async () => {
  const gh = new FakeGitHub({
    files: { head: file(sig('mallory', 2), sig('victim', 777)), base: file(sig('mallory', 2)) },
    commits: [commit('a1', user('mallory', 2), user('mallory', 2), 'feat')],
    labelled: [labelSigned],
  })
  const { c } = newChecker(gh, { opener: user('mallory', 2) })

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(gh.labelled).toEqual([labelUnsigned])
  expect(gh.posted).toHaveLength(1)
  expect(gh.posted[0].body).toContain('was rejected')
})

// An assistant trailer names no copyright holder, so a pull request carrying one and nothing else
// must go green without a history rewrite.
test('an assistant trailer alone does not block the gate', async () => {
  for (const addr of ['noreply@anthropic.com', 'NoReply@Anthropic.COM']) {
    const { c } = newChecker(
      new FakeGitHub({
        files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
        commits: [commit('a1', user('alice', 1), user('alice', 1), `feat\n\nCo-authored-by: Claude <${addr}>\n`)],
      }),
    )
    await check(c)
  }
})

// The CLA workflow runs the gate with no `bun install`, so a dependency here is a gate that cannot
// start — and that failure lands on a workflow file review never exercises.
test('the gate imports nothing but its own files and builtins', async () => {
  const bare: string[] = []
  for await (const name of new Bun.Glob('*.ts').scan(import.meta.dir)) {
    const source = readFileSync(join(import.meta.dir, name), 'utf8')
    for (const [, spec] of source.matchAll(/\b(?:from|import|require)\s*\(?\s*['"]([^'"\n]+)['"]/g)) {
      const builtin = spec.startsWith('./') || spec.startsWith('node:') || spec === 'bun' || spec === 'bun:test'
      if (!builtin) bare.push(`${name} imports ${spec}`)
    }
  }
  expect(bare).toEqual([])
})

// The id has to come from the API, never from the address. head equals base here so appendOnly has
// nothing to reject — which is the only way to observe this rule on its own. The forged-trailer test
// above cannot: its scenario adds an entry, so appendOnly fires first and passes it for that reason.
test('a co-author id comes from the API, not from the trailer that named it', async () => {
  const signed = file(sig('mallory', 2), sig('alice', 1))
  const gh = new FakeGitHub({
    files: { head: signed, base: signed },
    commits: [
      commit(
        'a1',
        user('mallory', 2),
        user('mallory', 2),
        // Names alice's id, who has signed. bob's real id has not.
        'feat\n\nCo-authored-by: Bob <1+bob@users.noreply.github.com>\n',
      ),
    ],
    byLogin: { bob: user('bob', 99) },
  })
  const { c, output } = newChecker(gh, { opener: user('mallory', 2) })

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(output()).toContain('bob')
})

// Dropping the raise let a commit with an unlinked author go entirely unchecked.
test('an unlinked commit author blocks, and is told how to fix it', async () => {
  const gh = new FakeGitHub({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x'), commit('b2', null, null, 'y')],
  })
  const { c, output } = newChecker(gh, { prCommits: 2 })

  expect(await failure(check(c))).toBeInstanceOf(Unsigned)
  expect(output()).toContain('b2')
  expect(gh.labelled).toEqual([labelUnsigned])
  expect(gh.posted[0].body).toContain('settings/emails')
})

// Every branch that left main before the signature file existed lands here. It stays fatal, but the
// remedy is a merge, and a bare "not found" does not say so.
test('a merge base without the file yet says to merge', async () => {
  const gh = new FakeGitHub({
    base: 'mergebase', // no file there
    files: { base: file(sig('alice', 1)), head: file(sig('alice', 1)) },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
  })

  const err = await failure(check(newChecker(gh).c))
  expect(err).not.toBeInstanceOf(Unsigned)
  expect((err as Error).message).toContain('merge main')
})

// The marker is invisible once rendered, so anyone can post it. Adopting a comment the gate does not
// own lets a contributor claim the slot and silence every later report.
test('a marker comment the gate does not own is not adopted', async () => {
  const gh = new FakeGitHub({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('alice', 1), user('alice', 1), 'x')],
    posted: [{ id: 5, body: `${commentMarker}\nclaimed`, botAuthor: false }],
  })

  expect(await failure(check(newChecker(gh).c))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(2)
  expect(gh.edits).toBe(0)
})

// A fork pull request chooses the commits and the trailers, and each distinct address costs a
// lookup against the repository's hourly token quota.
test('the co-author lookups are capped', async () => {
  const trailers = Array.from({ length: 60 }, (_, i) => `Co-authored-by: X <a${i}@users.noreply.github.com>`).join('\n')
  const { c } = newChecker(new FakeGitHub())

  const err = await failure(
    resolveCoauthors(c, [commit('a1', user('alice', 1), user('alice', 1), `feat\n\n${trailers}\n`)]),
  )
  expect((err as Error).message).toContain('split the pull request')
})
