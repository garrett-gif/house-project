import type { Ceiling, Check, Estate, HouseModel, Inches, Level, Room } from './types'
import type { P3, Poly3 } from './roofs'
import { roofPolygons } from './roofs'
import { toFt } from './geometry'
import { toHouse } from './wings'

/**
 * Ceilings. Each room has a ceiling form: flat (the default), vaulted (two planes rising from the long walls to a
 * peak, with optional exposed timber trusses), beamed (flat with exposed beams), or tray (a raised center). Heights
 * are above the room's own floor. Geometry is in the room's frame (its wing's, if it has one), z above the main floor,
 * the same as roofs, so plans, sections, and 3D draw the same shapes.
 */
export const CEILING_FORMS = ['flat', 'vaulted', 'beamed', 'tray'] as const

/** Ceiling structure taken from floor-to-floor height. */
const FLOOR_STRUCTURE = 12
/** Tray ceilings step up this far inside a border this wide. */
const TRAY_BORDER = 24
/** Timber sizes, as drawn: truss members and beams. */
export const TIMBER = { truss: { w: 8, d: 10 }, ridge: { w: 8, d: 12 }, beam: { w: 6, d: 10 } }

const levelOf = (house: HouseModel, room: Room) => house.levels.find(l => l.rooms.some(r => r.id === room.id))
const above = (house: HouseModel, level: Level) => [...house.levels].sort((a, b) => a.elevation - b.elevation).find(l => l.elevation > level.elevation)

/** Top of the room's walls above its floor: under the floor above, or the floor above's too for two-story rooms. */
export function plateHeight(house: HouseModel, room: Room): Inches {
  const level = levelOf(house, room)
  if (!level) return 0
  const up = room.twoStory ? above(house, level) : undefined
  return level.floorHeight + (up ? up.floorHeight : 0) - FLOOR_STRUCTURE
}

/** The room's ceiling with defaults filled in. Vaulted ridges run the long way, spans the short way. */
export function ceilingOf(house: HouseModel, room: Room): Required<Omit<Ceiling, 'glassEnds'>> & Pick<Ceiling, 'glassEnds'> {
  const plate = plateHeight(house, room)
  const c = room.ceiling ?? { form: 'flat', height: plate }
  const long: 'ew' | 'ns' = room.rect.w >= room.rect.d ? 'ew' : 'ns'
  const spacing = c.spacing ?? (c.form === 'vaulted' ? 12 * 12 : c.form === 'beamed' ? 6 * 12 : 0)
  return { form: c.form, height: c.height, ridge: c.ridge ?? long, spacing, glassEnds: c.glassEnds }
}

/** Half the span across the ridge, the run of a vault. */
const run = (room: Room, ridge: 'ew' | 'ns') => (ridge === 'ew' ? room.rect.d : room.rect.w) / 2

/** The ceiling's surfaces and its vault end walls, in the room's frame. `gable` polygons fill the end walls up to the vault. */
export function ceilingPolygons(house: HouseModel, room: Room): Poly3[] {
  const level = levelOf(house, room)
  if (!level || room.type === 'outdoor') return []
  const c = ceilingOf(house, room), z0 = level.elevation
  const { x: x0, y: y0 } = room.rect, x1 = x0 + room.rect.w, y1 = y0 + room.rect.d
  const flat = (h: number, a = x0, b = y0, c2 = x1, d = y1): Poly3 => ({ kind: 'roof', pts: [[a, b, z0 + h], [c2, b, z0 + h], [c2, d, z0 + h], [a, d, z0 + h]] })
  if (c.form === 'flat' || c.form === 'beamed') return [flat(c.height)]
  const plate = plateHeight(house, room)
  if (c.form === 'tray') {
    const t = TRAY_BORDER, lo = z0 + plate, hi = z0 + c.height
    const ring: Poly3[] = [
      { kind: 'roof', pts: [[x0, y0, lo], [x1, y0, lo], [x1, y0 + t, lo], [x0, y0 + t, lo]] },
      { kind: 'roof', pts: [[x0, y1 - t, lo], [x1, y1 - t, lo], [x1, y1, lo], [x0, y1, lo]] },
      { kind: 'roof', pts: [[x0, y0 + t, lo], [x0 + t, y0 + t, lo], [x0 + t, y1 - t, lo], [x0, y1 - t, lo]] },
      { kind: 'roof', pts: [[x1 - t, y0 + t, lo], [x1, y0 + t, lo], [x1, y1 - t, lo], [x1 - t, y1 - t, lo]] },
    ]
    const step: Poly3[] = [
      { kind: 'gable', pts: [[x0 + t, y0 + t, lo], [x1 - t, y0 + t, lo], [x1 - t, y0 + t, hi], [x0 + t, y0 + t, hi]] },
      { kind: 'gable', pts: [[x0 + t, y1 - t, lo], [x1 - t, y1 - t, lo], [x1 - t, y1 - t, hi], [x0 + t, y1 - t, hi]] },
      { kind: 'gable', pts: [[x0 + t, y0 + t, lo], [x0 + t, y1 - t, lo], [x0 + t, y1 - t, hi], [x0 + t, y0 + t, hi]] },
      { kind: 'gable', pts: [[x1 - t, y0 + t, lo], [x1 - t, y1 - t, lo], [x1 - t, y1 - t, hi], [x1 - t, y0 + t, hi]] },
    ]
    return [...ring, ...step, flat(c.height, x0 + t, y0 + t, x1 - t, y1 - t)]
  }
  // Vaulted: two planes from the plate on the long walls up to the peak, and the end walls filled to the vault.
  const lo = z0 + plate, hi = z0 + Math.max(plate, c.height)
  if (c.ridge === 'ew') {
    const ym = (y0 + y1) / 2
    return [
      { kind: 'roof', pts: [[x0, y0, lo], [x1, y0, lo], [x1, ym, hi], [x0, ym, hi]] },
      { kind: 'roof', pts: [[x1, y1, lo], [x0, y1, lo], [x0, ym, hi], [x1, ym, hi]] },
      { kind: 'gable', side: 'w', pts: [[x0, y0, lo], [x0, y1, lo], [x0, ym, hi]] },
      { kind: 'gable', side: 'e', pts: [[x1, y1, lo], [x1, y0, lo], [x1, ym, hi]] },
    ]
  }
  const xm = (x0 + x1) / 2
  return [
    { kind: 'roof', pts: [[x0, y1, lo], [x0, y0, lo], [xm, y0, hi], [xm, y1, hi]] },
    { kind: 'roof', pts: [[x1, y0, lo], [x1, y1, lo], [xm, y1, hi], [xm, y0, hi]] },
    { kind: 'gable', side: 's', pts: [[x1, y0, lo], [x0, y0, lo], [xm, y0, hi]] },
    { kind: 'gable', side: 'n', pts: [[x0, y1, lo], [x1, y1, lo], [xm, y1, hi]] },
  ]
}

