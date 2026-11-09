import type { ChatTurn, ProposeResponse } from './protocol'
import { HEALTH_PATH, PROPOSE_PATH, SHEETS_PATH } from './protocol'
import type { Health } from './protocol'
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

/** Asks the chat server whether it is running and has a key. Returns null when it cannot be reached. */
export async function checkServer(): Promise<Health | null> {
  try {
    const res = await fetch(HEALTH_PATH)
    const body = await res.json() as Health
    return body && body.ok ? body : null
  } catch { return null }
}

/** Asks the server for the draft floor plan PDF. Returns the file, or an error message. */
export async function requestSheetsPdf(estate: Estate, revision: number): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(SHEETS_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estate, revision }) })
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      return { ok: false, error: body?.error ?? `The server answered with status ${res.status}.` }
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'house-project-floor-plans.pdf'
    return { ok: true, blob: await res.blob(), filename: name }
  } catch {
    return { ok: false, error: 'Could not reach the server. Start it with npm run dev.' }
  }
}
