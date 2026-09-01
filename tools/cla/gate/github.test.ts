import { expect, test } from 'bun:test'
import { parseSignatureFile } from './check.ts'
import { Conflict, marshalSignatureFile, NoRuns, NotFound, newClient } from './github.ts'
import { caught, user, withServer } from './test-support.ts'

const client = (baseURL: string) => newClient({ token: 'token', repo: 'pug-sh/app', baseURL })

const json = (body: string, init: ResponseInit = {}) => new Response(body, init)

// The 250-commit cap is only detectable if the walk itself is complete, so the Link header has to be
// followed rather than the first page trusted.
test('pullCommits walks every page', async () => {
  let base = ''
  let page = 0
  await withServer(
    () => {
      page++
      if (page === 1) return json('[{"sha":"a1"}]', { headers: { Link: `<${base}/next>; rel="next"` } })
      return json('[{"sha":"b2"}]')
    },
    async baseURL => {
      base = baseURL
      const commits = await client(baseURL).pullCommits(7)
      expect(commits.map(c => c.sha)).toEqual(['a1', 'b2'])
    },
  )
})

// A base branch that has never had a signature file is the first-contributor case, not a failure: it
// must be distinguishable from every other error.
test('a missing signature file is reported as NotFound', async () => {
  await withServer(
    () => json('', { status: 404 }),
    async baseURL => {
      expect(await caught(client(baseURL).signatureFile('base'))).toBeInstanceOf(NotFound)
    },
  )
})

test('an unexpected status is surfaced with its body', async () => {
  await withServer(
    () => json('rate limit exceeded', { status: 403 }),
    async baseURL => {
      const err = await caught(client(baseURL).pullCommits(7))
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(NotFound)
      expect((err as Error).message).toContain('403')
      expect((err as Error).message).toContain('rate limit exceeded')
    },
  )
})

// userByLogin is the whole of co-author identity, and resolveCoauthors keys its unknown-vs-error
// split on the NotFound this throws.
test('userByLogin resolves an account and reports a missing one', async () => {
  let path = ''
  await withServer(
    req => {
      path = new URL(req.url).pathname
      if (path.includes('ghost')) return json('', { status: 404 })
      return json('{"id":99,"login":"alice","type":"User"}')
    },
    async baseURL => {
      const c = client(baseURL)
      expect(await c.userByLogin('alice')).toEqual(user('alice', 99))
      expect(path).toBe('/users/alice')

      expect(await caught(c.userByLogin('ghost'))).toBeInstanceOf(NotFound)

      // A bot co-author reaches here by design: noreplyRe keeps the [bot] suffix, and GitHub
      // resolves the escaped form.
      await c.userByLogin('dependabot[bot]')
      expect(path).toBe('/users/dependabot%5Bbot%5D')
    },
  )
})

// The merge base is what keeps a stale branch from reading as one that deleted the signatures merged
// since it branched.
test('mergeBase reads the compare endpoint', async () => {
  let path = ''
  await withServer(
    req => {
      path = new URL(req.url).pathname
      return json('{"merge_base_commit":{"sha":"mb1"}}')
    },
    async baseURL => {
      expect(await client(baseURL).mergeBase('base', 'head')).toBe('mb1')
      expect(path).toContain('/compare/base...head')
    },
  )
})

// A compare response without a merge base must fail rather than silently read the signature file at
// the empty ref, which resolves to the default branch.
test('mergeBase refuses an empty result', async () => {
  await withServer(
    () => json('{}'),
    async baseURL => {
      expect(await caught(client(baseURL).mergeBase('base', 'head'))).toBeInstanceOf(Error)
    },
  )
})

// The comment endpoints are the gate's only writes on the checker's side; a wrong method or path is
// silent at compile time and only shows up as a comment nobody ever receives.
test('comment writes use the issue endpoints', async () => {
  let method = ''
  let path = ''
  let body = ''
  await withServer(
    async req => {
      method = req.method
      path = new URL(req.url).pathname
      body = await req.text()
      return json('{"id":1}', { status: 201 })
    },
    async baseURL => {
      const c = client(baseURL)
      await c.createComment(7, 'please sign')
      expect(method).toBe('POST')
      expect(path).toBe('/repos/pug-sh/app/issues/7/comments')
      expect(body).toContain('"body":"please sign"')

      await c.updateComment(42, 'signed')
      expect(method).toBe('PATCH')
      expect(path).toBe('/repos/pug-sh/app/issues/comments/42')
    },
  )
})

