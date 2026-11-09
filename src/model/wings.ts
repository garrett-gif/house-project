import type { HouseModel, Pt, Rect, Room, Wing } from './types'
import { bounds } from './geometry'

/**
 * Wings let a house bend. Each wing is a frame turned `angle` degrees (counterclockwise, seen from above) about its
 * `pivot`, a house-local point. Rooms in a wing keep plain rectangles in the wing's own coordinates, so walls, doors,
 * furniture, and checks work inside a wing exactly as they do for the rest of the house. Only drawings, 3D, and the
 * building's outline on the site turn them. Rooms without a wing are in the house's own frame.
 *
 * Rooms in different frames never share walls. Where a wing meets the rest of the house, an opening on each side
 * names the room beyond (`Opening.through`), so people can walk through the joint.
 */
export const wingById = (house: HouseModel, id?: string): Wing | undefined => id ? house.wings?.find(w => w.id === id) : undefined

/** A frame key for grouping: '' for the house's own frame. */
export const frameOf = (x: { wingId?: string }) => x.wingId ?? ''
export const sameFrame = (a: { wingId?: string }, b: { wingId?: string }) => frameOf(a) === frameOf(b)

/** A point from a wing's coordinates into the house's. */
export function toHouse(house: HouseModel, wingId: string | undefined, p: Pt): Pt {
  const w = wingById(house, wingId)
  if (!w) return p
  const a = w.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  return { x: w.pivot.x + p.x * c - p.y * s, y: w.pivot.y + p.x * s + p.y * c }
}

/** A point from the house's coordinates into a wing's. */
export function toWing(house: HouseModel, wingId: string | undefined, p: Pt): Pt {
  const w = wingById(house, wingId)
  if (!w) return p
  const a = -w.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  const dx = p.x - w.pivot.x, dy = p.y - w.pivot.y
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}

/** The corners of a rectangle in a frame, in house coordinates, counterclockwise from the southwest. */
export function cornersInHouse(house: HouseModel, wingId: string | undefined, r: Rect): Pt[] {
  return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.d }, { x: r.x, y: r.y + r.d }].map(p => toHouse(house, wingId, p))
}

/** The axis-aligned box around a room, in house coordinates. Exact for rooms without a wing. */
export function roomBoxInHouse(house: HouseModel, room: Room): Rect {
  if (!room.wingId) return room.rect
  return bounds(cornersInHouse(house, room.wingId, room.rect).map(p => ({ x: p.x, y: p.y, w: 0, d: 0 })))
}

/** The angle of a frame, in degrees. */
export const angleOf = (house: HouseModel, wingId?: string) => wingById(house, wingId)?.angle ?? 0

const SIDE_VEC = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] } as const
/** The compass side a wing's side faces most nearly, in the house's frame. */
export function sideInHouse(house: HouseModel, wingId: string | undefined, side: 'n' | 's' | 'e' | 'w'): 'n' | 's' | 'e' | 'w' {
  const a = angleOf(house, wingId) * Math.PI / 180
  if (!a) return side
  const [x, y] = SIDE_VEC[side], rx = x * Math.cos(a) - y * Math.sin(a), ry = x * Math.sin(a) + y * Math.cos(a)
  return Math.abs(rx) > Math.abs(ry) ? (rx > 0 ? 'e' : 'w') : (ry > 0 ? 'n' : 's')
}

/**
 * Square feet where two rooms in different frames cover the same ground, sampled on a 1 ft grid over the first room.
 * Where a turned wing meets the rest of the house, the corners cross in a small wedge; callers allow for that.
 */
export function crossFrameOverlapSqFt(house: HouseModel, a: Room, b: Room): number {
  const step = 12
  let n = 0
  for (let x = a.rect.x + step / 2; x < a.rect.x + a.rect.w; x += step) for (let y = a.rect.y + step / 2; y < a.rect.y + a.rect.d; y += step) {
    const q = toWing(house, b.wingId, toHouse(house, a.wingId, { x, y }))
    if (q.x > b.rect.x && q.x < b.rect.x + b.rect.w && q.y > b.rect.y && q.y < b.rect.y + b.rect.d) n++
  }
  return n
}

/** Overlap allowed at a wing joint: the wedge where a turned room's corner crosses its neighbor. */
export const JOINT_WEDGE_SQFT = 40
