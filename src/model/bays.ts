import type { Check, Estate, HouseModel, Pt, Side } from './types'
import type { PlacedOpening } from './walls'
import { placeOpenings } from './walls'
import { toFt } from './geometry'

/**
 * Bays: windows that project out of an outside wall. A bay is set on a window (`Opening.bay`) and its depth is
 * measured out from the wall centerline. Box bays project square; angled bays have 45 degree sides, so the front is
 * the width less twice the depth. A bay with `seat` gets a built-in window seat at its sill. Outlines are in the
 * host room's frame (its wing's, if any), like the room.
 */
const OUT: Record<Side, [number, number]> = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }

/** The bay's outline in plan, from one end of the opening around the projection to the other. */
export function bayOutline(o: PlacedOpening): Pt[] {
  if (!o.bay) return []
  const [ox, oy] = OUT[o.side], d = o.bay.depth
  const at = (along: number, out: number): Pt => o.orientation === 'h' ? { x: along, y: o.at + oy * out } : { x: o.at + ox * out, y: along }
  if (o.bay.form === 'box') return [at(o.from, 0), at(o.from, d), at(o.to, d), at(o.to, 0)]
  return [at(o.from, 0), at(o.from + d, d), at(o.to - d, d), at(o.to, 0)]
}

/** Seat depth and height for a window seat. */
export const SEAT = { depth: 20, height: 18 }

/** Bays in a house with where they sit. */
export const placedBays = (house: HouseModel) => placeOpenings(house).filter(o => o.bay && !o.problem && o.wall)

/** Whether a point is inside a polygon. */
function inPoly(pts: Pt[], x: number, y: number) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/**
 * Bay checks, per house: bays are windows on outside walls, angled bays are wide enough for their sides, depths
 * are 1 to 4 ft, and the projection stays clear of other rooms on the floor. Warnings: planning values only.
 */
export function bayChecks(e: Estate): Check[] {
  const house = e.house
  const all = placeOpenings(house).filter(o => o.bay)
  const issues: string[] = [], ids: string[] = []
  const flag = (o: PlacedOpening, why: string) => { issues.push(`${o.id}: ${why}`); ids.push(o.id) }
  for (const o of all) {
    const b = o.bay!
    if (o.kind !== 'window') { flag(o, 'only windows can be bays'); continue }
    if (o.problem || !o.wall) continue // The openings check already reports it.
    if (o.leadsTo !== 'outside') { flag(o, 'a bay must be on an outside wall'); continue }
    if (b.depth < 12 || b.depth > 48) flag(o, `${toFt(b.depth)} ft deep; bays here are 1 to 4 ft`)
    if (b.form === 'angled' && o.width < 2 * b.depth + 24) flag(o, 'too narrow for 45 degree sides; widen it or use a box bay')
    const outline = bayOutline(o)
    const room = house.levels.flatMap(l => l.rooms).find(r => r.id === o.roomId)
    const level = house.levels.find(l => l.id === o.levelId)
    const hit = level?.rooms.find(r => r.id !== o.roomId && (r.wingId ?? '') === (room?.wingId ?? '') && r.type !== 'outdoor'
      && sample(outline).some(p => p.x > r.rect.x && p.x < r.rect.x + r.rect.w && p.y > r.rect.y && p.y < r.rect.y + r.rect.d))
    if (hit) flag(o, `it projects into ${hit.name}`)
  }
  return [issues.length
    ? { id: 'bays', label: 'Bays project from outside walls into the clear', status: 'warn', detail: `${issues.join('; ')}. Planning values; not a code review.`, elements: ids }
    : { id: 'bays', label: 'Bays project from outside walls into the clear', status: 'pass', detail: `${all.length} bays. Planning values; not a code review.` }]
}

/** Points on a 6 in grid inside a bay outline, a little in from the wall. */
function sample(pts: Pt[]): Pt[] {
  if (!pts.length) return []
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), out: Pt[] = []
  for (let x = Math.min(...xs) + 3; x < Math.max(...xs); x += 6) for (let y = Math.min(...ys) + 3; y < Math.max(...ys); y += 6) if (inPoly(pts, x, y)) out.push({ x, y })
  return out
}
