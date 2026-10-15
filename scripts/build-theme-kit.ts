// Builds the theme kit pug-sh/themes vendors: this build's theme checker bundled for Bun, the format's
// JSON Schema, and the commit both came from. Run it from a commit that is deployed, so the repository
// never approves a file members' browsers would warn about:
//   bun run build:theme-kit ../themes/kit
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('usage: bun run build:theme-kit <dir>')
  process.exit(1)
}
const root = path.resolve(import.meta.dirname, '..')
const git = (...args: string[]) => Bun.spawnSync(['git', ...args], { cwd: root })
if (git('diff', '--quiet', 'HEAD').exitCode !== 0) {
  console.error('build:theme-kit: commit or stash your changes first; the kit names the commit it came from')
  process.exit(1)
}
const commit = git('rev-parse', 'HEAD').stdout.toString().trim()
const built = await Bun.build({ entrypoints: [path.join(root, 'src/theme/kit.ts')], target: 'bun', format: 'esm' })
if (!built.success) {
  for (const log of built.logs) console.error(log)
  process.exit(1)
}
const dir = path.resolve(out)
mkdirSync(dir, { recursive: true })
writeFileSync(path.join(dir, 'theme-kit.js'), await built.outputs[0].text())
copyFileSync(path.join(root, 'schemas/theme/v1.json'), path.join(dir, 'v1.json'))
writeFileSync(path.join(dir, 'SOURCE'), `${commit}\n`)
console.log(`wrote theme-kit.js, v1.json and SOURCE (${commit.slice(0, 7)}) to ${dir}`)
