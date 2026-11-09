import type { Estate } from '../model/types'
import type { EditOp } from '../model/edits'

/** One earlier chat turn, as plain text. */
export interface ChatTurn { role: 'user' | 'assistant'; text: string }

export interface ProposeRequest { estate: Estate; request: string; history: ChatTurn[] }

/** Proposed edits are never applied by the server. The browser previews them and applies them only when asked. */
export type ProposeResponse = { ok: true; ops: EditOp[]; reply: string } | { ok: false; error: string }

export const PROPOSE_PATH = '/api/propose-edits'
export const HEALTH_PATH = '/api/health'
export const SHEETS_PATH = '/api/sheets.pdf'

/** Asks the server to draw the floor plan sheets for this estate as a PDF. */
export interface SheetsRequest { estate: Estate; revision: number }

/** What the chat server reports about itself. Never includes the key. */
export interface Health { ok: true; model: string; hasKey: boolean }
