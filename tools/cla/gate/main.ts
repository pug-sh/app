// The entry point both workflows run. A bare invocation is the checker; `sign` records a signature
// asked for by comment.

import { message, run, Unsigned } from './gate.ts'
import { escapeAnnotation } from './report.ts'
import { runSign } from './sign.ts'

// A bare invocation stays the checker, so cla.yaml is untouched by the signer's arrival. A typo is
// not a mode: dispatching it to the signer would find COMMENT_BODY empty, return, and take the
// required check green having checked nothing.
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
    // An unsigned CLA has already printed its own annotation, so a second would duplicate it.
    // Everything else is annotated here, including a Declined /sign: the contributor already has
    // their reply as a comment, but the annotation is the only place an operator sees the refusal.
    if (!(err instanceof Unsigned)) process.stdout.write(`::error::${escapeAnnotation(message(err))}\n`)
    process.exit(1)
  }
}

if (import.meta.main) await main()
