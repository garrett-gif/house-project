// Stops anything still listening on the app's local ports, such as a chat server left behind by a crashed dev run.
import { execFileSync } from 'node:child_process'

const PORTS = [Number(process.env.HOUSE_API_PORT ?? 8787), 5173]
const pidsOn = port => {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`], { encoding: 'utf8' })
      return [...new Set(out.split(/\s+/).filter(Boolean).map(Number))]
    }
    return execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split(/\s+/).filter(Boolean).map(Number)
  } catch { return [] }
}
let stopped = 0
for (const port of PORTS) for (const pid of pidsOn(port)) {
  if (!pid || pid === process.pid) continue
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(pid, 'SIGTERM')
    console.log(`Stopped process ${pid} on port ${port}.`)
    stopped++
  } catch { console.log(`Could not stop process ${pid} on port ${port}.`) }
}
if (!stopped) console.log(`Nothing was running on ports ${PORTS.join(' or ')}.`)
