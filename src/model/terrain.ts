import type { Building, Estate, HouseModel, Pt, Rect, Road } from './types'
import { Terrain } from './parcel'
import { bounds, center, footprintOf, ft, samplePath, toFt } from './geometry'
import { gradeAt } from './designGrade'
import { roomBoxInHouse, toWing } from './wings'

/**
 * Existing ground from the parcel's terrain. Elevations are inches above sea level. The sample parcel's terrain is
 * generated from its seed, so these are planning numbers on made-up land until a real survey replaces them.
 */
const cache = new Map<string, Terrain>()
export function terrainOf(e: Estate): Terrain {
  const key = `${e.parcel.seed}:${e.parcel.size}:${e.parcel.gridSize}`
  let t = cache.get(key)
  if (!t) { t = new Terrain(e.parcel); cache.set(key, t) }
  return t
}

export const groundAt = (e: Estate, p: Pt) => terrainOf(e).at(p.x, p.y)

/** Steepest grade along a road, in percent, over steps of about 50 ft. */
export function roadGrade(e: Estate, r: Road): { pct: number; at: Pt } {
  const pts = samplePath(r.points, ft(50))
  let pct = 0, at = pts[0]
  for (let i = 1; i < pts.length; i++) {
    const run = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (run < ft(10)) continue
    const g = Math.abs(groundAt(e, pts[i]) - groundAt(e, pts[i - 1])) / run * 100
    if (g > pct) { pct = g; at = pts[i] }
  }
  return { pct, at }
}

/** How much the ground falls across a rectangle: highest minus lowest corner or center, and that over the diagonal. */
export function siteSlope(e: Estate, r: Rect) {
  const pts = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.d }, { x: r.x + r.w, y: r.y + r.d }, center(r)]
  const hs = pts.map(p => groundAt(e, p))
  const fall = Math.max(...hs) - Math.min(...hs)
  return { fall, pct: fall / Math.max(1, Math.hypot(r.w, r.d)) * 100, low: Math.min(...hs), high: Math.max(...hs) }
}

/** The house datum: the main floor (elevation 0) is set at existing ground at the middle of the house's footprint. */
export function houseDatum(e: Estate, house: HouseModel) {
  const rooms = house.levels.flatMap(l => l.rooms).filter(r => r.type !== 'outdoor')
  const c = center(bounds(rooms.map(r => roomBoxInHouse(house, r))))
  return groundAt(e, { x: house.origin.x + c.x, y: house.origin.y + c.y })
}

/** Existing ground at a house-local point, in inches relative to the house's main floor. */
export const existingGrade = (e: Estate, house: HouseModel, x: number, y: number) =>
  groundAt(e, { x: house.origin.x + x, y: house.origin.y + y }) - houseDatum(e, house)

/**
 * Rough earthwork for a house, in cubic yards: the designed grade (`gradeAt`) against existing ground over the
 * house and 30 ft around it, on a 5 ft grid. Under rooms, the design is their lowest floor, so a walkout level is
 * dug out. A planning estimate; it leaves out footings, overdig, and swell.
 */
export function earthwork(e: Estate, house: HouseModel) {
  const rooms = house.levels.flatMap(l => l.rooms.filter(r => r.type !== 'outdoor').map(r => ({ r, z: l.elevation })))
  const box = bounds(rooms.map(x => roomBoxInHouse(house, x.r)))
  const step = ft(5), pad = ft(30)
  let cut = 0, fill = 0
  for (let x = box.x - pad; x < box.x + box.w + pad; x += step) for (let y = box.y - pad; y < box.y + box.d + pad; y += step) {
    const px = x + step / 2, py = y + step / 2
    const under = rooms.filter(({ r }) => { const q = toWing(house, r.wingId, { x: px, y: py }); return q.x > r.rect.x && q.x < r.rect.x + r.rect.w && q.y > r.rect.y && q.y < r.rect.y + r.rect.d })
    const design = under.length ? Math.min(...under.map(u => u.z)) : gradeAt(house, px, py)
    const diff = existingGrade(e, house, px, py) - design
    if (diff > 0) cut += diff * step * step; else fill -= diff * step * step
  }
  const cy = 46656 // cubic inches in a cubic yard
  return { cutCy: cut / cy, fillCy: fill / cy }
}

/** Elevation of a building's lowest floor above sea level: ground at its middle, less any levels below grade. */
export function lowestFloor(e: Estate, b: Building, house?: HouseModel) {
  if (house) return houseDatum(e, house) + Math.min(0, ...house.levels.map(l => l.elevation))
  return groundAt(e, center(bounds(footprintOf(b))))
}

/**
 * Contour lines every `interval` feet, traced across the terrain grid (marching squares). Each segment is a pair of
 * site points; `major` marks every fifth line.
 */
export function contours(e: Estate, intervalFt = 10): { level: number; major: boolean; segs: [Pt, Pt][] }[] {
  const t = terrainOf(e), n = t.n, count = n + 1, cell = t.size / n
  const h = (i: number, j: number) => toFt(t.heights[j * count + i])
  let lo = Infinity, hi = -Infinity
  for (const v of t.heights) { lo = Math.min(lo, toFt(v)); hi = Math.max(hi, toFt(v)) }
  const out: { level: number; major: boolean; segs: [Pt, Pt][] }[] = []
  for (let level = Math.ceil(lo / intervalFt) * intervalFt; level <= hi; level += intervalFt) {
    const segs: [Pt, Pt][] = []
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] as const
      const v = c.map(([a, b]) => h(a, b))
      const cross: Pt[] = []
      for (let k = 0; k < 4; k++) {
        const a = v[k], b = v[(k + 1) % 4]
        if ((a < level) === (b < level)) continue
        const f = (level - a) / (b - a)
        const [x0, y0] = c[k], [x1, y1] = c[(k + 1) % 4]
        cross.push({ x: (x0 + (x1 - x0) * f) * cell, y: (y0 + (y1 - y0) * f) * cell })
      }
      if (cross.length === 2) segs.push([cross[0], cross[1]])
      else if (cross.length === 4) segs.push([cross[0], cross[1]], [cross[2], cross[3]])
    }
    out.push({ level, major: level % (intervalFt * 5) === 0, segs })
  }
  return out
}
