import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { HEALTH_PATH, PROPOSE_PATH, SHEETS_PATH } from '../src/chat/protocol'
import { drawingSet } from '../src/drawings/drawingSet'
import { sheetsToPdf } from './pdf'
import type { Health } from '../src/chat/protocol'
import { DEFAULT_MODEL, isEstate, parseRequest, proposeEdits } from './proposeEdits'

// The API key lives only here, in server/.env or the shell environment. Browser code never sees it.
const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env')
const loadEnv = () => { try { process.loadEnvFile(ENV_FILE) } catch { /* optional */ } }
loadEnv()
const hasKey = () => !!process.env.ANTHROPIC_API_KEY?.trim()

const PORT = Number(process.env.HOUSE_API_PORT ?? 8787)
const MODEL = process.env.HOUSE_MODEL?.trim() || DEFAULT_MODEL
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

let client: Anthropic | undefined
/** If the key was added after the server started, pick it up instead of needing a restart. */
const getClient = () => {
  if (!client && !hasKey()) loadEnv()
  return (client ??= new Anthropic())
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))

// Local only: refuse requests that a web page on another site could send to this machine.
app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && !LOCAL_ORIGIN.test(origin)) return void res.status(403).json({ ok: false, error: 'Requests are only accepted from this computer.' })
  next()
})

app.get(HEALTH_PATH, (_req, res) => {
  if (!hasKey()) loadEnv()
  const health: Health = { ok: true, model: MODEL, hasKey: hasKey() }
  res.json(health)
})

// Draft floor plan sheets as a PDF. Drawn from the estate the browser sends; nothing is stored.
app.post(SHEETS_PATH, async (req, res) => {
  const { estate, revision } = (req.body ?? {}) as { estate?: unknown; revision?: unknown }
  if (!isEstate(estate)) return void res.status(400).json({ ok: false, error: 'The estate model is missing or malformed.' })
  try {
    const date = new Date().toISOString().slice(0, 10)
    const sheets = drawingSet(estate, { revision: Number(revision) || 0, date, projectName: estate.name })
    const pdf = await sheetsToPdf(sheets, `${estate.name}, draft drawing set`)
    res.type('application/pdf').set('Content-Disposition', `attachment; filename="house-project-${estate.house.buildingId}-drawings-${date}.pdf"`).send(pdf)
  } catch (err) {
    console.error('[sheets]', err instanceof Error ? err.message : err)
    res.status(500).json({ ok: false, error: 'Could not draw the sheets.' })
  }
})

app.post(PROPOSE_PATH, async (req, res) => {
  const parsed = parseRequest(req.body)
  if (!parsed.ok) return void res.status(400).json(parsed)
  try {
    res.json(await proposeEdits(params => getClient().beta.messages.create(params), parsed.req, MODEL))
  } catch (err) {
    const [status, error] =
      err instanceof Anthropic.AuthenticationError ? [401, 'The Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY in server/.env and restart.']
      : err instanceof Anthropic.RateLimitError ? [429, 'The Anthropic API is rate limiting requests. Wait a minute and try again.']
      : err instanceof Anthropic.APIError ? [502, `The Anthropic API returned an error${err.status ? ` (${err.status})` : ''}. Try again.`]
      : [500, err instanceof Error && /auth|api key|credential/i.test(err.message)
          ? 'No Anthropic credentials found. Set ANTHROPIC_API_KEY in server/.env and restart.'
          : 'The chat server hit an unexpected error.']
    console.error('[propose-edits]', err instanceof Error ? err.message : err)
    res.status(status).json({ ok: false, error })
  }
})

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`House Project chat server on http://127.0.0.1:${PORT} using ${MODEL}`)
  if (!hasKey()) console.log('No ANTHROPIC_API_KEY yet. Add it to server/.env; the server picks it up on the next request.')
})
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use, probably by an old chat server. Run npm run stop, then npm run dev.`)
  else console.error('Chat server failed to start:', err.message)
  process.exit(1)
})
