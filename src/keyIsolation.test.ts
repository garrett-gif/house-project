import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Everything under src/ ships to the browser. None of it may touch the Anthropic SDK, a key, or server code. */
const files: string[] = []
const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p) } }
walk('src')

describe('API key stays on the server', () => {
  it.each(files)('%s', file => {
    const text = readFileSync(file, 'utf8')
    expect(text).not.toMatch(/from ['"]@anthropic-ai\/sdk['"]|import\(['"]@anthropic-ai/)
    expect(text).not.toMatch(/ANTHROPIC_API_KEY|VITE_ANTHROPIC|sk-ant-|api\.anthropic\.com|dangerouslyAllowBrowser/)
    expect(text).not.toMatch(/from ['"](\.\.\/)+server\//)
  })
})
