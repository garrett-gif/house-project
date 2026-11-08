// Fails the build if anything that looks like an Anthropic credential or direct API call reached the browser bundle.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PATTERNS = [/sk-ant-[A-Za-z0-9_-]{8,}/, /api\.anthropic\.com/, /x-api-key/i, /ANTHROPIC_API_KEY/, /anthropic-dangerous-direct-browser-access/]
const files = []
const walk = dir => { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
walk('dist')
const hits = files.flatMap(f => { const text = readFileSync(f, 'utf8'); return PATTERNS.filter(p => p.test(text)).map(p => `${f}: ${p}`) })
if (hits.length) { console.error('Browser bundle contains server-only material:\n' + hits.join('\n')); process.exit(1) }
console.log(`Bundle check passed: ${files.length} file(s), no credentials or direct API calls.`)