/** One timber member: a straight piece from a to b, w wide and d deep, in the room's frame. */
export interface Timber { a: P3; b: P3; w: Inches; d: Inches; kind: 'rafter' | 'tie' | 'post' | 'ridge' | 'beam' }

/**
 * Exposed timber. Vaulted rooms with spacing get king-post trusses across the span (two rafters under the vault, a
 * collar tie a third of the way up, a king post to the peak) and a ridge beam; beamed rooms get beams across the
 * short way just under the ceiling. Trusses stand clear of the end walls by half a bay.
 */
export function ceilingTimber(house: HouseModel, room: Room): Timber[] {
  const level = levelOf(house, room)
  if (!level) return []
  const c = ceilingOf(house, room), z0 = level.elevation
  const { x: x0, y: y0 } = room.rect, x1 = x0 + room.rect.w, y1 = y0 + room.rect.d
  if (!c.spacing) return []
  // Stations along the length, centered so the end bays match.
  const stations = (from: number, to: number) => {
    const n = Math.max(1, Math.round((to - from) / c.spacing))
    return Array.from({ length: n }, (_, i) => from + (i + 0.5) * (to - from) / n)
  }
  if (c.form === 'beamed') {
    const z = z0 + c.height - TIMBER.beam.d / 2, { w, d } = TIMBER.beam
    // Beams span the short way.
    return room.rect.w >= room.rect.d
      ? stations(x0, x1).map(x => ({ a: [x, y0, z], b: [x, y1, z], w, d, kind: 'beam' }) as Timber)
      : stations(y0, y1).map(y => ({ a: [x0, y, z], b: [x1, y, z], w, d, kind: 'beam' }) as Timber)
  }
  if (c.form !== 'vaulted') return []
  const plate = z0 + plateHeight(house, room), peak = z0 + Math.max(plateHeight(house, room), c.height)
  const t = TIMBER.truss, half = run(room, c.ridge), drop = t.d / 2
  const rise = peak - plate, tieZ = plate + rise / 3, tieHalf = half * (1 - 1 / 3)
  const out: Timber[] = []
  const truss = (P: (across: number, z: number) => P3) => {
    out.push({ a: P(-half, plate - drop), b: P(0, peak - drop), ...t, kind: 'rafter' })
    out.push({ a: P(half, plate - drop), b: P(0, peak - drop), ...t, kind: 'rafter' })
    out.push({ a: P(-tieHalf, tieZ - drop), b: P(tieHalf, tieZ - drop), ...t, kind: 'tie' })
    out.push({ a: P(0, tieZ - drop), b: P(0, peak - drop), ...t, kind: 'post' })
  }
  if (c.ridge === 'ew') {
    const ym = (y0 + y1) / 2
    for (const x of stations(x0, x1)) truss((s, z) => [x, ym + s, z])
    out.push({ a: [x0, ym, peak - TIMBER.ridge.d / 2], b: [x1, ym, peak - TIMBER.ridge.d / 2], ...TIMBER.ridge, kind: 'ridge' })
  } else {
    const xm = (x0 + x1) / 2
    for (const y of stations(y0, y1)) truss((s, z) => [xm + s, y, z])
    out.push({ a: [xm, y0, peak - TIMBER.ridge.d / 2], b: [xm, y1, peak - TIMBER.ridge.d / 2], ...TIMBER.ridge, kind: 'ridge' })
  }
  return out
}

