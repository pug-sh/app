import { expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendOnly, invalidReason, type SignatureFile } from './check.ts'
import { check, loadConfig, resolveCoauthors, Unsigned } from './gate.ts'
import { commentMarker, escapeAnnotation, labelSigned, labelUnsigned, signedComment } from './report.ts'
import { alice, caught, commit, file, newChecker, newFake, sig, sink, user, withEnv } from './test-support.ts'

const bot = { id: 49699333, login: 'dependabot[bot]', type: 'Bot' }

test('a pull request whose principals have all signed passes', async () => {
  const out = sink()
  const c = newChecker(
    newFake({
      files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
      commits: [commit('a1', alice, alice, 'feat: thing')],
    }),
    out,
  )

  await check(c)
  expect(out.text()).toContain('CLA v1 verified')
})

test('the unsigned contributor is reported, and only the opener is handed an entry', async () => {
  const out = sink()
  const c = newChecker(
    newFake({
      files: { head: file(), base: file() },
      commits: [commit('a1', user('bob', 2), user('bob', 2), 'feat: thing')],
    }),
    out,
  )

  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  // main relies on the report carrying its own annotation; a second one would show a bare sentinel
  // on the checks page.
  expect(out.text().startsWith('::error::')).toBe(true)
  // alice opened it, so hers is the entry offered; bob authored the commit and is named, but only he
  // can sign for himself.
  for (const want of ['alice', 'bob', '"id": 1', 'commenting `/sign`']) expect(out.text()).toContain(want)
  expect(out.text()).not.toContain('"id": 2')
})

test('a truncated commit list is refused', async () => {
  const c = newChecker(
    newFake({
      files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
      commits: [commit('a1', alice, alice, 'x')],
    }),
    sink(),
  )
  c.cfg.prCommits = 300

  const err = await caught(check(c))
  expect((err as Error).message).toContain("listed 1 of the pull request's 300 commits")
})

test('the job summary is written', async () => {
  const c = newChecker(
    newFake({ files: { head: file(), base: file() }, commits: [commit('a1', user('bob', 2), user('bob', 2), 'x')] }),
    sink(),
  )
  c.cfg.summaryPath = join(await mkdtemp(join(tmpdir(), 'cla-gate-')), 'summary.md')

  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  expect(await readFile(c.cfg.summaryPath, 'utf8')).toContain('## CLA signature required')
})

// A rate limit is not evidence that carol has no account, so it must not reach her as
// "unidentified" — that sends the contributor off to fix an address that was fine. It is the
// checker's fault and is raised as one.
test('a co-author lookup failure is raised, not reported', async () => {
  const commits = [
    commit('a1', alice, alice, 'feat: thing\n\nCo-authored-by: Carol <carol@users.noreply.github.com>\n'),
  ]
  const gh = newFake({ lookupErr: new Error('403 rate limit exceeded') })

  expect(await caught(resolveCoauthors(gh, commits))).toBeInstanceOf(Error)
})

// A plaintext address is not resolved at all: user search sees only emails made public on a profile,
// so it answers for a minority and costs the strictest rate limit we touch. It reaches the
// contributor through the report, not as a fault.
test('a plaintext co-author address is reported', async () => {
  const commits = [commit('a1', alice, alice, 'feat: thing\n\nCo-authored-by: Carol <carol@example.com>\n')]

  const { found, unknown } = await resolveCoauthors(newFake(), commits)
  expect(found).toEqual([])
  expect(unknown).toEqual(['carol@example.com'])
})

// An assistant holds no copyright, so its trailer is skipped rather than blocking — otherwise every
// contributor using one rewrites their branch. The pairing matters: an address that might belong to a
// person must still stop the gate, or the exemption is a hole rather than a rule.
test("an assistant trailer is skipped but a person's at the same domain is not", async () => {
  const gh = newFake()
  const assistant = await resolveCoauthors(gh, [
    commit('a1', alice, alice, 'feat: thing\n\nCo-authored-by: Claude <noreply@anthropic.com>\n'),
  ])
  expect(assistant.found).toEqual([])
  expect(assistant.unknown).toEqual([])

  const colleague = await resolveCoauthors(gh, [
    commit('a1', alice, alice, 'feat: thing\n\nCo-authored-by: Carol <carol@anthropic.com>\n'),
  ])
  expect(colleague.unknown).toHaveLength(1)
})

