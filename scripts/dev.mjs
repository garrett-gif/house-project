// Runs the Vite dev server and the local chat server together. Ctrl+C stops both.
import { spawn } from 'node:child_process'

const run = (name, args) => {
  // One fixed command string (no user input), so running it through the shell is safe and works on Windows.
  const child = spawn(`npx ${args.join(' ')}`, { stdio: 'inherit', shell: true })
  child.on('exit', code => { console.log(`[${name}] exited${code ? ` with code ${code}` : ''}`); stop() })
  return child
}
const children = [run('web', ['vite']), run('api', ['tsx', 'watch', 'server/index.ts'])]
let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  for (const c of children) if (c.exitCode === null) c.kill()
  setTimeout(() => process.exit(0), 300)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