// Stopping at page one would hide the gate's own comment on a busy pull request, so every push would
// post another one instead of editing it.
test('comments walks every page', async () => {
  let base = ''
  let page = 0
  await withServer(
    () => {
      page++
      if (page === 1) return json('[{"id":1,"body":"first"}]', { headers: { Link: `<${base}/page2>; rel="next"` } })
      return json('[{"id":2,"body":"second"}]')
    },
    async baseURL => {
      base = baseURL
      const all = await client(baseURL).comments(7)
      expect(all.map(c => c.id)).toEqual([1, 2])
    },
  )
})

test('a refused write is surfaced', async () => {
  await withServer(
    () => json('resource not accessible by integration', { status: 403 }),
    async baseURL => {
      const err = await caught(client(baseURL).createComment(7, 'please sign'))
      expect((err as Error).message).toContain('resource not accessible')
    },
  )
})

// The label name carries a space and a colon, so removing it goes through an escaped URL rather than
// a formatted one.
test('label writes use the issue endpoints', async () => {
  let method = ''
  let path = ''
  let body = ''
  await withServer(
    async req => {
      method = req.method
      path = new URL(req.url).pathname
      body = await req.text()
      return json('[]')
    },
    async baseURL => {
      const c = client(baseURL)
      await c.labels(7)
      expect(method).toBe('GET')
      expect(path).toBe('/repos/pug-sh/app/issues/7/labels')

      await c.addLabel(7, 'cla: not signed')
      expect(method).toBe('POST')
      expect(path).toBe('/repos/pug-sh/app/issues/7/labels')
      expect(body).toContain('{"labels":["cla: not signed"]}')

      await c.removeLabel(7, 'cla: not signed')
      expect(method).toBe('DELETE')
      expect(path).toBe('/repos/pug-sh/app/issues/7/labels/cla%3A%20not%20signed')
      expect(body).toBe('')
    },
  )
})

// A stale blob sha is a signature that landed between the read and the write, not a fault, so it has
// to be distinguishable from every other non-2xx.
test('a 409 is reported as Conflict and nothing else is', async () => {
  await withServer(
    () => json('{"message":"does not match abc123"}', { status: 409 }),
    async baseURL => {
      expect(await caught(client(baseURL).createComment(7, 'x'))).toBeInstanceOf(Conflict)
    },
  )
  await withServer(
    () => json('{"message":"forbidden"}', { status: 403 }),
    async baseURL => {
      const err = await caught(client(baseURL).createComment(7, 'x'))
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(Conflict)
    },
  )
})

// GitHub wraps base64 content at 60 characters. A decoder that does not strip the newlines fails on
// every real response, so the fixture carries one.
test('signatureFileMeta decodes the content and the sha', async () => {
  let ref = ''
  await withServer(
    req => {
      ref = new URL(req.url).searchParams.get('ref') ?? ''
      return json(
        '{"sha":"abc123","encoding":"base64","content":"eyJjbGFfdmVyc2lvbiI6InYxIiwic2ln\\nbmF0dXJlcyI6W119"}',
      )
    },
    async baseURL => {
      const { file, sha } = await client(baseURL).signatureFileMeta('main')
      expect(ref).toBe('main')
      expect(sha).toBe('abc123')
      expect(file.claVersion).toBe('v1')
      expect(file.signatures).toEqual([])
    },
  )
})

test('signatureFileMeta rejects an unexpected encoding', async () => {
  await withServer(
    () => json('{"sha":"abc123","encoding":"none","content":""}'),
    async baseURL => {
      expect(await caught(client(baseURL).signatureFileMeta('main'))).toBeInstanceOf(Error)
    },
  )
})