/** The roof's underside height at a house-frame point, from the roof planes over it, or null if no roof is over it. */
export function roofHeightAt(house: HouseModel, x: number, y: number): number | null {
  let best: number | null = null
  for (const roof of house.roofs) for (const p of roofPolygons(house, roof)) {
    if (p.kind !== 'roof' || !inside(p.pts, x, y)) continue
    const [a, b, c] = p.pts
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    if (Math.abs(nz) < 1e-9) continue
    const z = a[2] - (nx * (x - a[0]) + ny * (y - a[1])) / nz
    best = best === null ? z : Math.max(best, z)
  }
  return best
}

function inside(pts: P3[], x: number, y: number) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** Minimum ceiling height in habitable rooms, a planning value from the 2006 IRC (R305). */
export const MIN_CEILING = 7 * 12

/**
 * Ceiling checks, per house: ceilings at least 7 ft in rooms people live in, vaults that rise only where nothing is
 * built above, and vault peaks under the roof with room for the structure. Warnings: planning values only.
 */
export function ceilingChecks(e: Estate): Check[] {
  const house = e.house
  const f1 = (v: number) => Math.round(toFt(v) * 10) / 10
  const low: string[] = [], lowIds: string[] = [], blocked: string[] = [], blockedIds: string[] = [], roofed: string[] = [], roofedIds: string[] = []
  const shaped = house.levels.flatMap(l => l.rooms.filter(r => r.ceiling && r.ceiling.form !== 'flat'))
  for (const level of house.levels) for (const room of level.rooms.filter(r => r.type !== 'outdoor')) {
    const c = ceilingOf(house, room), plate = plateHeight(house, room)
    const lowest = c.form === 'vaulted' || c.form === 'tray' ? plate : c.height - (c.form === 'beamed' ? TIMBER.beam.d : 0)
    if (!['garage', 'service', 'circulation', 'bath'].includes(room.type) && lowest < MIN_CEILING) { low.push(`${room.name} ${f1(lowest)} ft`); lowIds.push(room.id) }
    if (c.form !== 'vaulted' && c.form !== 'tray') continue
    if (c.height <= plate) continue
    // Something built on the floor above, in the same frame, over this room?
    const up = above(house, level)
    const over = up?.rooms.find(r => r.type !== 'outdoor' && (r.wingId ?? '') === (room.wingId ?? '')
      && r.rect.x < room.rect.x + room.rect.w && room.rect.x < r.rect.x + r.rect.w && r.rect.y < room.rect.y + room.rect.d && room.rect.y < r.rect.y + r.rect.d)
    if (over && !room.twoStory) { blocked.push(`${room.name} under ${over.name}`); blockedIds.push(room.id); continue }
    // The peak, plus 12 in of structure, under the roof at the room's middle.
    const mid = toHouse(house, room.wingId, { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.d / 2 })
    const roofZ = roofHeightAt(house, mid.x, mid.y)
    const peak = level.elevation + c.height
    if (roofZ !== null && peak + 12 > roofZ) { roofed.push(`${room.name} peak ${f1(peak)} ft, roof ${f1(roofZ)} ft`); roofedIds.push(room.id) }
  }
  const BASIS = 'Planning values (2006 IRC R305 for height); not a code review.'
  return [
    low.length
      ? { id: 'ceiling-height', label: 'Ceilings at least 7 ft in living spaces', status: 'warn', detail: `${low.join('; ')}. ${BASIS}`, elements: lowIds }
      : { id: 'ceiling-height', label: 'Ceilings at least 7 ft in living spaces', status: 'pass', detail: `${shaped.length} shaped ceilings. ${BASIS}` },
    blocked.length || roofed.length
      ? { id: 'ceiling-vaults', label: 'Vaults fit under the roof, with nothing built above', status: 'warn', detail: `${[...blocked, ...roofed].join('; ')}. Lower the peak, raise the roof, or open the room to the floor above. ${BASIS}`, elements: [...blockedIds, ...roofedIds] }
      : { id: 'ceiling-vaults', label: 'Vaults fit under the roof, with nothing built above', status: 'pass', detail: `Every vault and tray fits. ${BASIS}` },
  ]
}

/** A short ceiling note for plans and the summary: "vaulted to 22'-0\" with trusses", or '' for a plain flat ceiling. */
export function ceilingNote(house: HouseModel, room: Room): string {
  if (!room.ceiling) return ''
  const c = ceilingOf(house, room), h = `${f(toFt(c.height))} ft`
  switch (c.form) {
    case 'flat': return `flat ${h}`
    case 'vaulted': return `vaulted to ${h}${c.spacing ? `, timber trusses ${f(toFt(c.spacing))} ft apart` : ''}, ridge ${c.ridge === 'ew' ? 'east-west' : 'north-south'}`
    case 'beamed': return `beamed ${h}, beams ${f(toFt(c.spacing))} ft apart`
    case 'tray': return `tray to ${h}`
  }
}
const f = (v: number) => String(Math.round(v * 10) / 10)
