import type { HouseModel, Level, Rect, Roof } from './types'
import { mergeRects } from './geometry'
import { toHouse } from './wings'

/** A point in house-local inches: x east, y north, z up from the main floor. */
export type P3 = [number, number, number]
/** A flat polygon in 3D. Roof planes are roofing; gable walls are the wall triangles under a gable or beside a shed. */
export interface Poly3 { pts: P3[]; kind: 'roof' | 'gable'; side?: 'n' | 's' | 'e' | 'w' }

export const ROOF_FORMS = ['gable', 'hip', 'shed'] as const

const levelById = (house: HouseModel, id: string) => house.levels.find(l => l.id === id)
/** Top of the walls of a level, where its roof's eave sits. */
export const eaveHeight = (level: Level) => level.elevation + level.floorHeight

/** Ridge height for gable and hip roofs, or the high side for a shed. */
export function ridgeHeight(house: HouseModel, roof: Roof) {
  const level = levelById(house, roof.levelId)
  if (!level) return 0
  const { w, d } = roof.rect
  const run = roof.form === 'shed' ? (roof.low === 'n' || roof.low === 's' ? d : w) : (roof.ridge === 'ew' ? d : w) / 2
  return eaveHeight(level) + run * roof.pitch / 12
}

/**
 * The planes and gable walls of a roof. Overhangs extend the roofing past the walls and drop with the pitch;
 * gable walls stop at the wall line.
 */
export function roofPolygons(house: HouseModel, roof: Roof): Poly3[] {
  const polys = localRoofPolygons(house, roof)
  if (!roof.wingId) return polys
  // A wing's roof is drawn in its own frame, then turned into the house's.
  return polys.map(p => ({ ...p, pts: p.pts.map(([x, y, z]) => { const q = toHouse(house, roof.wingId, { x, y }); return [q.x, q.y, z] as P3 }) }))
}

function localRoofPolygons(house: HouseModel, roof: Roof): Poly3[] {
  const level = levelById(house, roof.levelId)
  if (!level) return []
  const e = eaveHeight(level), k = roof.pitch / 12, ov = roof.overhang
  const { x: x0, y: y0 } = roof.rect, x1 = x0 + roof.rect.w, y1 = y0 + roof.rect.d
  const lo = e - ov * k
  const top = ridgeHeight(house, roof)
  const polys: Poly3[] = []
  const roofP = (...pts: P3[]) => polys.push({ pts, kind: 'roof' })
  const gable = (...pts: P3[]) => polys.push({ pts, kind: 'gable' })

  if (roof.form === 'shed') {
    // Slopes down toward `low`. The high side gets a wall up to the roof, the two ends get wedge-shaped walls.
    const hi = top + ov * k
    switch (roof.low) {
      case 's': roofP([x0 - ov, y0 - ov, lo], [x1 + ov, y0 - ov, lo], [x1 + ov, y1 + ov, hi], [x0 - ov, y1 + ov, hi]); gable([x0, y1, e], [x1, y1, e], [x1, y1, top], [x0, y1, top]); gable([x0, y0, e], [x0, y1, e], [x0, y1, top]); gable([x1, y0, e], [x1, y1, e], [x1, y1, top]); break
      case 'n': roofP([x0 - ov, y1 + ov, lo], [x1 + ov, y1 + ov, lo], [x1 + ov, y0 - ov, hi], [x0 - ov, y0 - ov, hi]); gable([x0, y0, e], [x1, y0, e], [x1, y0, top], [x0, y0, top]); gable([x0, y0, e], [x0, y1, e], [x0, y0, top]); gable([x1, y0, e], [x1, y1, e], [x1, y0, top]); break
      case 'w': roofP([x0 - ov, y0 - ov, lo], [x0 - ov, y1 + ov, lo], [x1 + ov, y1 + ov, hi], [x1 + ov, y0 - ov, hi]); gable([x1, y0, e], [x1, y1, e], [x1, y1, top], [x1, y0, top]); gable([x0, y0, e], [x1, y0, e], [x1, y0, top]); gable([x0, y1, e], [x1, y1, e], [x1, y1, top]); break
      case 'e': roofP([x1 + ov, y0 - ov, lo], [x1 + ov, y1 + ov, lo], [x0 - ov, y1 + ov, hi], [x0 - ov, y0 - ov, hi]); gable([x0, y0, e], [x0, y1, e], [x0, y1, top], [x0, y0, top]); gable([x0, y0, e], [x1, y0, e], [x0, y0, top]); gable([x0, y1, e], [x1, y1, e], [x0, y1, top]); break
    }
    return polys
  }

  if (roof.ridge === 'ew') {
    const yc = (y0 + y1) / 2, half = (y1 - y0) / 2
    if (roof.form === 'hip' && x1 - x0 > 2 * half) {
      const a = x0 + half, b = x1 - half
      roofP([x0 - ov, y0 - ov, lo], [x1 + ov, y0 - ov, lo], [b, yc, top], [a, yc, top])
      roofP([x0 - ov, y1 + ov, lo], [x1 + ov, y1 + ov, lo], [b, yc, top], [a, yc, top])
      roofP([x0 - ov, y0 - ov, lo], [x0 - ov, y1 + ov, lo], [a, yc, top])
      roofP([x1 + ov, y0 - ov, lo], [x1 + ov, y1 + ov, lo], [b, yc, top])
    } else {
      roofP([x0 - ov, y0 - ov, lo], [x1 + ov, y0 - ov, lo], [x1 + ov, yc, top], [x0 - ov, yc, top])
      roofP([x0 - ov, y1 + ov, lo], [x1 + ov, y1 + ov, lo], [x1 + ov, yc, top], [x0 - ov, yc, top])
      gable([x0, y0, e], [x0, y1, e], [x0, yc, top])
      gable([x1, y0, e], [x1, y1, e], [x1, yc, top])
    }
  } else {
    const xc = (x0 + x1) / 2, half = (x1 - x0) / 2
    if (roof.form === 'hip' && y1 - y0 > 2 * half) {
      const a = y0 + half, b = y1 - half
      roofP([x0 - ov, y0 - ov, lo], [x0 - ov, y1 + ov, lo], [xc, b, top], [xc, a, top])
      roofP([x1 + ov, y0 - ov, lo], [x1 + ov, y1 + ov, lo], [xc, b, top], [xc, a, top])
      roofP([x0 - ov, y0 - ov, lo], [x1 + ov, y0 - ov, lo], [xc, a, top])
      roofP([x0 - ov, y1 + ov, lo], [x1 + ov, y1 + ov, lo], [xc, b, top])
    } else {
      roofP([x0 - ov, y0 - ov, lo], [x0 - ov, y1 + ov, lo], [xc, y1 + ov, top], [xc, y0 - ov, top])
      roofP([x1 + ov, y0 - ov, lo], [x1 + ov, y1 + ov, lo], [xc, y1 + ov, top], [xc, y0 - ov, top])
      gable([x0, y0, e], [x1, y0, e], [xc, y0, top])
      gable([x0, y1, e], [x1, y1, e], [xc, y1, top])
    }
  }
  return polys
}

