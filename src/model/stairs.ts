import type { HouseModel, Inches, Rect, Stair } from './types'
import { PLANNING_VALUES } from './wallChecks'

/**
 * Stair geometry, derived from a stair (`house.stairs`) and the two levels it joins, so plans, sheets, the DXF, and 3D
 * all draw the same treads. A straight stair is one flight along the room's long side. A U-shaped stair climbs one
 * lane, turns on a landing across the far end, and climbs back up the other lane. Rects are in the stair room's frame
 * (its wing's, if any); heights are above the lower floor.
 */
export interface Tread { rect: Rect; top: Inches; index: number }
export interface StairGeometry { treads: Tread[]; landing?: { rect: Rect; top: Inches }; risers: number; riser: Inches; up: 'n' | 's' | 'e' | 'w'; wingId?: string }

/** Wall half-thickness kept clear inside the stair room. */
const INSIDE = 3

export function stairGeometry(house: HouseModel, s: Stair): StairGeometry | null {
  const rooms = house.levels.flatMap(l => l.rooms.map(r => ({ r, l })))
  const from = rooms.find(x => x.r.id === s.roomId), to = rooms.find(x => x.r.id === s.toRoomId)
  if (!from || !to) return null
  const rise = to.l.elevation - from.l.elevation
  if (rise <= 0) return null
  const risers = Math.ceil(rise / PLANNING_VALUES.maxRiser), riser = rise / risers, count = risers - 1
  const { x, y, w, d } = from.r.rect
  const R = { x: x + INSIDE, y: y + INSIDE, w: w - 2 * INSIDE, d: d - 2 * INSIDE }
  const alongX = R.w >= R.d
  // A rect from "along" a0..a1 and "across" c0..c1, in the room's long and short directions.
  const box = (a0: number, a1: number, c0: number, c1: number): Rect => alongX
    ? { x: R.x + a0, y: R.y + c0, w: a1 - a0, d: c1 - c0 }
    : { x: R.x + c0, y: R.y + a0, w: c1 - c0, d: a1 - a0 }
  const width = Math.min(s.width, s.shape === 'u-shaped' ? (alongX ? R.d : R.w) / 2 : alongX ? R.d : R.w)
  const treads: Tread[] = []
  if (s.shape === 'straight') {
    for (let i = 0; i < count; i++) treads.push({ rect: box(i * s.tread, (i + 1) * s.tread, 0, width), top: (i + 1) * riser, index: i })
    return { treads, risers, riser, up: alongX ? 'e' : 'n', wingId: from.r.wingId }
  }
  // U-shaped: up the first lane, a landing across the far end, back up the second lane. The landing counts as a tread,
  // so the last tread is one riser below the upper floor.
  const n1 = Math.ceil((count - 1) / 2), n2 = count - 1 - n1
  const runEnd = n1 * s.tread
  for (let i = 0; i < n1; i++) treads.push({ rect: box(i * s.tread, (i + 1) * s.tread, 0, width), top: (i + 1) * riser, index: i })
  const landing = { rect: box(runEnd, runEnd + width, 0, 2 * width), top: (n1 + 1) * riser }
  for (let j = 0; j < n2; j++) {
    const a1 = runEnd - j * s.tread
    treads.push({ rect: box(a1 - s.tread, a1, width, 2 * width), top: (n1 + 2 + j) * riser, index: n1 + 1 + j })
  }
  return { treads, landing, risers, riser, up: alongX ? 'e' : 'n', wingId: from.r.wingId }
}
