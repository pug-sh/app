import { cleanup } from '@testing-library/react'
import { Storage } from 'happy-dom'
import { afterEach } from 'vitest'

// Node 25 defines its own `localStorage`/`sessionStorage` globals, and they're inert without
// --localstorage-file: every method is undefined and touching one only warns. That's enough to beat
// happy-dom to the name, because vitest only copies a window key onto globalThis when nothing already
// holds it, so the environment silently hands tests a storage that can't store. Install happy-dom's
// real Storage over the stub. The app requires both (main.tsx refuses to boot without them), so both.
for (const key of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { value: new Storage(), configurable: true, writable: true })
}

// No test reaches the network. The theme pickers ask themes.pug.sh for its catalog when they mount, and
// happy-dom's fetch is a real HTTP client, so a test that wants an answer stubs fetch itself
// (vi.stubGlobal, or serveByUrl in src/test/serve.ts). vi.unstubAllGlobals puts this one back.
Object.defineProperty(globalThis, 'fetch', {
  value: () => Promise.reject(new TypeError('fetch isn’t stubbed in this test')),
  configurable: true,
  writable: true,
})

// Tests import their globals from 'vitest' explicitly (no `globals: true`), which also means RTL's
// automatic teardown never registers: it hooks the global afterEach. Unmount here instead, or a
// test's components stay mounted and keep reacting to the next test's store writes.
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
