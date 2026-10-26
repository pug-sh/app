// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// The kit names the commit it came from, so the script has to refuse whenever that name could be wrong. Each
// case runs the real script with Bun in a throwaway repository whose kit is a one-line stand-in.

const SCRIPT = join(process.cwd(), 'scripts/build-theme-kit.ts')

// Isolated from this machine's git config, which may sign commits or run hooks.
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

// A repository holding the script, a stand-in kit and a schema, with nothing committed yet.
const repository = () => {
  const root = mkdtempSync(join(tmpdir(), 'theme-kit-'))
  dirs.push(root)
  const files: Record<string, string> = {
    'src/theme/kit.ts': "export const kit = 'stand-in'\n",
    'schemas/theme/v1.json': '{}\n',
  }
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  mkdirSync(join(root, 'scripts'))
  copyFileSync(SCRIPT, join(root, 'scripts/build-theme-kit.ts'))
  git(root, 'init', '-q', '-b', 'main')
  return root
}

const committed = () => {
  const root = repository()
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'kit')
  return root
}

const build = (root: string) => {
  const out = join(root, 'out')
  const script = join(root, 'scripts/build-theme-kit.ts')
  const result = spawnSync('bun', [script, out], { cwd: root, env, encoding: 'utf8' })
  return { status: result.status, stderr: result.stderr, source: join(out, 'SOURCE') }
}

describe('build:theme-kit', () => {
  it('builds from a clean commit and names it', () => {
    const root = committed()
    const { status, source } = build(root)
    expect(status).toBe(0)
    expect(readFileSync(source, 'utf8')).toBe(`${git(root, 'rev-parse', 'HEAD')}\n`)
  })

  it('refuses a tree with an untracked file, which the bundler could read but SOURCE would not name', () => {
    const root = committed()
    writeFileSync(join(root, 'notes.txt'), 'not committed\n')
    const { status, stderr, source } = build(root)
    expect(status).toBe(1)
    expect(stderr).toContain('commit or stash')
    expect(existsSync(source)).toBe(false)
  })

  it('refuses when HEAD names no commit, rather than writing a SOURCE that names none', () => {
    const root = repository()
    // Nothing committed, and nothing for git status to report either.
    writeFileSync(join(root, '.git/info/exclude'), '*\n')
    const { status, stderr, source } = build(root)
    expect(status).toBe(1)
    expect(stderr).toContain('HEAD')
    expect(existsSync(source)).toBe(false)
  })
})
