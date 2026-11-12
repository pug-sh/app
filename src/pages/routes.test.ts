import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { matchRoute, useRouter } from 'wouter'
import { routes } from './routes'

// public/ never enters the module graph, so a renamed page leaves llms.txt naming its old path.
describe('llms.txt', () => {
  it('names only pages that exist', () => {
    const { parser } = renderHook(() => useRouter()).result.current
    const text = readFileSync(join(process.cwd(), 'public', 'llms.txt'), 'utf8')
    const paths = [...text.matchAll(/`(\/p\/<projectId>\/[^`]*)`/g)].map(([, path]) => path.replace(/<[^>]+>/g, 'x1'))

    expect(paths.length).toBeGreaterThan(10)
    expect(paths.filter(path => !Object.keys(routes).some(route => matchRoute(parser, route, path)[0]))).toEqual([])
  })
})