// The gate still blocks — a trailer names a copyright holder either way — but the contributor must
// meet the ordinary report, not an error that hides it.
test('an unidentified co-author blocks through the report', async () => {
  const out = sink()
  const gh = newFake({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', alice, alice, 'feat\n\nCo-authored-by: Carol <carol@example.com>\n')],
  })

  expect(await caught(check(newChecker(gh, out)))).toBeInstanceOf(Unsigned)
  for (const want of ['::error::', 'carol@example.com', 'drop the trailer']) expect(out.text()).toContain(want)
  expect(gh.posted).toHaveLength(1)
  expect(gh.posted[0]!.body).toContain('carol@example.com')
})

test('the id-less noreply form is resolved through the API', async () => {
  const commits = [commit('a1', alice, alice, 'feat: thing\n\nCo-authored-by: Bob <bob@users.noreply.github.com>\n')]
  const gh = newFake({ byLogin: { bob: user('bob', 99) } })

  const { found, unknown } = await resolveCoauthors(gh, commits)
  expect(unknown).toEqual([])
  expect(found).toEqual([user('bob', 99)])
})

test('loadConfig falls back for the optional inputs', () => {
  // Every var is set explicitly: the checker's own tests run inside Actions, where GITHUB_* is
  // already populated.
  const cfg = withEnv(
    {
      GITHUB_REPOSITORY: 'pug-sh/app',
      GITHUB_SERVER_URL: '',
      GITHUB_STEP_SUMMARY: '',
      GH_TOKEN: '',
      GITHUB_TOKEN: 't',
      PR_NUMBER: '7',
      PR_COMMITS: '3',
      PR_HEAD_SHA: 'head',
      PR_BASE_SHA: 'base',
      PR_BASE_REF: '',
      PR_USER_ID: '42',
      PR_USER_LOGIN: 'carol',
      PR_USER_TYPE: '',
    },
    loadConfig,
  )

  expect(cfg.baseRef).toBe('main')
  expect(cfg.serverURL).toBe('https://github.com')
  expect(cfg.token).toBe('t')
  expect(cfg.opener).toEqual({ id: 42, login: 'carol', type: 'User' })
})

test('loadConfig rejects the inputs it cannot check without', () => {
  const base = {
    GITHUB_REPOSITORY: 'pug-sh/app',
    PR_NUMBER: '7',
    PR_COMMITS: '1',
    PR_HEAD_SHA: 'head',
    PR_BASE_SHA: 'base',
    GH_TOKEN: 't',
    PR_USER_ID: '42',
    PR_USER_LOGIN: 'carol',
  }
  const cases: [string, Record<string, string>, string][] = [
    ['no pr number', { PR_NUMBER: '' }, 'PR_NUMBER'],
    ['no commit total', { PR_COMMITS: 'many' }, 'PR_COMMITS'],
    ['no opener', { PR_USER_ID: '' }, 'PR_USER_ID'],
    ['no repo', { GITHUB_REPOSITORY: '' }, 'GITHUB_REPOSITORY is empty'],
    ['no head', { PR_HEAD_SHA: '' }, 'PR_HEAD_SHA is empty'],
    // "0" parses, so only the explicit guard catches it — and an id of zero is dropped by unsigned(),
    // which would empty the check rather than fail it.
    ['zero opener', { PR_USER_ID: '0' }, 'PR_USER_ID is zero'],
    // appendOnly matches the entry's login against the opener's, so an empty one refuses every
    // signature the report hands out.
    ['no opener login', { PR_USER_LOGIN: '' }, 'PR_USER_LOGIN is empty'],
  ]

  for (const [name, override, want] of cases) {
    const err = withEnv({ ...base, ...override }, () => {
      try {
        loadConfig()
        return undefined
      } catch (e) {
        return e as Error
      }
    })
    expect(err?.message, name).toContain(want)
  }
})

