import type { Check, Estate } from './types'
import type { EditOp } from './edits'
import { applyOperations } from './edits'
import { validateEstate } from './validate'

/** One saved change: who made it, the edits, and the results of this app's checks afterward. */
export interface Revision {
  id: number
  author: 'owner' | 'claude'
  request?: string
  ops: EditOp[]
  checks: Check[]
  timestamp: string
}

/**
 * Every state the estate has been in. `states[i + 1]` is `states[i]` after `revisions[i]`.
 * `index` is the state on screen; anything after it can be redone until a new change is committed.
 */
export interface Timeline { states: Estate[]; revisions: Revision[]; index: number }

export const startTimeline = (estate: Estate): Timeline => ({ states: [estate], revisions: [], index: 0 })
export const currentEstate = (t: Timeline) => t.states[t.index]
export const canUndo = (t: Timeline) => t.index > 0
export const canRedo = (t: Timeline) => t.index < t.states.length - 1
export const undo = (t: Timeline): Timeline => canUndo(t) ? { ...t, index: t.index - 1 } : t
export const redo = (t: Timeline): Timeline => canRedo(t) ? { ...t, index: t.index + 1 } : t
/** Revisions that produced the state on screen, oldest first. */
export const appliedRevisions = (t: Timeline) => t.revisions.slice(0, t.index)

export type CommitResult = { ok: true; timeline: Timeline } | { ok: false; error: string }

/** Applies a group of edits as one undo step. Redo history past the current state is dropped. */
export function commit(t: Timeline, ops: EditOp[], author: Revision['author'], request?: string, now = new Date()): CommitResult {
  if (ops.length === 0) return { ok: false, error: 'There are no edits to apply.' }
  const result = applyOperations(currentEstate(t), ops)
  if (!result.ok) return result
  const revision: Revision = {
    id: (t.revisions[t.index - 1]?.id ?? 0) + 1,
    author, request, ops,
    checks: validateEstate(result.estate),
    timestamp: now.toISOString(),
  }
  return {
    ok: true,
    timeline: {
      states: [...t.states.slice(0, t.index + 1), result.estate],
      revisions: [...t.revisions.slice(0, t.index), revision],
      index: t.index + 1,
    },
  }
}

/**
 * A saved project keeps the starting estate and every revision, including undone ones, so it can be replayed
 * exactly and redo still works after reopening. `index` is how many revisions are applied.
 */
export interface SavedProject { format: 'house-project'; version: 1; base: Estate; revisions: Revision[]; index: number }

export const saveProject = (t: Timeline): SavedProject =>
  ({ format: 'house-project', version: 1, base: t.states[0], revisions: t.revisions, index: t.index })

export function loadProject(data: unknown): CommitResult {
  const p = data as Partial<SavedProject> | null
  if (!p || p.format !== 'house-project' || p.version !== 1 || !p.base || !Array.isArray(p.revisions)) {
    return { ok: false, error: 'This file is not a saved House Project.' }
  }
  let t = startTimeline(p.base)
  for (const r of p.revisions) {
    const next = commit(t, r.ops, r.author, r.request, new Date(r.timestamp))
    if (!next.ok) return { ok: false, error: `Revision ${r.id} no longer applies: ${next.error}` }
    t = next.timeline
  }
  const index = typeof p.index === 'number' ? Math.max(0, Math.min(Math.trunc(p.index), t.revisions.length)) : t.revisions.length
  return { ok: true, timeline: { ...t, index } }
}
