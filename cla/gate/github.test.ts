import { afterEach, expect, test } from 'bun:test'
import { NotFound, newClient } from './github.ts'

const servers: ReturnType<typeof Bun.serve>[] = []

afterEach(() => {
  for (const s of servers.splice(0)) s.stop(true)
})

function testClient(handler: (req: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ port: 0, fetch: handler })
  servers.push(server)
  return {
    client: newClient({ token: 'token', repo: 'pug-sh/app', baseURL: server.url.origin }),
    base: server.url.origin,
  }
}

// The 250-commit cap is only detectable if the walk itself is complete, so the Link header has to be
// followed rather than the first page trusted.
test('pullCommits walks every page', async () => {
  let page = 0
  const { client, base } = testClient(() => {
    page++
    if (page === 1) {
      return new Response('[{"sha":"a1","commit":{"message":"feat"}}]', {
        headers: { Link: `<${base}/next>; rel="next"` },
      })
    }
    return new Response('[{"sha":"b2","commit":{"message":"feat"}}]')
  })

  expect((await client.pullCommits(7)).map(c => c.sha)).toEqual(['a1', 'b2'])
})

// A page that is not an array would be iterated as an object rather than failing, which is how a
// jq-based check silently read nothing.
test('a page that is not an array is refused', async () => {
  const { client } = testClient(() => new Response('{"sha":"a1","commit":{"message":"feat"}}'))
  await expect(client.pullCommits(7)).rejects.toThrow('not an array')
})

// A base branch that has never had a signature file is the first-contributor case, not a failure.
test('a missing file is reported as NotFound', async () => {
  const { client } = testClient(() => new Response(null, { status: 404 }))
  await expect(client.signatureFile('base')).rejects.toBeInstanceOf(NotFound)
})

test('an unexpected status carries the status and the body', async () => {
  const { client } = testClient(() => new Response('rate limit exceeded', { status: 403 }))

  const err = await client.pullCommits(7).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(Error)
  expect(err).not.toBeInstanceOf(NotFound)
  expect((err as Error).message).toContain('403')
  expect((err as Error).message).toContain('rate limit exceeded')
})

// userByLogin is the whole of co-author identity, and resolveCoauthors keys its
// unidentified-vs-error split on the NotFound it throws.
test('userByLogin resolves an account and reports a missing one', async () => {
  let path = ''
  const { client } = testClient(req => {
    path = decodeURIComponent(new URL(req.url).pathname)
    if (path.includes('ghost')) return new Response(null, { status: 404 })
    return new Response('{"id":99,"login":"alice","type":"User"}')
  })

  expect(await client.userByLogin('alice')).toEqual({ id: 99, login: 'alice', type: 'User' })
  expect(path).toBe('/users/alice')

  await expect(client.userByLogin('ghost')).rejects.toBeInstanceOf(NotFound)

  // A bot co-author reaches here by design: the noreply pattern keeps the [bot] suffix.
  await client.userByLogin('dependabot[bot]')
  expect(path).toBe('/users/dependabot[bot]')
})

// The merge base is what keeps a stale branch from reading as one that deleted the signatures
// merged since it branched.
test('mergeBase reads the compare endpoint and refuses an empty result', async () => {
  let path = ''
  const { client } = testClient(req => {
    path = decodeURIComponent(new URL(req.url).pathname)
    return new Response('{"merge_base_commit":{"sha":"mb1"}}')
  })
  expect(await client.mergeBase('base', 'head')).toBe('mb1')
  expect(path).toBe('/repos/pug-sh/app/compare/base...head')

  // An empty ref would otherwise read the signature file at the default branch.
  const { client: empty } = testClient(() => new Response('{}'))
  await expect(empty.mergeBase('base', 'head')).rejects.toThrow('no merge base')
})

// The comment endpoints are the gate's only writes; a wrong method or path only shows up as a
// comment nobody ever receives.
test('comment writes use the issue endpoints', async () => {
  let seen = { method: '', path: '', body: '' }
  const { client } = testClient(async req => {
    seen = { method: req.method, path: new URL(req.url).pathname, body: await req.text() }
    return new Response('{"id":1}', { status: 201 })
  })

  await client.createComment(7, 'please sign')
  expect(seen.method).toBe('POST')
  expect(seen.path).toBe('/repos/pug-sh/app/issues/7/comments')
  expect(seen.body).toContain('"body":"please sign"')

  await client.updateComment(42, 'signed')
  expect(seen.method).toBe('PATCH')
  expect(seen.path).toBe('/repos/pug-sh/app/issues/comments/42')
})

