// Fails a built dashboard that isn't air-gapped: the address of something Pug hosts in any file, or a preconnect in
// index.html. CI builds with only VITE_API_BASE_URL set, so its dist is the air-gapped build, and the hosts being gone
// is what proves the switch is read statically: Vite inlines it and the minifier drops the branch.
//   bun run check:air-gap [dir]
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const PUG_HOSTS = ['themes.pug.sh', 'favicons.pug.sh']

export const airGapProblems = (files: { path: string; text: string }[]) => {
  const problems = files.flatMap(file =>
    PUG_HOSTS.filter(host => file.text.includes(host)).map(host => `${file.path} holds ${host}`),
  )
  const page = files.find(file => file.path === 'index.html')
  if (page?.text.includes('preconnect')) problems.push('index.html has a preconnect')
  return problems
}

if (import.meta.main) {
  const [dir = 'dist'] = process.argv.slice(2)
  const names = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(name => /\.(js|css|html)$/.test(name))
  const files = names.map(name => ({ path: name, text: readFileSync(path.join(dir, name), 'utf8') }))
  const problems = names.includes('index.html') ? airGapProblems(files) : [`${dir} has no index.html`]
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exit(1)
  console.log(`${dir} is air-gapped: ${files.length} files checked.`)
}
