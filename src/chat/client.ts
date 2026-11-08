import type { ChatTurn, ProposeResponse } from './protocol'
import { PROPOSE_PATH } from './protocol'
import type { Estate } from '../model/types'

/** Asks the local server for proposed edits. The browser never sees an API key; the server holds it. */
export async function requestEdits(estate: Estate, request: string, history: ChatTurn[], signal?: AbortSignal): Promise<ProposeResponse> {
  try {
    const res = await fetch(PROPOSE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estate, request, history }),
      signal,
    })
    const body = await res.json().catch(() => null) as ProposeResponse | null
    if (body && typeof body === 'object' && 'ok' in body) return body
    return { ok: false, error: `The chat server answered with status ${res.status}.` }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { ok: false, error: 'Cancelled.' }
    return { ok: false, error: 'Could not reach the chat server. Start it with npm run dev.' }
  }
}