// Stopping at page one would hide the gate's own comment on a busy pull request, so every push
// would post another one instead of editing it.
test('comments walks every page', async () => {
  let page = 0
  const { client, base } = testClient(() => {
    page++
    if (page === 1) {
      return new Response('[{"id":1,"body":"first"}]', { headers: { Link: `<${base}/page2>; rel="next"` } })
    }
    return new Response('[{"id":2,"body":"second"}]')
  })

  expect((await client.comments(7)).map(c => c.id)).toEqual([1, 2])
})

test('a refused write is surfaced', async () => {
  const { client } = testClient(() => new Response('resource not accessible by integration', { status: 403 }))
  await expect(client.createComment(7, 'please sign')).rejects.toThrow('resource not accessible')
})

// The label name carries a space and a colon, so removing it goes through an escaped URL rather
// than an interpolated one.
test('label writes use the issue endpoints', async () => {
  let seen = { method: '', path: '', body: '' }
  const { client } = testClient(async req => {
    seen = { method: req.method, path: new URL(req.url).pathname, body: await req.text() }
    return new Response('[]')
  })

  await client.labels(7)
  expect(seen.method).toBe('GET')
  expect(seen.path).toBe('/repos/pug-sh/app/issues/7/labels')

  await client.addLabel(7, 'cla: not signed')
  expect(seen.method).toBe('POST')
  expect(seen.path).toBe('/repos/pug-sh/app/issues/7/labels')
  expect(seen.body).toBe('{"labels":["cla: not signed"]}')

  await client.removeLabel(7, 'cla: not signed')
  expect(seen.method).toBe('DELETE')
  expect(seen.path).toBe('/repos/pug-sh/app/issues/7/labels/cla%3A%20not%20signed')
  expect(seen.body).toBe('')
})

// An author object with no usable id is the same fact as a null author — GitHub cannot identify
// them — so it has to take the same path, or unsigned() drops the principal and the gate says
// "verified" with an unchecked author in the pull request.
test('an author with no usable id decodes to no author', async () => {
  const body = JSON.stringify([
    {
      sha: 'a1',
      commit: { message: 'feat' },
      author: { login: 'mallory' },
      committer: { id: 2, login: 'm', type: 'User' },
    },
  ])
  const { client } = testClient(() => new Response(body))

  const [c] = await client.pullCommits(7)
  expect(c.author).toBeNull()
  expect(c.committer).toEqual({ id: 2, login: 'm', type: 'User' })
})

// Coalescing an absent message to '' loses every Co-authored-by trailer with nothing to notice it.
test('a commit that arrives without a message is refused', async () => {
  const { client } = testClient(() => new Response('[{"sha":"a1","author":null,"committer":null}]'))
  await expect(client.pullCommits(7)).rejects.toThrow('without a message')
})

// The next page is fetched with the bearer token attached, so it must not leave the API host.
test('pagination will not follow a link off the api host', async () => {
  const { client } = testClient(
    () =>
      new Response('[{"sha":"a1","commit":{"message":"x"}}]', {
        headers: { Link: '<https://evil.example/steal>; rel="next"' },
      }),
  )
  await expect(client.pullCommits(7)).rejects.toThrow('linked off')
})

// The whole "never read the pull request's own tree" model rests on this one query parameter.
test('signatureFile reads the ref it was given', async () => {
  let url = ''
  const { client } = testClient(req => {
    url = req.url
    return new Response('{"cla_version":"v1","signatures":[]}')
  })

  await client.signatureFile('deadbee')
  expect(url).toContain('/contents/cla/signatures.json')
  expect(url).toContain('ref=deadbee')
})

// An unreadable name decoded to '', which reads as "the stale label is not on the pull request" and
// silently skipped its removal.
test('a label without a name is refused rather than read as absent', async () => {
  const { client } = testClient(() => new Response('[{"nome":"cla: signed"}]'))
  await expect(client.labels(7)).rejects.toThrow('without a name')
})