/** Highest point of the house above the main floor, from its roofs, or the top of its highest level without them. */
export function houseHeight(house: HouseModel) {
  const ridges = house.roofs.map(r => ridgeHeight(house, r))
  return Math.max(...ridges, ...house.levels.map(eaveHeight))
}

/**
 * A first pass of roofs for a house saved without them: a gable over each rectangle of roof each level exposes,
 * with the ridge along its long side. Two-story rooms count as part of the level above.
 */
export function firstPassRoofs(house: HouseModel): Roof[] {
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const footprint = (l: Level) => l.rooms.filter(r => r.type !== 'outdoor').map(r => r.rect)
  const roofs: Roof[] = []
  levels.forEach((level, i) => {
    const above = levels.slice(i + 1)
    const covered = [...above.flatMap(footprint), ...level.rooms.filter(r => r.twoStory).map(r => r.rect)]
    const own = level.rooms.filter(r => r.type !== 'outdoor' && !r.twoStory).map(r => r.rect)
    const twoStoryBelow = i > 0 ? levels[i - 1].rooms.filter(r => r.twoStory).map(r => r.rect) : []
    const exposed = mergeRects([...own, ...twoStoryBelow]).flatMap(r => subtract(r, covered))
    mergeRects(exposed).forEach((r, j) => roofs.push({
      id: `roof-${level.id}-${j + 1}`, name: `${level.name} roof ${j + 1}`, rect: r, levelId: level.id,
      form: 'gable', pitch: 8, ridge: r.w >= r.d ? 'ew' : 'ns', low: 's', overhang: 24,
    }))
  })
  return roofs
}

/** Parts of `r` not covered by any of `cover`, as rectangles. */
function subtract(r: Rect, cover: Rect[]): Rect[] {
  let pieces = [r]
  for (const c of cover) {
    pieces = pieces.flatMap(p => {
      const ix0 = Math.max(p.x, c.x), iy0 = Math.max(p.y, c.y), ix1 = Math.min(p.x + p.w, c.x + c.w), iy1 = Math.min(p.y + p.d, c.y + c.d)
      if (ix1 <= ix0 || iy1 <= iy0) return [p]
      const out: Rect[] = []
      if (p.y < iy0) out.push({ x: p.x, y: p.y, w: p.w, d: iy0 - p.y })
      if (iy1 < p.y + p.d) out.push({ x: p.x, y: iy1, w: p.w, d: p.y + p.d - iy1 })
      if (p.x < ix0) out.push({ x: p.x, y: iy0, w: ix0 - p.x, d: iy1 - iy0 })
      if (ix1 < p.x + p.w) out.push({ x: ix1, y: iy0, w: p.x + p.w - ix1, d: iy1 - iy0 })
      return out
    })
  }
  return pieces
}

/** Points on a 2 ft grid inside a rectangle, for coverage checks. */
export function samplePoints(r: Rect, step = 24): [number, number][] {
  const pts: [number, number][] = []
  for (let x = r.x + step / 2; x < r.x + r.w; x += step) for (let y = r.y + step / 2; y < r.y + r.d; y += step) pts.push([x, y])
  return pts
}
