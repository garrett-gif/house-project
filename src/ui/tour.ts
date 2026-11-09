import type { Estate, HouseModel } from '../model/types'
import { toFt } from '../model/geometry'
import { levelWalls, placeOpenings } from '../model/walls'
import { toHouse, toWing } from '../model/wings'
import { pathLength } from '../model/geometry'

/** A camera stop on the flyover: where the camera is and what it looks at, in site feet, z above the ground. */
export interface Keyframe { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number }

/**
 * A scripted flight: in over the estate gate, up the drive toward the house, a slow circle around it, then out over
 * the compound to the airstrip. Built from the model, so it follows the house and roads wherever they are.
 */
export function flyoverKeyframes(e: Estate): Keyframe[] {
  const house = e.buildings.find(b => b.id === e.house.buildingId)
  const hx = house ? toFt(house.rect.x + house.rect.w / 2) : toFt(e.parcel.size) / 2
  const hy = house ? toFt(house.rect.y + house.rect.d / 2) : toFt(e.parcel.size) / 2
  const drive = e.roads.find(r => r.gate && r.kind === 'estate') ?? e.roads.find(r => r.gate)
  const along = (f: number) => {
    if (!drive) return { x: hx, y: hy - 2000 }
    const total = pathLength(drive.points)
    let walked = 0
    for (let i = 0; i < drive.points.length - 1; i++) {
      const a = drive.points[i], b = drive.points[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y)
      if (walked + len >= f * total) { const t = (f * total - walked) / (len || 1); return { x: toFt(a.x + (b.x - a.x) * t), y: toFt(a.y + (b.y - a.y) * t) } }
      walked += len
    }
    const last = drive.points[drive.points.length - 1]
    return { x: toFt(last.x), y: toFt(last.y) }
  }
  const at = (p: { x: number; y: number }, z: number, look = { x: hx, y: hy }, lookZ = 20): Keyframe => ({ x: p.x, y: p.y, z, lookX: look.x, lookY: look.y, lookZ })
  const ring = (deg: number, r: number, z: number) => at({ x: hx + r * Math.cos(deg * Math.PI / 180), y: hy + r * Math.sin(deg * Math.PI / 180) }, z)
  const compound = e.zones.find(z => z.kind === 'operations')
  const cx = compound ? toFt(compound.rect.x + compound.rect.w / 2) : hx, cy = compound ? toFt(compound.rect.y + compound.rect.d / 2) : hy
  const rw = e.runway.rect
  return [
    at(along(0), 700, along(0.35), 0),
    at(along(0.35), 450),
    at(along(0.7), 320),
    ring(-90, 650, 220),
    ring(-20, 520, 180),
    ring(60, 520, 200),
    ring(150, 560, 220),
    ring(220, 650, 300),
    at({ x: (hx + cx) / 2, y: (hy + cy) / 2 }, 1400, { x: cx, y: cy }, 0),
    at({ x: cx - 800, y: cy - 900 }, 900, { x: cx, y: cy }, 0),
    at({ x: toFt(rw.x + rw.w / 2) - 600, y: toFt(rw.y) - 600 }, 500, { x: toFt(rw.x + rw.w / 2), y: toFt(rw.y + rw.d) }, 0),
  ]
}

/** Where a walkthrough starts on a level: inside the front door if it has one, else in a hall, else the first room. */
export function walkStart(house: HouseModel, levelId: string): { x: number; y: number } {
  const level = house.levels.find(l => l.id === levelId) ?? house.levels[0]
  const entry = placeOpenings(house).find(o => o.levelId === level.id && o.kind === 'door' && o.leadsTo === 'outside' && level.rooms.find(r => r.id === o.roomId)?.type === 'circulation')
  const room = (entry && level.rooms.find(r => r.id === entry.roomId)) ?? level.rooms.find(r => r.type === 'circulation') ?? level.rooms[0]
  return toHouse(house, room.wingId, { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.d / 2 })
}

/**
 * Whether a person of the given radius can stand at (x, y), house-local inches, on a level: not inside any wall,
 * except where a door, cased opening, or garage door makes a gap wide enough to pass.
 */
export function canStand(house: HouseModel, levelId: string, x: number, y: number, radius = 9) {
  const level = house.levels.find(l => l.id === levelId)
  if (!level) return true
  const gaps = placeOpenings(house).filter(o => o.levelId === levelId && o.wall && !o.problem && o.kind !== 'window')
  for (const s of levelWalls(house, level)) {
    // Walls in a wing are tested in the wing's own frame.
    const p = toWing(house, s.wingId, { x, y })
    const across = s.orientation === 'h' ? p.y : p.x, along = s.orientation === 'h' ? p.x : p.y
    if (Math.abs(across - s.at) > s.thickness / 2 + radius) continue
    if (along < s.from - radius || along > s.to + radius) continue
    const through = gaps.some(o => o.wall!.id === s.id && along > o.from + radius * 0.5 && along < o.to - radius * 0.5)
    if (!through) return false
  }
  return true
}

/** One step of walking: take the whole step if clear, otherwise slide along whichever wall is in the way. */
export function step(house: HouseModel, levelId: string, from: { x: number; y: number }, dx: number, dy: number) {
  const tries = [{ x: from.x + dx, y: from.y + dy }, { x: from.x + dx, y: from.y }, { x: from.x, y: from.y + dy }]
  return tries.find(p => canStand(house, levelId, p.x, p.y)) ?? from
}
