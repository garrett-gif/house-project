import type { HouseModel, Rect, Side } from './types'
import { placeOpenings } from './walls'
import { gradeAt } from './designGrade'
import { houseBounds } from './derive'
import { toHouse } from './wings'

/**
 * The outdoors around a building, derived from its doors, walls, and outdoor rooms so it follows the design: a path
 * from every outside door, a drive apron at every overhead door, planting beds along the foundations, trees around the
 * yard, a lit sconce beside every outside door, and a fire pit in any outdoor room that names one. Everything is in
 * house-local inches in the house's frame, with z on the designed grade. Drawn, not stored.
 */
export interface Paving { kind: 'path' | 'apron'; rect: Rect; z: number }
export interface Planting { kind: 'shrub' | 'tree'; x: number; y: number; r: number; h: number; z: number }
export interface Fixture { kind: 'sconce' | 'fire-pit'; x: number; y: number; z: number; r: number }
export interface Landscape { paving: Paving[]; plants: Planting[]; fixtures: Fixture[] }

const OUT: Record<Side, [number, number]> = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }
const PATH_W = 48, PATH_LEN = 16 * 12, APRON = 24 * 12
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

/** A rect from a point on a wall outward: `along` wide, `out` deep, in the house's frame. */
function outward(x: number, y: number, side: Side, along: number, out: number): Rect {
  const [ox, oy] = OUT[side]
  return ox === 0
    ? { x: x - along / 2, y: oy > 0 ? y : y - out, w: along, d: out }
    : { x: ox > 0 ? x : x - out, y: y - along / 2, w: out, d: along }
}

export function landscape(house: HouseModel): Landscape {
  const rooms = house.levels.flatMap(l => l.rooms)
  const solid = rooms.filter(r => r.type !== 'outdoor').map(r => ({ r, box: boxOf(house, r.wingId, r.rect) }))
  const outdoor = rooms.filter(r => r.type === 'outdoor').map(r => boxOf(house, r.wingId, r.rect))
  const paving: Paving[] = [], plants: Planting[] = [], fixtures: Fixture[] = []
  const g = (x: number, y: number) => gradeAt(house, x, y)

  // Paths and aprons from every outside door at grade; sconces beside the doors.
  for (const o of placeOpenings(house).filter(o => !o.problem && o.wall && o.leadsTo === 'outside' && o.kind !== 'window' && o.kind !== 'opening')) {
    const level = house.levels.find(l => l.id === o.levelId)!
    const mid = (o.from + o.to) / 2
    const p = toHouse(house, o.wall!.wingId, o.orientation === 'h' ? { x: mid, y: o.at } : { x: o.at, y: mid })
    if (Math.abs(g(p.x + OUT[o.side][0] * 24, p.y + OUT[o.side][1] * 24) - level.elevation) > 24) continue // An upper door onto a deck.
    const apron = o.kind === 'garage-door'
    // A lit sconce each side of every people door, porch or not.
    if (!apron) for (const k of [-1, 1]) {
      const along = (o.orientation === 'h' ? [1, 0] : [0, 1]) as [number, number]
      fixtures.push({ kind: 'sconce', x: p.x + along[0] * k * (o.width / 2 + 10) + OUT[o.side][0] * 6, y: p.y + along[1] * k * (o.width / 2 + 10) + OUT[o.side][1] * 6, z: level.elevation + 84, r: 4 })
    }
    const rect = outward(p.x, p.y, o.side, apron ? o.width + 24 : PATH_W, apron ? APRON : PATH_LEN)
    if (outdoor.some(b => hits(b, shrink(rect, 2)))) continue // It opens onto a porch or terrace instead.
    paving.push({ kind: apron ? 'apron' : 'path', rect, z: level.elevation })
  }

  // Planting beds: shrubs every 5 ft along outside walls at grade, clear of paving, porches, and other rooms.
  const ground = house.levels.filter(l => Math.abs(l.elevation) < 12 * 12 && l.elevation <= 0)
  for (const level of ground) {
    for (const r of level.rooms.filter(x => x.type !== 'outdoor')) {
      const box = boxOf(house, r.wingId, r.rect)
      for (const [side, x0, y0, x1, y1] of [['s', box.x, box.y, box.x + box.w, box.y], ['n', box.x, box.y + box.d, box.x + box.w, box.y + box.d], ['w', box.x, box.y, box.x, box.y + box.d], ['e', box.x + box.w, box.y, box.x + box.w, box.y + box.d]] as [Side, number, number, number, number][]) {
        const len = Math.hypot(x1 - x0, y1 - y0)
        for (let t = 30; t < len - 30; t += 60) {
          const x = x0 + (x1 - x0) * t / len + OUT[side][0] * 30, y = y0 + (y1 - y0) * t / len + OUT[side][1] * 30
          const spot = { x: x - 15, y: y - 15, w: 30, d: 30 }
          if (solid.some(s => hits(s.box, spot)) || outdoor.some(b => hits(b, spot)) || paving.some(p => hits(p.rect, spot))) continue
          if (Math.abs(g(x, y) - level.elevation) > 18) continue
          plants.push({ kind: 'shrub', x, y, r: 15 + ((t / 60) % 3) * 3, h: 30, z: g(x, y) })
        }
      }
    }
  }

  // Trees: a loose ring around the building, 30 to 60 ft out, clear of paving and the building.
  const b = houseBounds(house), rnd = seeded(house.buildingId.length * 7919 + Math.round(b.w))
  const cx = b.x + b.w / 2, cy = b.y + b.d / 2, rx = b.w / 2 + 45 * 12, ry = b.d / 2 + 45 * 12
  const count = Math.max(6, Math.round((b.w + b.d) / (30 * 12)))
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.4
    const x = cx + Math.cos(a) * rx * (0.85 + rnd() * 0.3), y = cy + Math.sin(a) * ry * (0.85 + rnd() * 0.3)
    const spot = { x: x - 60, y: y - 60, w: 120, d: 120 }
    if (solid.some(s => hits(s.box, spot)) || paving.some(p => hits(p.rect, spot)) || outdoor.some(o => hits(o, spot))) continue
    plants.push({ kind: 'tree', x, y, r: 60 + rnd() * 48, h: 30 * 12 + rnd() * 25 * 12, z: g(x, y) })
  }

  // A fire pit in the middle of any outdoor room that names one.
  for (const r of rooms.filter(x => x.type === 'outdoor' && /fire pit/i.test(x.name))) {
    const box = boxOf(house, r.wingId, r.rect), level = house.levels.find(l => l.rooms.includes(r))!
    fixtures.push({ kind: 'fire-pit', x: box.x + box.w / 2, y: box.y + box.d / 2, z: level.elevation, r: 36 })
  }
  return { paving, plants, fixtures }
}

const shrink = (r: Rect, by: number): Rect => ({ x: r.x + by, y: r.y + by, w: r.w - 2 * by, d: r.d - 2 * by })
function boxOf(house: HouseModel, wingId: string | undefined, r: Rect): Rect {
  if (!wingId) return r
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.d], [r.x + r.w, r.y + r.d]].map(([x, y]) => toHouse(house, wingId, { x, y }))
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) }
}