test('putSignatureFile sends the author, the sha and the file as it is written by hand', async () => {
  let got: Record<string, unknown> = {}
  let method = ''
  await withServer(
    async req => {
      method = req.method
      got = (await req.json()) as Record<string, unknown>
      return json('{}')
    },
    async baseURL => {
      await client(baseURL).putSignatureFile(
        'main',
        { claVersion: 'v1', signatures: [{ login: 'alice', id: 1, date: '2026-09-01', cla: 'v1' }] },
        'abc123',
        'chore(cla): sign v1 for @alice',
        user('alice', 1),
      )
      expect(method).toBe('PUT')
      expect(got.sha).toBe('abc123')
      expect(got.branch).toBe('main')

      // The author is the contributor, so the record stays in git history under the identity that
      // agreed to it; the committer is whatever the token is.
      expect(got.author).toEqual({ name: 'alice', email: '1+alice@users.noreply.github.com' })

      const decoded = Buffer.from(String(got.content), 'base64').toString('utf8')
      // A signature recorded by /sign must leave no reformatting diff against one added by hand, or
      // the next hand-edit rewrites the whole file.
      expect(decoded.endsWith('}\n')).toBe(true)
      expect(decoded).toContain('      "login": "alice"')
    },
  )
})

test('putSignatureFile propagates a conflict', async () => {
  await withServer(
    () => json('{"message":"sha does not match"}', { status: 409 }),
    async baseURL => {
      const err = await caught(
        client(baseURL).putSignatureFile('main', { claVersion: 'v1', signatures: [] }, 'stale', 'm', user('a', 1)),
      )
      expect(err).toBeInstanceOf(Conflict)
    },
  )
})

// issue_comment carries the issue, not the pull request, so the signer has neither the base branch
// nor the commit count and must read both.
test('pullRequest decodes the base, the head and the commit count', async () => {
  await withServer(
    () =>
      json(`{"number":107,"state":"open","commits":3,
        "user":{"id":876188,"login":"poluruprvn","type":"User"},
        "head":{"sha":"deadbeef"},"base":{"ref":"main"}}`),
    async baseURL => {
      const pr = await client(baseURL).pullRequest(107)
      expect(pr.baseRef).toBe('main')
      expect(pr.headSha).toBe('deadbeef')
      expect(pr.commits).toBe(3)
      expect(pr.user).toEqual({ id: 876188, login: 'poluruprvn', type: 'User' })
      expect(pr.state).toBe('open')
    },
  )
})

test('the latest run is found by head sha and re-run by id', async () => {
  let rerun = 0
  let headSha = ''
  await withServer(
    req => {
      const url = new URL(req.url)
      if (url.pathname.endsWith('/rerun')) {
        rerun = Number(url.pathname.split('/').at(-2))
        return json('', { status: 201 })
      }
      headSha = url.searchParams.get('head_sha') ?? ''
      return json('{"workflow_runs":[{"id":991,"status":"completed"}]}')
    },
    async baseURL => {
      const c = client(baseURL)
      const run = await c.latestWorkflowRun('cla.yaml', 'deadbeef')
      expect(headSha).toBe('deadbeef')
      expect(run.id).toBe(991)
      await c.rerunWorkflow(run.id)
      expect(rerun).toBe(991)
    },
  )
})

// No run yet is an ordinary outcome — a contributor can comment /sign before the checker has ever run
// — so it must not read as an API failure. It is kept apart from NotFound because a 404 here means
// the workflow file was renamed, and reporting that as "the first check will pass" promises a run
// that never comes.
test('an empty run list is NoRuns, not NotFound', async () => {
  await withServer(
    () => json('{"workflow_runs":[]}'),
    async baseURL => {
      const err = await caught(client(baseURL).latestWorkflowRun('cla.yaml', 'deadbeef'))
      expect(err).toBeInstanceOf(NoRuns)
      expect(err).not.toBeInstanceOf(NotFound)
    },
  )
})

// The no-reformatting-diff claim, pinned against the real file rather than a fixture: a hand-edit and
// a /sign have to produce the same bytes, or each rewrites the other's whole file.
test('marshalSignatureFile round-trips the real file', async () => {
  const onDisk = await Bun.file(`${import.meta.dir}/../signatures.json`).text()
  expect(marshalSignatureFile(parseSignatureFile(onDisk))).toBe(onDisk)
})
