// Writes the built-in themes' CSS and the format's JSON Schema from src/theme. Both outputs are
// tracked; builtin-themes.test.ts fails while either is stale. Run: `bun run generate:themes`.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { builtinThemesCss } from '../src/theme/css'
import { themeJsonSchema } from '../src/theme/schema'

const root = path.resolve(import.meta.dirname, '..')
writeFileSync(path.join(root, 'src/theme/generated/builtin-themes.css'), builtinThemesCss())
writeFileSync(path.join(root, 'schemas/theme/v1.json'), themeJsonSchema())
console.log('wrote src/theme/generated/builtin-themes.css and schemas/theme/v1.json')
