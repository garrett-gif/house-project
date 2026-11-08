import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { PROPOSE_PATH } from '../src/chat/protocol'
import { DEFAULT_MODEL, parseRequest, proposeEdits } from './proposeEdits'

// The API key lives only here, in server/.env or the shell environment. Browser code never sees it.
try { process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '.env')) } catch { /* optional */ }

const PORT = Number(process.env.HOUSE_API_PORT ?? 8787)
const MODEL = process.env.HOUSE_MODEL?.trim() || DEFAULT_MODEL
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

let client: Anthropic | undefined
const getClient = () => (client ??= new Anthropic())

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))

// Local only: refuse requests that a web page on another site could send to this machine.
app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && !LOCAL_ORIGIN.test(origin)) return void res.status(403).json({ ok: false, error: 'Requests are only accepted from this computer.' })
  next()
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

app.listen(PORT, '127.0.0.1', () => console.log(`House Project chat server on http://127.0.0.1:${PORT} using ${MODEL}`))
