// The entry point both workflows run. A bare invocation is the checker; `sign` records a signature
// asked for by comment.

import { message, run, Unsigned } from './gate.ts'
import { escapeAnnotation } from './report.ts'
import { runSign } from './sign.ts'

// A bare invocation stays the checker, so cla.yaml is untouched by the signer's arrival. Anything
// else unrecognised is a typo, not a mode: falling through to the checker would report a signature
// that was never recorded, which is worse than any error.
export const subcommand = (args: string[]) => {
  if (args.length === 0) return run
  if (args[0] === 'sign') return runSign
  return undefined
}

const main = async () => {
  const args = process.argv.slice(2)
  const dispatch = subcommand(args)
  if (dispatch === undefined) {
    process.stdout.write(
      `::error::unknown subcommand ${escapeAnnotation(JSON.stringify(args[0]))}; use \`sign\` or no argument\n`,
    )
    process.exit(1)
  }
  try {
    await dispatch()
  } catch (err) {
    // An unsigned CLA has already been reported with its own annotation; anything else is a checker
    // fault that nothing has annotated yet.
    if (!(err instanceof Unsigned)) process.stdout.write(`::error::${escapeAnnotation(message(err))}\n`)
    process.exit(1)
  }
}

if (import.meta.main) await main()
