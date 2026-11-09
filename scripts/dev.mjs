// Runs the Vite dev server and the local chat server together. Ctrl+C stops both, including their child processes.
import { spawn, spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
const run = (name, command) => {
  // Fixed command strings with no user input, so running them through the shell is safe and works on Windows.
  const child = spawn(command, { stdio: 'inherit', shell: true, detached: !isWindows })
  child.on('exit', code => { console.log(`[${name}] exited${code ? ` with code ${code}` : ''}`); stop() })
  return child
}
const children = [run('web', 'npx vite'), run('api', 'npx tsx watch server/index.ts')]

/** Kills a child and everything it started. On Windows a plain kill leaves node grandchildren running. */
function killTree(child) {
  if (child.exitCode !== null || !child.pid) return
  if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill() }
}
let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  children.forEach(killTree)
  setTimeout(() => process.exit(0), 300)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('SIGHUP', stop)
