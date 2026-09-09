import { expect, test } from 'bun:test'
import { run } from './gate.ts'
import { subcommand } from './main.ts'
import { runSign } from './sign.ts'

// A mistyped subcommand must not silently fall through to the checker: reporting a signature that was
// never recorded is the one outcome worse than an error.
test('an unknown subcommand is rejected, and a bare one is the checker', () => {
  expect(subcommand(['sing'])).toBeUndefined()
  // cla.yaml invokes the gate bare. Dispatching that to the signer would find no COMMENT_BODY, return
  // without doing anything, and turn the required check green having checked nothing — so the
  // function itself is asserted, not just that one was returned.
  expect(subcommand([])).toBe(run)
  expect(subcommand(['sign'])).toBe(runSign)
})