// A Co-authored-by trailer is commit-message text. Trusting the id it encoded let a pull request add
// a signature for anyone whose id it named; the id now comes back from the API, so the trailer cannot
// authorise an entry.
test('a forged co-author trailer cannot sign for a stranger', async () => {
  const out = sink()
  const c = newChecker(
    newFake({
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
    out,
  )
  c.cfg.opener = user('mallory', 2)

  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  expect(out.text()).toContain('you may only sign for yourself')
})

// The trailer above named a login that resolves to nobody. Naming a real one is the sharper attack:
// the id then comes back from the API and is genuinely the victim's, so only refusing every signature
// but the opener's stops it.
test('naming a real co-author still cannot sign for them', async () => {
  const out = sink()
  const c = newChecker(
    newFake({
      files: { head: file(sig('mallory', 2), sig('victim', 777)), base: file(sig('mallory', 2)) },
      commits: [
        commit(
          'a1',
          user('mallory', 2),
          user('mallory', 2),
          'feat\n\nCo-authored-by: Victim <victim@users.noreply.github.com>\n',
        ),
      ],
      byLogin: { victim: user('victim', 777) },
    }),
    out,
  )
  c.cfg.opener = user('mallory', 2)

  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  expect(out.text()).toContain('who did not open it')
})

// `git commit --author=` is free to set, so GitHub attributes the commit to whoever the address
// belongs to. That made the commit author a second way to name a victim as a principal and then sign
// for them.
test('a forged commit author cannot sign for a stranger', async () => {
  const out = sink()
  const c = newChecker(
    newFake({
      files: { head: file(sig('mallory', 2), sig('victim', 777)), base: file(sig('mallory', 2)) },
      commits: [commit('a1', user('victim', 777), user('mallory', 2), 'feat')],
    }),
    out,
  )
  c.cfg.opener = user('mallory', 2)

  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  expect(out.text()).toContain('who did not open it')
})

// The noreply form resolving to nobody must block, not be silently skipped: dropping it let the gate
// pass while never checking that person at all.
test('an unresolvable co-author is reported', async () => {
  const out = sink()
  const c = newChecker(
    newFake({
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
    out,
  )
  c.cfg.opener = user('mallory', 2)

  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  expect(out.text()).toContain('0+realperson@users.noreply.github.com')
})

// dependabot and friends author no human copyright, so there is nothing to sign. Failing these shut
// every dependency update out of the repository.
test('an all-bot pull request passes and resolves any standing demand', async () => {
  const out = sink()
  const gh = newFake({
    files: { head: file(), base: file() },
    commits: [commit('a1', bot, bot, 'chore(deps): bump x')],
    posted: [{ id: 9, body: `${commentMarker}\n## Signature required` }],
  })
  const c = newChecker(gh, out)
  c.cfg.opener = bot

  await check(c)
  expect(out.text()).toContain('nothing to sign')
  // Rebasing a human commit away leaves nobody to demand a signature from.
  expect(gh.edits).toBe(1)
  expect(gh.posted[0]!.body).not.toContain('Signature required')
})

// The base file is read at the merge base, not at the base branch tip. The tip moves as others sign,
// and every stale branch would then read as deleting them.
test('a stale branch is not accused of deleting a signature', async () => {
  const c = newChecker(
    newFake({
      base: 'mergebase',
      files: {
        mergebase: file(sig('alice', 1)),
        base: file(sig('alice', 1), sig('dave', 4)), // main moved on
        head: file(sig('alice', 1), sig('bob', 3)),
      },
      commits: [commit('a1', user('bob', 3), user('bob', 3), 'feat')],
    }),
    sink(),
  )
  c.cfg.opener = user('bob', 3)

  await check(c)
})

// A /sign comment commits to the base branch after the event fired, and a re-run replays the original
// payload — so the version in force is read from that branch by name, not from the merge base.
test('a signature that landed on the base branch after the event passes the re-run', async () => {
  const gh = newFake({
    base: 'mergebase',
    files: {
      mergebase: file(), // where the branch was cut: nobody had signed
      head: file(), // the pull request carries no signature of its own
      main: file(sig('alice', 1)), // /sign committed here after the event fired
    },
    commits: [commit('a1', alice, alice, 'feat')],
  })

  await check(newChecker(gh, sink()))
})

// cla_version belongs to the base branch: letting a pull request move it would let one invalidate
// everyone's signature at once.
test('a pull request cannot change the CLA version', () => {
  const head: SignatureFile = { claVersion: 'v2', signatures: [sig('alice', 1)] }
  expect(appendOnly(file(sig('alice', 1)), head, alice, 'v1')).toContain('cla_version is')
})

// A login is contributor-controlled text out of the signature file. Emitted raw, a newline in one
// starts a second workflow command on the line below it.
test('annotation escaping keeps an error to one command', () => {
  const problem = invalidReason(file({ login: 'a\n::error::injected', id: 1, date: 'bad', cla: 'v1' }))
  expect(problem).not.toBeNull()

  // GitHub reads one command per line, so a single line is a single command — the injected
  // "::error::" survives only as inert text after its newline goes.
  const line = `::error::${escapeAnnotation(problem!)}`
  expect(line).not.toContain('\n')
  expect(line).not.toContain('\r')
  expect(line).toContain('%0A')
})

test('escapeAnnotation encodes the special characters', () => {
  expect(escapeAnnotation('100% done\r\nnext')).toBe('100%25 done%0D%0Anext')
})

// An unsigned run must reach the contributor somewhere other than a job log, and must name them in a
// form GitHub notifies on.
test('an unsigned run comments, mentioning the contributor', async () => {
  const gh = newFake({ files: { head: file(), base: file() }, commits: [commit('a1', alice, alice, 'x')] })

  expect(await caught(check(newChecker(gh, sink())))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(1)
  for (const want of [commentMarker, '@alice', '"id": 1']) expect(gh.posted[0]!.body).toContain(want)
})

// A contributor pushing repeatedly must be notified once. The marked comment is edited in place; a
// second one would be a new notification every push.
test('the gate edits its own comment instead of posting another', async () => {
  const gh = newFake({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('bob', 2), user('bob', 2), 'x')],
    posted: [
      { id: 5, body: "someone else's review" },
      { id: 9, body: `${commentMarker}\nstale` },
    ],
  })

  expect(await caught(check(newChecker(gh, sink())))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(2)
  expect(gh.edits).toBe(1)
  expect(gh.posted[1]!.body).toContain('bob')
  expect(gh.posted[1]!.body).not.toContain('stale')
})

// An unchanged report must not be rewritten: an edit bumps the comment's timestamp and reads as news
// to everyone watching the pull request.
test('an unchanged comment is left alone', async () => {
  const gh = newFake({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('bob', 2), user('bob', 2), 'x')],
  })
  const c = newChecker(gh, sink())

  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(1)
  expect(gh.edits).toBe(0)
})

// Once signed, the demand has been met: the comment is replaced rather than left standing on a merged
// pull request. A pull request that was never asked gets no comment at all.
test('the comment is resolved once signed, and never posted unasked', async () => {
  const gh = newFake({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', alice, alice, 'x')],
    posted: [{ id: 9, body: `${commentMarker}\n## Signature required` }],
  })
  await check(newChecker(gh, sink()))
  expect(gh.posted).toHaveLength(1)
  expect(gh.posted[0]!.body).toContain('CLA v1 signed')

  const quiet = newFake({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', alice, alice, 'x')],
  })
  await check(newChecker(quiet, sink()))
  expect(quiet.posted).toEqual([])
})

// The comment is best-effort: a repository whose token cannot comment must still fail on the
// signature, not on the notification.
test('the verdict survives a comment that cannot be written', async () => {
  const refusedWrite = new Error('403 resource not accessible by integration')

  const unsignedPR = newFake({
    files: { head: file(), base: file() },
    commits: [commit('a1', user('bob', 2), user('bob', 2), 'x')],
    writeErr: refusedWrite,
  })
  expect(await caught(check(newChecker(unsignedPR, sink())))).toBeInstanceOf(Unsigned)

  const signedPR = newFake({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', alice, alice, 'x')],
    posted: [{ id: 9, body: `${commentMarker}\n## Signature required` }],
    listErr: refusedWrite,
  })
  await check(newChecker(signedPR, sink()))

  // A refused edit must annotate: the run exits 0, so its log is the one nobody opens and the gate
  // would go quiet unnoticed.
  const out = sink()
  const refused = newFake({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', alice, alice, 'x')],
    posted: [{ id: 9, body: `${commentMarker}\n## Signature required` }],
    writeErr: refusedWrite,
  })
  await check(newChecker(refused, out))
  expect(out.text()).toContain('::warning::')
})

// A comment that merely quotes the gate is not the gate's: GitHub's quote-reply copies the marker in,
// and editing it would silence the gate for good.
test('a quoted marker is not the gate’s own comment', async () => {
  const gh = newFake({
    files: { head: file(), base: file() },
    commits: [commit('a1', alice, alice, 'x')],
    posted: [{ id: 5, body: `> ${commentMarker}\n> ## Signature required\n\nwhy?` }],
  })

  expect(await caught(check(newChecker(gh, sink())))).toBeInstanceOf(Unsigned)
  expect(gh.posted).toHaveLength(2)
  expect(gh.edits).toBe(0)
})

// A gate that fell over must not leave "signed" standing on a red check, nor repeat advice the
// contributor has just followed and failed on.
test('a gate that cannot finish replaces its own comment', async () => {
  // No file at the head sha: the gate cannot read what it is meant to judge.
  const broken = () => newFake({ files: { base: file() }, commits: [commit('a1', alice, alice, 'x')] })

  const gh = broken()
  gh.posted = [{ id: 9, body: signedComment('v1') }]
  const err = await caught(check(newChecker(gh, sink())))
  expect(err).toBeInstanceOf(Error)
  expect(err).not.toBeInstanceOf(Unsigned)
  expect(gh.edits).toBe(1)
  expect(gh.posted[0]!.body).not.toContain('signed')

  // Nothing standing means nothing to correct; a bare failure is not worth a comment.
  const quiet = broken()
  expect(await caught(check(newChecker(quiet, sink())))).toBeInstanceOf(Error)
  expect(quiet.posted).toEqual([])
})

// The label is what makes CLA status visible in the pull request list, and the two are mutually
// exclusive: a signed pull request still carrying "not signed" is worse than no label at all.
test('each outcome sets its own label', async () => {
  const gh = newFake({
    files: { head: file(), base: file() },
    commits: [commit('a1', alice, alice, 'x')],
    labelled: ['enhancement', labelSigned],
  })
  expect(await caught(check(newChecker(gh, sink())))).toBeInstanceOf(Unsigned)
  expect(gh.labelled).toEqual(['enhancement', labelUnsigned])

  const signedPR = newFake({
    files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
    commits: [commit('a1', alice, alice, 'x')],
    labelled: [labelUnsigned],
  })
  await check(newChecker(signedPR, sink()))
  expect(signedPR.labelled).toEqual([labelSigned])

  // A gate that could not finish knows nothing, but must not leave "signed" standing on a red check.
  const brokenPR = newFake({
    files: { base: file() },
    commits: [commit('a1', alice, alice, 'x')],
    labelled: [labelSigned],
  })
  expect(await caught(check(newChecker(brokenPR, sink())))).toBeInstanceOf(Error)
  expect(brokenPR.labelled).toEqual([])
})

// A label event notifies everyone watching the pull request, so a run that changes nothing must write
// nothing.
test('a correct label is not rewritten', async () => {
  const gh = newFake({
    files: { head: file(), base: file() },
    commits: [commit('a1', alice, alice, 'x')],
    labelled: [labelUnsigned],
  })
  expect(await caught(check(newChecker(gh, sink())))).toBeInstanceOf(Unsigned)
  expect(gh.labelWrites).toBe(0)
})

// The signature file is absent at the merge base only if the read failed, now that it exists on the
// base branch. Treating that as an empty history disarmed both append-only guards, so a pull request
// could name its own cla_version.
test('a missing base file is a failure, not an empty history', async () => {
  const out = sink()
  const c = newChecker(
    newFake({
      base: 'mergebase', // no file there
      files: {
        base: file(),
        head: { claVersion: 'vBOGUS', signatures: [{ login: 'mallory', id: 7, date: '2026-08-30', cla: 'vBOGUS' }] },
      },
      commits: [commit('a1', user('mallory', 7), user('mallory', 7), 'feat')],
    }),
    out,
  )
  c.cfg.opener = user('mallory', 7)

  const err = await caught(check(c))
  expect(err).toBeInstanceOf(Error)
  expect(err).not.toBeInstanceOf(Unsigned)
  expect(out.text()).not.toContain('verified')
})

// A rejected edit is the contributor's to fix, so it takes the unsigned label and a comment rather
// than reading as a gate that fell over.
test('a rejected edit is reported like an unsigned CLA', async () => {
  const gh = newFake({
    files: { head: file(sig('mallory', 2), sig('victim', 777)), base: file(sig('mallory', 2)) },
    commits: [commit('a1', user('mallory', 2), user('mallory', 2), 'feat')],
    labelled: [labelSigned],
  })
  const c = newChecker(gh, sink())
  c.cfg.opener = user('mallory', 2)

  expect(await caught(check(c))).toBeInstanceOf(Unsigned)
  expect(gh.labelled).toEqual([labelUnsigned])
  expect(gh.posted).toHaveLength(1)
  expect(gh.posted[0]!.body).toContain('was rejected')
})

// An assistant trailer names no copyright holder, so a pull request carrying one and nothing else
// must go green without a history rewrite.
test('an assistant trailer alone does not block the gate', async () => {
  for (const addr of ['noreply@anthropic.com', 'NoReply@Anthropic.COM']) {
    const c = newChecker(
      newFake({
        files: { head: file(sig('alice', 1)), base: file(sig('alice', 1)) },
        commits: [commit('a1', alice, alice, `feat\n\nCo-authored-by: Claude <${addr}>\n`)],
      }),
      sink(),
    )
    await check(c)
  }
})
