import type { HouseModel, Rect, Room, Side } from './types'
import { gradeAt } from './designGrade'

/**
 * Architectural pieces derived from the rooms and roofs, for every building: timber posts along the open edges of
 * covered porches, loggias, and canopies, and 42 in railings along the open edges of decks and porches that sit well
 * above the ground. Drawn on plans, sheets, and in 3D; not stored. Inches, in the room's frame.
 */
export interface Post { roomId: string; x: number; y: number; size: number; h: number; z: number; wingId?: string }
export interface Railing { roomId: string; x1: number; y1: number; x2: number; y2: number; h: number; z: number; wingId?: string }

/** Posts are 8 in square timbers, no more than 12 ft apart. */
const POST = 8, SPACING = 12 * 12
/** A floor more than 30 in above the ground below it needs a guard, as a planning value. */
const GUARD_DROP = 30, RAIL = 42

type Edge = { side: Side; x1: number; y1: number; x2: number; y2: number }
const edges = (r: Rect): Edge[] => [
  { side: 's', x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y },
  { side: 'n', x1: r.x, y1: r.y + r.d, x2: r.x + r.w, y2: r.y + r.d },
  { side: 'w', x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.d },
  { side: 'e', x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.d },
]

/** The parts of an outdoor room's edge that no enclosed room on the same level touches: its open sides. */
function openRuns(room: Room, others: Room[]): Edge[] {
  const out: Edge[] = []
  for (const e of edges(room.rect)) {
    const h = e.y1 === e.y2
    const at = h ? e.y1 : e.x1, a0 = h ? e.x1 : e.y1, a1 = h ? e.x2 : e.y2
    // Covered stretches along this edge by enclosed rooms in the same frame.
    const covered = others.filter(o => o.type !== 'outdoor' && (o.wingId ?? '') === (room.wingId ?? '')).flatMap(o => {
      const r = o.rect
      if (h && (Math.abs(r.y - at) < 1 || Math.abs(r.y + r.d - at) < 1)) return [[Math.max(a0, r.x), Math.min(a1, r.x + r.w)]]
      if (!h && (Math.abs(r.x - at) < 1 || Math.abs(r.x + r.w - at) < 1)) return [[Math.max(a0, r.y), Math.min(a1, r.y + r.d)]]
      return []
    }).filter(([s, t]) => t - s > 1).sort((p, q) => p[0] - q[0])
    let cur = a0
    for (const [s, t] of covered) { if (s - cur > 12) out.push(run(e.side, h, at, cur, s)); cur = Math.max(cur, t) }
    if (a1 - cur > 12) out.push(run(e.side, h, at, cur, a1))
  }
  return out
}
const run = (side: Side, h: boolean, at: number, s: number, t: number): Edge => h ? { side, x1: s, y1: at, x2: t, y2: at } : { side, x1: at, y1: s, x2: at, y2: t }

/** Whether a roof covers most of an outdoor room. */
function covered(house: HouseModel, room: Room) {
  const r = room.rect
  return house.roofs.some(f => (f.wingId ?? '') === (room.wingId ?? '') && f.rect.x <= r.x + r.w / 2 && r.x + r.w / 2 <= f.rect.x + f.rect.w && f.rect.y <= r.y + r.d / 2 && r.y + r.d / 2 <= f.rect.y + f.rect.d)
}

export function porchPosts(house: HouseModel): Post[] {
  const out: Post[] = []
  for (const level of house.levels) {
    for (const room of level.rooms.filter(r => r.type === 'outdoor' && covered(house, r))) {
      for (const e of openRuns(room, level.rooms)) {
        const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1), n = Math.max(1, Math.ceil(len / SPACING))
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = e.x1 + (e.x2 - e.x1) * t, y = e.y1 + (e.y2 - e.y1) * t
          if (out.some(p => p.roomId === room.id && Math.hypot(p.x - x, p.y - y) < 6)) continue
          out.push({ roomId: room.id, x, y, size: POST, h: level.floorHeight, z: level.elevation, ...(room.wingId ? { wingId: room.wingId } : {}) })
        }
      }
    }
  }
  return out
}

export function railings(house: HouseModel): Railing[] {
  const out: Railing[] = []
  for (const level of house.levels) {
    for (const room of level.rooms.filter(r => r.type === 'outdoor')) {
      for (const e of openRuns(room, level.rooms)) {
        // The ground under the middle of the edge, a little outside it, against this floor.
        const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2
        const [ox, oy] = e.side === 'n' ? [0, 24] : e.side === 's' ? [0, -24] : e.side === 'e' ? [24, 0] : [-24, 0]
        const drop = level.elevation - (room.wingId ? 0 : gradeAt(house, mx + ox, my + oy))
        if (drop <= GUARD_DROP && level.elevation <= GUARD_DROP) continue
        out.push({ roomId: room.id, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, h: RAIL, z: level.elevation, ...(room.wingId ? { wingId: room.wingId } : {}) })
      }
    }
  }
  return out
}
