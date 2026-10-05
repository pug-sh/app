import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// Invisible characters in source can't be reviewed: a bidi override reorders what a reader sees
// (Trojan Source), and one inside a regex is a filter nobody can audit. Write them as escapes
// (\u202e), never literally. Generated proto code is excluded.
const FORBIDDEN = /[\u202a-\u202e\u2066-\u2069\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'genproto' ? [] : sources(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })

it('keeps invisible control and bidi characters out of source', () => {
  const offenders = sources(join(process.cwd(), 'src')).filter(file => FORBIDDEN.test(readFileSync(file, 'utf8')))
  expect(offenders.map(file => file.replace(`${process.cwd()}/`, ''))).toEqual([])
})
