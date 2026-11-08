import type { Estate } from '../model/types'
import type { EditOp } from '../model/edits'

/** One earlier chat turn, as plain text. */
export interface ChatTurn { role: 'user' | 'assistant'; text: string }

export interface ProposeRequest { estate: Estate; request: string; history: ChatTurn[] }

/** Proposed edits are never applied by the server. The browser previews them and applies them only when asked. */
export type ProposeResponse = { ok: true; ops: EditOp[]; reply: string } | { ok: false; error: string }

export const PROPOSE_PATH = '/api/propose-edits'
