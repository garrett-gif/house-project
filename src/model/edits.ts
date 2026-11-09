import type { Beam, BeamMaterial, Ceiling, Estate, FireRules, FurnitureItem, Ignition, Inches, Opening, OpeningKind, Rect, Road, RoadKind, RoofForm, Room, RoomType, SecurityDevice, Side, Utility, UtilityRules, WallKind, WaterSource, WindowOperation } from './types'
import { DEFAULT_FIRE_RULES } from './fireChecks'
import { UTILITY_KINDS, UTILITY_RULE_NAMES, UTILITY_UNIT } from './utilities'
import { ROOF_FORMS } from './roofs'
import { SIDE_WORD, placeOpenings, sideLine } from './walls'
import { footprintOf, overlaps, toFt, translate } from './geometry'
import { withDerivedGeometry } from './derive'
import { allHouses, houseByBuilding, houseOfRoom } from './houses'
import { BEAM_MATERIALS, firstPassBeams } from './beams'
import { CATALOG, furnishRoom } from './furniture'
import { CEILING_FORMS } from './ceilings'
const allHousesOf = allHouses

/** Which point of a rectangle stays fixed when it is resized. `n` keeps the north edge, `sw` the southwest corner. */
export type Anchor = 'sw' | 's' | 'se' | 'w' | 'center' | 'e' | 'nw' | 'n' | 'ne'
export const ANCHORS: Anchor[] = ['sw', 's', 'se', 'w', 'center', 'e', 'nw', 'n', 'ne']
export const ROOM_TYPES: RoomType[] = ['bedroom', 'bath', 'living', 'service', 'circulation', 'wellness', 'garage', 'pool', 'outdoor']

/**
 * Small, named changes to the shared model. Every length is inches.
 * dx is east and dy is north. Room coordinates are local to `house.origin`.
 */
export type EditOp =
  | { op: 'moveBuilding'; buildingId: string; dx: Inches; dy: Inches }
  | { op: 'resizeBuilding'; buildingId: string; w: Inches; d: Inches; anchor: Anchor }
  | { op: 'moveRoom'; roomId: string; dx: Inches; dy: Inches }
  | { op: 'resizeRoom'; roomId: string; w: Inches; d: Inches; anchor: Anchor }
  | { op: 'addRoom'; levelId: string; room: Room }
  | { op: 'removeRoom'; roomId: string }
  | { op: 'renameRoom'; roomId: string; name: string }
  | { op: 'setRoomType'; roomId: string; type: RoomType }
  | { op: 'addDoor'; opening: Opening }
  | { op: 'addWindow'; opening: Opening }
  | { op: 'moveOpening'; openingId: string; side: Side; offset: Inches }
  | { op: 'resizeOpening'; openingId: string; width: Inches; height: Inches; sill: Inches }
  | { op: 'removeOpening'; openingId: string }
  /** Moves one side of a room by `distance` (positive is outward). Rooms on the other side of that wall give or take the same space. */
  | { op: 'moveWall'; roomId: string; side: Side; distance: Inches }
  | { op: 'setWallThickness'; kind: WallKind; thickness: Inches }
  /** Changes how a roof is shaped. Its extent stays the same. */
  | { op: 'setRoof'; roofId: string; form: RoofForm; pitch: number; ridge: 'ew' | 'ns'; low: Side; overhang: Inches }
  /** Site points are in site inches: x east, y north from the southwest parcel corner. */
  | { op: 'addRoad'; road: Road }
  | { op: 'removeRoad'; roadId: string }
  | { op: 'setRoadWidth'; roadId: string; width: Inches }
  | { op: 'setTurnaround'; roadId: string; turnaround: boolean }
  | { op: 'addWaterSource'; source: WaterSource }
  | { op: 'removeWaterSource'; sourceId: string }
  | { op: 'setIgnition'; buildingId: string; ignition: Ignition }
  | { op: 'setFireRule'; rule: FireRuleName; value: number }
  /** Utilities sit on site rectangles; `capacity` is in the unit of their kind (see Utility). */
  | { op: 'addUtility'; utility: Utility }
  | { op: 'moveUtility'; utilityId: string; dx: Inches; dy: Inches }
  | { op: 'resizeUtility'; utilityId: string; w: Inches; d: Inches; anchor: Anchor }
  | { op: 'setUtility'; utilityId: string; capacity: number; serves: string[]; pumped?: boolean }
  | { op: 'removeUtility'; utilityId: string }
  | { op: 'addDevice'; device: SecurityDevice }
  | { op: 'moveDevice'; deviceId: string; dx: Inches; dy: Inches }
  /** `facing` and `fov` in degrees, 0 east and 90 north. */
  | { op: 'aimCamera'; deviceId: string; facing: number; fov: number; range: Inches }
  | { op: 'removeDevice'; deviceId: string }
  | { op: 'setOccupancy'; buildingId: string; beds: number; staff: number; backupPower: boolean }
  | { op: 'setUtilityRule'; rule: keyof UtilityRules; value: number }
  | { op: 'setSafeRoom'; roomId: string; safeRoom: boolean }
  | { op: 'setCeiling'; roomId: string; ceiling: Ceiling | null }
  /** A graded swale or curtain drain around a building. */
  | { op: 'setSwale'; buildingId: string; swale: boolean }
  /** Beams in house-local inches; see Beam. */
  | { op: 'addBeam'; beam: Beam }
  | { op: 'removeBeam'; beamId: string }
  | { op: 'setBeam'; beamId: string; material: BeamMaterial; posts: Inches[] }
  /** Replaces a house's beams with the rule-based first pass for its current walls. */
  | { op: 'fitBeams'; buildingId: string }
  /** Furniture centers are house-local inches; rotation is which way the piece faces. */
  | { op: 'addFurniture'; item: FurnitureItem }
  | { op: 'moveFurniture'; itemId: string; dx: Inches; dy: Inches }
  | { op: 'rotateFurniture'; itemId: string; rotation: FurnitureItem['rotation'] }
  | { op: 'removeFurniture'; itemId: string }
  /** Replaces a room's furniture with the first pass for it. */
  | { op: 'furnishRoom'; roomId: string }
  /** Whether a house's site is excavated to its walkout, rather than relying on the land's natural fall. */
  | { op: 'setExcavated'; buildingId: string; excavated: boolean }

export const ROAD_KINDS: RoadKind[] = ['estate', 'work', 'perimeter', 'gated-link']
export const FIRE_RULE_NAMES = ['zone1Ft', 'zone2Ft', 'zone3Ft', 'minRoadWidthFt', 'maxHosePullFt', 'maxDeadEndFt', 'maxWaterDistanceFt', 'minWaterGallons'] as const
export type FireRuleName = typeof FIRE_RULE_NAMES[number]
const ID = /^[a-z0-9][a-z0-9-]*$/

export const SIDES: Side[] = ['n', 's', 'e', 'w']
export const WALL_KINDS: WallKind[] = ['exterior', 'interior', 'foundation']
export const DOOR_KINDS: OpeningKind[] = ['door', 'opening', 'garage-door']
export const WINDOW_OPERATIONS: WindowOperation[] = ['casement', 'double-hung', 'slider', 'fixed']
const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' }

/** On failure, `index` is the operation that failed. It is absent when the set as a whole collides. */
export type EditResult = { ok: true; estate: Estate } | { ok: false; error: string; index?: number }

const MIN_SIZE = 12
const finite = (...v: number[]) => v.every(Number.isFinite)

function anchorFractions(a: Anchor) {
  const fx = a.endsWith('w') ? 0 : a.endsWith('e') ? 1 : 0.5
  const fy = a.startsWith('s') ? 0 : a.startsWith('n') ? 1 : 0.5
  return { fx, fy }
}

/** Resizes a rectangle while the anchor point stays where it was. */
export function resizeRect(r: Rect, w: Inches, d: Inches, anchor: Anchor): Rect {
  const { fx, fy } = anchorFractions(anchor)
  return { x: r.x + fx * r.w - fx * w, y: r.y + fy * r.d - fy * d, w, d }
}

function findRoom(e: Estate, roomId: string) {
  for (const level of e.house.levels) {
    const room = level.rooms.find(r => r.id === roomId)
    if (room) return { level, room }
  }
  return undefined
}

function checkSize(w: number, d: number, limit: number) {
  if (!finite(w, d)) return 'Sizes must be numbers.'
  if (w < MIN_SIZE || d < MIN_SIZE) return 'Width and depth must each be at least 1 ft.'
  if (w > limit || d > limit) return `Width and depth must each be under ${Math.round(toFt(limit)).toLocaleString('en-US')} ft.`
  return ''
}

/**
 * Changes a room's rectangle while keeping its doors and windows where they are in plan.
 * Offsets are measured from a side's west or south end, so when that end moves the offsets change to compensate.
 */
function setRect(e: Estate, room: Room, next: Rect) {
  const dx = room.rect.x - next.x, dy = room.rect.y - next.y
  for (const o of e.house.openings) {
    if (o.roomId !== room.id) continue
    if (o.side === 'n' || o.side === 's') o.offset += dx
    else o.offset += dy
  }
  room.rect = next
}

function checkInside(e: Estate, r: Rect) {
  return r.x < 0 || r.y < 0 || r.x + r.w > e.parcel.size || r.y + r.d > e.parcel.size ? 'It must stay inside the parcel.' : ''
}

function checkUtility(e: Estate, capacity: number, serves: string[]) {
  if (!finite(capacity) || capacity < 0 || capacity > 100_000_000) return 'Capacity must be a positive number.'
  if (!Array.isArray(serves)) return 'Serves must be a list of building ids.'
  const unknown = serves.filter(id => !e.buildings.some(b => b.id === id))
  return unknown.length ? `No building with id "${unknown[0]}".` : ''
}

const checkReach = (range: number) => !finite(range) || range < 12 || range > 12 * 2000 ? 'Range must be between 1 and 2,000 ft.' : ''
const checkAim = (facing: number, fov: number) => !finite(facing, fov) ? 'Facing and view must be numbers.' : fov < 5 || fov > 360 ? 'View must be between 5 and 360 degrees.' : ''

function checkOpeningSize(width: number, height: number, sill: number) {
  if (!finite(width, height, sill)) return 'Opening sizes must be numbers.'
  if (width < 12 || height < 12) return 'Openings must be at least 1 ft wide and 1 ft tall.'
  if (width > 12 * 24 || height > 12 * 20) return 'Openings must be under 24 ft wide and 20 ft tall.'
  if (sill < 0 || sill > 12 * 8) return 'Sill height must be between 0 and 8 ft.'
  return ''
}

function checkOpening(e: Estate, o: Opening, kinds: OpeningKind[]) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(o.id)) return 'Opening ids use lowercase letters, numbers, and hyphens.'
  if (e.house.openings.some(x => x.id === o.id)) return `An opening with id "${o.id}" already exists.`
  if (!kinds.includes(o.kind)) return `Kind must be one of: ${kinds.join(', ')}.`
  if (!findRoom(e, o.roomId)) return `No room with id "${o.roomId}".`
  if (!SIDES.includes(o.side)) return `Side must be one of: ${SIDES.join(', ')}.`
  if (o.operation && !WINDOW_OPERATIONS.includes(o.operation)) return `Window operation must be one of: ${WINDOW_OPERATIONS.join(', ')}.`
  if (o.swing && o.swing !== 'in' && o.swing !== 'out') return 'Swing must be in or out.'
  return checkOpeningSize(o.width, o.height, o.sill) || (finite(o.offset) ? '' : 'Offset must be a number.')
}

/** The detailed building an edit works inside, by the ids it names. Undefined for site edits. */
function targetHouse(e: Estate, op: EditOp): string | undefined {
  const opening = (id: string) => allHouses(e).find(h => h.openings.some(o => o.id === id))?.buildingId
  switch (op.op) {
    case 'moveBuilding': case 'resizeBuilding': case 'setExcavated': return houseByBuilding(e, op.buildingId)?.buildingId
    case 'moveRoom': case 'resizeRoom': case 'removeRoom': case 'renameRoom': case 'setRoomType': case 'moveWall': case 'setSafeRoom': case 'setCeiling':
      return houseOfRoom(e, op.roomId)?.buildingId
    case 'addRoom': return allHouses(e).find(h => h.levels.some(l => l.id === op.levelId))?.buildingId
    case 'addDoor': case 'addWindow': return houseOfRoom(e, op.opening.roomId)?.buildingId
    case 'moveOpening': case 'resizeOpening': case 'removeOpening': return opening(op.openingId)
    case 'setRoof': return allHouses(e).find(h => h.roofs.some(r => r.id === op.roofId))?.buildingId
    case 'addBeam': return allHouses(e).find(h => h.levels.some(l => l.id === op.beam.levelId))?.buildingId
    case 'removeBeam': case 'setBeam': return allHouses(e).find(h => (h.beams ?? []).some(b => b.id === op.beamId))?.buildingId
    case 'fitBeams': return houseByBuilding(e, op.buildingId)?.buildingId
    case 'addFurniture': return houseOfRoom(e, op.item.roomId)?.buildingId
    case 'moveFurniture': case 'rotateFurniture': case 'removeFurniture': return allHouses(e).find(h => (h.furniture ?? []).some(i => i.id === op.itemId))?.buildingId
    case 'furnishRoom': return houseOfRoom(e, op.roomId)?.buildingId
    default: return undefined
  }
}

/**
 * Mutates a private copy. Returns an error message, or '' on success. Edits inside another detailed building run
 * with that building swapped into `house`, so every house edit works on any of them. Wall thickness applies to all.
 */
function run(e: Estate, op: EditOp): string {
  if (op.op === 'addRoom' && houseOfRoom(e, op.room.id)) return `A room with id "${op.room.id}" already exists.`
  if ((op.op === 'addDoor' || op.op === 'addWindow') && allHouses(e).some(h => h.openings.some(o => o.id === op.opening.id))) return `An opening with id "${op.opening.id}" already exists.`
  const others = e.houses ?? []
  const within = (i: number) => {
    const main = e.house
    e.house = others[i]
    others[i] = main
    try { return runInHouse(e, op) } finally { others[i] = e.house; e.house = main }
  }
  if (op.op === 'setWallThickness') return runInHouse(e, op) || others.map((_, i) => within(i)).find(Boolean) || ''
  const i = others.findIndex(h => h.buildingId === targetHouse(e, op))
  return i < 0 ? runInHouse(e, op) : within(i)
}

function runInHouse(e: Estate, op: EditOp): string {
  switch (op.op) {
    case 'moveBuilding': {
      const b = e.buildings.find(x => x.id === op.buildingId)
      if (!b) return `No building with id "${op.buildingId}".`
      if (!finite(op.dx, op.dy)) return 'Move distances must be numbers.'
      if (b.id === e.house.buildingId) {
        e.house.origin = { x: e.house.origin.x + op.dx, y: e.house.origin.y + op.dy }
      } else {
        b.rect = translate(b.rect, op.dx, op.dy)
        if (b.parts) b.parts = b.parts.map(p => translate(p, op.dx, op.dy))
        if (b.footprint) b.footprint = b.footprint.map(p => translate(p, op.dx, op.dy))
      }
      for (const w of e.walkways) {
        const last = w.points.length - 1
        if (w.from === b.id) w.points[0] = { x: w.points[0].x + op.dx, y: w.points[0].y + op.dy }
        if (w.to === b.id) w.points[last] = { x: w.points[last].x + op.dx, y: w.points[last].y + op.dy }
      }
      // Cameras and lights mounted on the building go with it.
      for (const d of e.security ?? []) if (d.on === b.id) d.at = { x: d.at.x + op.dx, y: d.at.y + op.dy }
      return ''
    }
    case 'resizeBuilding': {
      const b = e.buildings.find(x => x.id === op.buildingId)
      if (!b) return `No building with id "${op.buildingId}".`
      if (b.id === e.house.buildingId) return `The ${b.name.toLowerCase()} outline comes from its rooms. Resize or move rooms instead.`
      if (b.parts) return `${b.name} has several masses and cannot be resized as one rectangle.`
      if (!ANCHORS.includes(op.anchor)) return `Unknown anchor "${op.anchor}".`
      const bad = checkSize(op.w, op.d, e.parcel.size)
      if (bad) return bad
      b.rect = resizeRect(b.rect, op.w, op.d, op.anchor)
      return ''
    }
    case 'moveRoom': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      if (!finite(op.dx, op.dy)) return 'Move distances must be numbers.'
      found.room.rect = translate(found.room.rect, op.dx, op.dy)
      // Its furniture moves with it.
      for (const it of e.house.furniture ?? []) if (it.roomId === op.roomId) { it.x += op.dx; it.y += op.dy }
      return ''
    }
    case 'resizeRoom': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      if (!ANCHORS.includes(op.anchor)) return `Unknown anchor "${op.anchor}".`
      const bad = checkSize(op.w, op.d, e.parcel.size)
      if (bad) return bad
      setRect(e, found.room, resizeRect(found.room.rect, op.w, op.d, op.anchor))
      return ''
    }
    case 'addRoom': {
      const level = e.house.levels.find(l => l.id === op.levelId)
      if (!level) return `No level with id "${op.levelId}". Levels: ${e.house.levels.map(l => l.id).join(', ')}.`
      const { room } = op
      if (!/^[a-z0-9][a-z0-9-]*$/.test(room.id)) return 'Room ids use lowercase letters, numbers, and hyphens.'
      if (findRoom(e, room.id)) return `A room with id "${room.id}" already exists.`
      if (!room.name.trim()) return 'A new room needs a name.'
      if (room.wingId && !e.house.wings?.some(w => w.id === room.wingId)) return `No wing with id "${room.wingId}".`
      if (!ROOM_TYPES.includes(room.type)) return `Unknown room type "${room.type}".`
      if (!finite(room.rect.x, room.rect.y)) return 'Room position must be numbers.'
      const bad = checkSize(room.rect.w, room.rect.d, e.parcel.size)
      if (bad) return bad
      level.rooms.push({ ...room, rect: { ...room.rect } })
      return ''
    }
    case 'removeRoom': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      if (found.level.rooms.length === 1) return `${found.room.name} is the last room on ${found.level.name}.`
      // Doors and windows in the room, or leading into it, go with it. So do its stairs.
      const gone = new Set(placeOpenings(e.house).filter(o => o.roomId === op.roomId || o.leadsTo === op.roomId).map(o => o.id))
      e.house.openings = e.house.openings.filter(o => !gone.has(o.id))
      e.house.stairs = e.house.stairs.filter(s => s.roomId !== op.roomId && s.toRoomId !== op.roomId)
      found.level.rooms = found.level.rooms.filter(r => r !== found.room)
      if (e.house.furniture) e.house.furniture = e.house.furniture.filter(it => it.roomId !== op.roomId)
      return ''
    }
    case 'renameRoom': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      if (!op.name.trim()) return 'The new name is empty.'
      found.room.name = op.name.trim()
      return ''
    }
    case 'setRoomType': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      if (!ROOM_TYPES.includes(op.type)) return `Unknown room type "${op.type}". Types: ${ROOM_TYPES.join(', ')}.`
      found.room.type = op.type
      return ''
    }
    case 'addDoor':
    case 'addWindow': {
      const kinds: OpeningKind[] = op.op === 'addWindow' ? ['window'] : DOOR_KINDS
      const bad = checkOpening(e, op.opening, kinds)
      if (bad) return bad
      if (op.op === 'addDoor' && op.opening.sill !== 0) return 'Doors sit on the floor, so their sill is 0.'
      e.house.openings.push({ ...op.opening, ...(op.op === 'addWindow' ? { operation: op.opening.operation ?? 'casement' } : {}) })
      return ''
    }
    case 'moveOpening': {
      const o = e.house.openings.find(x => x.id === op.openingId)
      if (!o) return `No door or window with id "${op.openingId}".`
      if (!SIDES.includes(op.side)) return `Side must be one of: ${SIDES.join(', ')}.`
      if (!finite(op.offset)) return 'Offset must be a number.'
      o.side = op.side
      o.offset = op.offset
      return ''
    }
    case 'resizeOpening': {
      const o = e.house.openings.find(x => x.id === op.openingId)
      if (!o) return `No door or window with id "${op.openingId}".`
      const bad = checkOpeningSize(op.width, op.height, op.sill)
      if (bad) return bad
      if (o.kind !== 'window' && op.sill !== 0) return 'Doors sit on the floor, so their sill is 0.'
      Object.assign(o, { width: op.width, height: op.height, sill: op.sill })
      return ''
    }
    case 'removeOpening': {
      if (!e.house.openings.some(x => x.id === op.openingId)) return `No door or window with id "${op.openingId}".`
      e.house.openings = e.house.openings.filter(x => x.id !== op.openingId)
      return ''
    }
    case 'moveWall': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      if (!SIDES.includes(op.side)) return `Side must be one of: ${SIDES.join(', ')}.`
      if (!finite(op.distance) || op.distance === 0) return 'Distance must be a number other than 0.'
      const line = sideLine(found.room, op.side)
      const opposite = OPPOSITE[op.side]
      const neighbors = found.level.rooms.filter(r => {
        if (r === found.room || r.type === 'outdoor') return false
        const l = sideLine(r, opposite)
        return Math.abs(l.at - line.at) < 0.01 && l.from < line.to && line.from < l.to
      })
      const grow = (r: Room, side: Side, d: number) => {
        const { x, y, w, d: depth } = r.rect
        const next = side === 'n' ? { x, y, w, d: depth + d } : side === 's' ? { x, y: y - d, w, d: depth + d }
          : side === 'e' ? { x, y, w: w + d, d: depth } : { x: x - d, y, w: w + d, d: depth }
        if (next.w < MIN_SIZE || next.d < MIN_SIZE) return `${r.name} would be less than 1 ft ${side === 'n' || side === 's' ? 'deep' : 'wide'}.`
        setRect(e, r, next)
        return ''
      }
      return grow(found.room, op.side, op.distance) || neighbors.map(r => grow(r, opposite, -op.distance)).find(Boolean) || ''
    }
    case 'setWallThickness': {
      if (!WALL_KINDS.includes(op.kind)) return `Wall kind must be one of: ${WALL_KINDS.join(', ')}.`
      if (!finite(op.thickness) || op.thickness < 2 || op.thickness > 24) return 'Wall thickness must be between 2 and 24 inches.'
      e.house.wallThickness = { ...e.house.wallThickness, [op.kind]: op.thickness }
      return ''
    }
    case 'setRoof': {
      const roof = e.house.roofs.find(r => r.id === op.roofId)
      if (!roof) return `No roof with id "${op.roofId}". Roofs: ${e.house.roofs.map(r => r.id).join(', ')}.`
      if (!ROOF_FORMS.includes(op.form)) return `Roof form must be one of: ${ROOF_FORMS.join(', ')}.`
      if (op.ridge !== 'ew' && op.ridge !== 'ns') return 'Ridge must run ew or ns.'
      if (!SIDES.includes(op.low)) return `Low side must be one of: ${SIDES.join(', ')}.`
      if (!finite(op.pitch) || op.pitch < 0.25 || op.pitch > 24) return 'Pitch must be between 1/4:12 and 24:12.'
      if (!finite(op.overhang) || op.overhang < 0 || op.overhang > 12 * 8) return 'Overhang must be between 0 and 8 ft.'
      Object.assign(roof, { form: op.form, pitch: op.pitch, ridge: op.ridge, low: op.low, overhang: op.overhang })
      return ''
    }
    case 'addRoad': {
      const r = op.road
      if (!ID.test(r.id)) return 'Road ids use lowercase letters, numbers, and hyphens.'
      if (e.roads.some(x => x.id === r.id)) return `A road with id "${r.id}" already exists.`
      if (!r.name?.trim()) return 'A new road needs a name.'
      if (!ROAD_KINDS.includes(r.kind)) return `Road kind must be one of: ${ROAD_KINDS.join(', ')}.`
      if (!Array.isArray(r.points) || r.points.length < 2) return 'A road needs at least two points.'
      if (r.points.some(p => !finite(p.x, p.y) || p.x < 0 || p.y < 0 || p.x > e.parcel.size || p.y > e.parcel.size)) return 'Road points must be inside the parcel.'
      if (r.width !== undefined && (!finite(r.width) || r.width < 96 || r.width > 12 * 60)) return 'Road width must be between 8 and 60 ft.'
      e.roads.push({ ...r, points: r.points.map(p => ({ ...p })) })
      return ''
    }
    case 'removeRoad': {
      if (!e.roads.some(r => r.id === op.roadId)) return `No road with id "${op.roadId}".`
      e.roads = e.roads.filter(r => r.id !== op.roadId)
      return ''
    }
    case 'setRoadWidth': {
      const r = e.roads.find(x => x.id === op.roadId)
      if (!r) return `No road with id "${op.roadId}".`
      if (!finite(op.width) || op.width < 96 || op.width > 12 * 60) return 'Road width must be between 8 and 60 ft.'
      r.width = op.width
      return ''
    }
    case 'setTurnaround': {
      const r = e.roads.find(x => x.id === op.roadId)
      if (!r) return `No road with id "${op.roadId}".`
      r.turnaround = !!op.turnaround
      return ''
    }
    case 'addWaterSource': {
      const w = op.source
      const list = e.waterSources ?? []
      if (!ID.test(w.id)) return 'Water source ids use lowercase letters, numbers, and hyphens.'
      if (list.some(x => x.id === w.id)) return `A water source with id "${w.id}" already exists.`
      if (!['cistern', 'pond', 'hydrant'].includes(w.kind)) return 'Kind must be cistern, pond, or hydrant.'
      if (!finite(w.at.x, w.at.y) || w.at.x < 0 || w.at.y < 0 || w.at.x > e.parcel.size || w.at.y > e.parcel.size) return 'The water source must be inside the parcel.'
      if (!finite(w.gallons) || w.gallons < 100) return 'Gallons must be at least 100.'
      e.waterSources = [...list, { ...w, at: { ...w.at } }]
      return ''
    }
    case 'removeWaterSource': {
      if (!(e.waterSources ?? []).some(w => w.id === op.sourceId)) return `No water source with id "${op.sourceId}".`
      e.waterSources = (e.waterSources ?? []).filter(w => w.id !== op.sourceId)
      return ''
    }
    case 'setIgnition': {
      const b = e.buildings.find(x => x.id === op.buildingId)
      if (!b) return `No building with id "${op.buildingId}".`
      const i = op.ignition
      if (!['A', 'B', 'C', 'unrated'].includes(i.roofClass)) return 'Roof class must be A, B, C, or unrated.'
      if (!['none', 'noncombustible', 'combustible'].includes(i.decks)) return 'Decks must be none, noncombustible, or combustible.'
      b.ignition = { roofClass: i.roofClass, emberVents: !!i.emberVents, enclosedEaves: !!i.enclosedEaves, decks: i.decks }
      return ''
    }
    case 'setFireRule': {
      if (!FIRE_RULE_NAMES.includes(op.rule)) return `Rule must be one of: ${FIRE_RULE_NAMES.join(', ')}.`
      if (!finite(op.value) || op.value <= 0 || op.value > 1_000_000_000) return 'Rule values must be positive numbers.'
      const r: FireRules = structuredClone(e.fireRules ?? DEFAULT_FIRE_RULES)
      if (op.rule === 'zone1Ft') r.zones[0] = op.value
      else if (op.rule === 'zone2Ft') r.zones[1] = op.value
      else if (op.rule === 'zone3Ft') r.zones[2] = op.value
      else r[op.rule] = op.value
      if (!(r.zones[0] < r.zones[1] && r.zones[1] < r.zones[2])) return 'Defensible space zones must grow outward: zone 1 < zone 2 < zone 3.'
      e.fireRules = r
      return ''
    }
    case 'addUtility': {
      const u = op.utility
      const list = e.utilities ?? []
      if (!ID.test(u.id)) return 'Utility ids use lowercase letters, numbers, and hyphens.'
      if (list.some(x => x.id === u.id)) return `A utility with id "${u.id}" already exists.`
      if (!u.name?.trim()) return 'A new utility needs a name.'
      if (!UTILITY_KINDS.includes(u.kind)) return `Utility kind must be one of: ${UTILITY_KINDS.join(', ')}.`
      const bad = checkSize(u.rect.w, u.rect.d, e.parcel.size) || checkInside(e, u.rect) || checkUtility(e, u.capacity, u.serves)
      if (bad) return bad
      e.utilities = [...list, { id: u.id, name: u.name, kind: u.kind, rect: { ...u.rect }, capacity: u.capacity, serves: [...u.serves], ...(u.kind === 'septic' && u.pumped ? { pumped: true } : {}) }]
      return ''
    }
    case 'moveUtility': {
      const u = (e.utilities ?? []).find(x => x.id === op.utilityId)
      if (!u) return `No utility with id "${op.utilityId}".`
      if (!finite(op.dx, op.dy)) return 'Move distances must be numbers.'
      u.rect = translate(u.rect, op.dx, op.dy)
      return checkInside(e, u.rect)
    }
    case 'resizeUtility': {
      const u = (e.utilities ?? []).find(x => x.id === op.utilityId)
      if (!u) return `No utility with id "${op.utilityId}".`
      if (!ANCHORS.includes(op.anchor)) return `Unknown anchor "${op.anchor}".`
      const bad = checkSize(op.w, op.d, e.parcel.size)
      if (bad) return bad
      u.rect = resizeRect(u.rect, op.w, op.d, op.anchor)
      return checkInside(e, u.rect)
    }
    case 'setUtility': {
      const u = (e.utilities ?? []).find(x => x.id === op.utilityId)
      if (!u) return `No utility with id "${op.utilityId}".`
      const bad = checkUtility(e, op.capacity, op.serves)
      if (bad) return bad
      u.capacity = op.capacity
      u.serves = [...new Set(op.serves)]
      if (op.pumped !== undefined) { if (u.kind === 'septic' && op.pumped) u.pumped = true; else delete u.pumped }
      return ''
    }
    case 'removeUtility': {
      if (!(e.utilities ?? []).some(u => u.id === op.utilityId)) return `No utility with id "${op.utilityId}".`
      e.utilities = (e.utilities ?? []).filter(u => u.id !== op.utilityId)
      return ''
    }
    case 'addDevice': {
      const d = op.device
      const list = e.security ?? []
      if (!ID.test(d.id)) return 'Device ids use lowercase letters, numbers, and hyphens.'
      if (list.some(x => x.id === d.id)) return `A device with id "${d.id}" already exists.`
      if (!d.name?.trim()) return 'A new device needs a name.'
      if (d.kind !== 'camera' && d.kind !== 'light') return 'Kind must be camera or light.'
      if (!['grid', 'backup', 'solar'].includes(d.power)) return 'Power must be grid, backup, or solar.'
      if (!finite(d.at.x, d.at.y) || d.at.x < 0 || d.at.y < 0 || d.at.x > e.parcel.size || d.at.y > e.parcel.size) return 'The device must be inside the parcel.'
      const bad = checkReach(d.range) || (d.kind === 'camera' ? checkAim(d.facing ?? 0, d.fov ?? 90) : '')
      if (bad) return bad
      if (d.on && !e.buildings.some(b => b.id === d.on)) return `No building with id "${d.on}".`
      e.security = [...list, { ...d, at: { ...d.at }, ...(d.kind === 'camera' ? { facing: d.facing ?? 0, fov: d.fov ?? 90 } : {}) }]
      return ''
    }
    case 'moveDevice': {
      const d = (e.security ?? []).find(x => x.id === op.deviceId)
      if (!d) return `No camera or light with id "${op.deviceId}".`
      if (!finite(op.dx, op.dy)) return 'Move distances must be numbers.'
      d.at = { x: d.at.x + op.dx, y: d.at.y + op.dy }
      if (d.at.x < 0 || d.at.y < 0 || d.at.x > e.parcel.size || d.at.y > e.parcel.size) return 'The device must stay inside the parcel.'
      return ''
    }
    case 'aimCamera': {
      const d = (e.security ?? []).find(x => x.id === op.deviceId)
      if (!d) return `No camera with id "${op.deviceId}".`
      if (d.kind !== 'camera') return `${d.name} is a light, not a camera.`
      const bad = checkAim(op.facing, op.fov) || checkReach(op.range)
      if (bad) return bad
      d.facing = ((op.facing % 360) + 360) % 360
      d.fov = op.fov
      d.range = op.range
      return ''
    }
    case 'removeDevice': {
      if (!(e.security ?? []).some(d => d.id === op.deviceId)) return `No camera or light with id "${op.deviceId}".`
      e.security = (e.security ?? []).filter(d => d.id !== op.deviceId)
      return ''
    }
    case 'setOccupancy': {
      const b = e.buildings.find(x => x.id === op.buildingId)
      if (!b) return `No building with id "${op.buildingId}".`
      if (!finite(op.beds, op.staff) || op.beds < 0 || op.staff < 0 || op.beds > 5000 || op.staff > 5000) return 'Beds and staff must be between 0 and 5,000.'
      b.beds = Math.round(op.beds)
      b.staff = Math.round(op.staff)
      b.backupPower = !!op.backupPower
      return ''
    }
    case 'setUtilityRule': {
      if (!UTILITY_RULE_NAMES.includes(op.rule)) return `Rule must be one of: ${UTILITY_RULE_NAMES.join(', ')}.`
      if (!finite(op.value) || op.value <= 0 || op.value > 1_000_000) return 'Rule values must be positive numbers.'
      if (op.rule === 'backupShare' && op.value > 1) return 'backupShare is a fraction from 0 to 1.'
      if (op.rule === 'wellPumpHours' && op.value > 24) return 'wellPumpHours is at most 24.'
      e.utilityRules = { ...e.utilityRules, [op.rule]: op.value }
      return ''
    }
    case 'addBeam': {
      const b = op.beam
      if (!ID.test(b.id)) return 'Beam ids use lowercase letters, numbers, and hyphens.'
      if (allHousesOf(e).some(h => (h.beams ?? []).some(x => x.id === b.id))) return `A beam with id "${b.id}" already exists.`
      if (!e.house.levels.some(l => l.id === b.levelId)) return `No level with id "${b.levelId}".`
      if (b.orientation !== 'h' && b.orientation !== 'v') return 'Orientation must be h (east-west) or v (north-south).'
      if (!BEAM_MATERIALS.includes(b.material)) return `Material must be one of: ${BEAM_MATERIALS.join(', ')}.`
      if (!finite(b.at, b.from, b.to) || b.to - b.from < 12 || b.to - b.from > 12 * 120) return 'A beam runs from 1 to 120 ft, with to after from.'
      const posts = (b.posts ?? []).filter(p => p > b.from && p < b.to)
      e.house.beams = [...(e.house.beams ?? []), { id: b.id, levelId: b.levelId, orientation: b.orientation, at: b.at, from: b.from, to: b.to, material: b.material, ...(posts.length ? { posts } : {}) }]
      return ''
    }
    case 'removeBeam': {
      if (!(e.house.beams ?? []).some(b => b.id === op.beamId)) return `No beam with id "${op.beamId}".`
      e.house.beams = (e.house.beams ?? []).filter(b => b.id !== op.beamId)
      return ''
    }
    case 'setBeam': {
      const b = (e.house.beams ?? []).find(x => x.id === op.beamId)
      if (!b) return `No beam with id "${op.beamId}".`
      if (!BEAM_MATERIALS.includes(op.material)) return `Material must be one of: ${BEAM_MATERIALS.join(', ')}.`
      if (!Array.isArray(op.posts) || !op.posts.every(p => finite(p))) return 'Posts must be positions along the beam.'
      const outside = op.posts.filter(p => p <= b.from || p >= b.to)
      if (outside.length) return `Posts must sit between the beam's ends, ${feet(b.from)} and ${feet(b.to)}.`
      b.material = op.material
      if (op.posts.length) b.posts = [...op.posts].sort((x, y) => x - y); else delete b.posts
      return ''
    }
    case 'fitBeams': {
      if (e.house.buildingId !== op.buildingId) return `No house with id "${op.buildingId}".`
      e.house.beams = firstPassBeams({ ...e.house, beams: undefined })
      return ''
    }
    case 'addFurniture': {
      const it = op.item
      if (!ID.test(it.id)) return 'Furniture ids use lowercase letters, numbers, and hyphens.'
      if (allHousesOf(e).some(h => (h.furniture ?? []).some(x => x.id === it.id))) return `A piece with id "${it.id}" already exists.`
      if (!CATALOG[it.kind]) return `Unknown piece "${it.kind}". Kinds: ${Object.keys(CATALOG).join(', ')}.`
      if (!findRoom(e, it.roomId)) return `No room with id "${it.roomId}".`
      if (!finite(it.x, it.y)) return 'Position must be numbers.'
      if (![0, 90, 180, 270].includes(it.rotation)) return 'Rotation must be 0, 90, 180, or 270.'
      e.house.furniture = [...(e.house.furniture ?? []), { id: it.id, kind: it.kind, roomId: it.roomId, x: it.x, y: it.y, rotation: it.rotation }]
      return ''
    }
    case 'moveFurniture': {
      const it = (e.house.furniture ?? []).find(x => x.id === op.itemId)
      if (!it) return `No piece with id "${op.itemId}".`
      if (!finite(op.dx, op.dy)) return 'Move distances must be numbers.'
      it.x += op.dx
      it.y += op.dy
      return ''
    }
    case 'rotateFurniture': {
      const it = (e.house.furniture ?? []).find(x => x.id === op.itemId)
      if (!it) return `No piece with id "${op.itemId}".`
      if (![0, 90, 180, 270].includes(op.rotation)) return 'Rotation must be 0, 90, 180, or 270.'
      it.rotation = op.rotation
      return ''
    }
    case 'removeFurniture': {
      if (!(e.house.furniture ?? []).some(x => x.id === op.itemId)) return `No piece with id "${op.itemId}".`
      e.house.furniture = (e.house.furniture ?? []).filter(x => x.id !== op.itemId)
      return ''
    }
    case 'furnishRoom': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      const others = (e.house.furniture ?? []).filter(x => x.roomId !== op.roomId)
      const used = new Set(others.map(x => x.id))
      let start = 1
      const fresh = furnishRoom(e.house, found.room, start)
      // Keep ids unique if a piece elsewhere happens to share one.
      while (fresh.some(x => used.has(x.id))) { start += 100; fresh.splice(0, fresh.length, ...furnishRoom(e.house, found.room, start)) }
      e.house.furniture = [...others, ...fresh]
      return ''
    }
    case 'setExcavated': {
      if (e.house.buildingId !== op.buildingId) return `No house with id "${op.buildingId}".`
      e.house.excavated = !!op.excavated
      return ''
    }
    case 'setSwale': {
      const b = e.buildings.find(x => x.id === op.buildingId)
      if (!b) return `No building with id "${op.buildingId}".`
      if (op.swale) b.swale = true
      else delete b.swale
      return ''
    }
    case 'setCeiling': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      if (!op.ceiling) { delete found.room.ceiling; return '' }
      const c = op.ceiling
      if (!(CEILING_FORMS as readonly string[]).includes(c.form)) return `Unknown ceiling form "${c.form}". Use ${CEILING_FORMS.join(', ')}.`
      if (!finite(c.height) || c.height < 6 * 12 || c.height > 60 * 12) return 'Ceiling height must be between 6 and 60 ft.'
      if (c.ridge && c.ridge !== 'ew' && c.ridge !== 'ns') return 'Ridge is ew or ns.'
      if (c.spacing !== undefined && (!finite(c.spacing) || c.spacing < 0 || (c.spacing > 0 && c.spacing < 24))) return 'Truss or beam spacing is 0 (none) or at least 2 ft.'
      found.room.ceiling = { form: c.form, height: c.height, ...(c.ridge ? { ridge: c.ridge } : {}), ...(c.spacing !== undefined ? { spacing: c.spacing } : {}) }
      return ''
    }
    case 'setSafeRoom': {
      const found = findRoom(e, op.roomId)
      if (!found) return `No room with id "${op.roomId}".`
      if (op.safeRoom) found.room.safeRoom = true
      else delete found.room.safeRoom
      return ''
    }
    default:
      return `Unknown edit "${(op as { op: string }).op}".`
  }
}

function intersection(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const d = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y)
  return `${feet(w)} × ${feet(d)}`
}

/** Every overlapping pair of rooms on the same level and of buildings on the site, keyed so pairs can be compared. */
function collisions(e: Estate): Map<string, string> {
  const found = new Map<string, string>()
  for (const level of allHouses(e).flatMap(h => h.levels)) level.rooms.forEach((a, i) => level.rooms.slice(i + 1).forEach(b => {
    if ((a.wingId ?? '') === (b.wingId ?? '') && overlaps(a.rect, b.rect)) found.set(`room:${[a.id, b.id].sort().join('|')}`, `${a.name} (${a.id}) and ${b.name} (${b.id}) would overlap by ${intersection(a.rect, b.rect)} on the ${level.name.toLowerCase()}`)
  }))
  e.buildings.forEach((a, i) => e.buildings.slice(i + 1).forEach(b => {
    for (const pa of footprintOf(a)) for (const pb of footprintOf(b)) {
      if (overlaps(pa, pb)) { found.set(`building:${[a.id, b.id].sort().join('|')}`, `${a.name} (${a.id}) and ${b.name} (${b.id}) would overlap by ${intersection(pa, pb)}`); return }
    }
  }))
  // Utilities take ground of their own: they may not sit on a building or on each other.
  const utilities = e.utilities ?? []
  utilities.forEach((u, i) => {
    for (const b of e.buildings) if (footprintOf(b).some(p => overlaps(p, u.rect))) found.set(`utility:${u.id}|${b.id}`, `${u.name} (${u.id}) would sit on ${b.name} (${b.id})`)
    for (const v of utilities.slice(i + 1)) if (overlaps(u.rect, v.rect)) found.set(`utility:${[u.id, v.id].sort().join('|')}`, `${u.name} (${u.id}) and ${v.name} (${v.id}) would overlap by ${intersection(u.rect, v.rect)}`)
  })
  return found
}

/**
 * Applies operations in order to a copy of the estate and returns the new estate. The input is never changed.
 * All or nothing: if any operation is invalid, or the finished set makes rooms or buildings overlap that did not
 * overlap before, nothing is applied and the error says why. Overlaps are checked on the whole set, so
 * "shrink the great room, then widen the kitchen" works in either order.
 */
export function applyOperations(estate: Estate, ops: EditOp[]): EditResult {
  const working = structuredClone(estate)
  for (const [index, op] of ops.entries()) {
    const error = run(working, op)
    if (error) return { ok: false, index, error: ops.length > 1 ? `Edit ${index + 1} (${op.op}): ${error}` : error }
  }
  const result = withDerivedGeometry(working)
  const before = collisions(estate)
  const added = [...collisions(result)].filter(([key]) => !before.has(key)).map(([, text]) => text)
  if (added.length) return { ok: false, error: `Not applied: ${added.join('; ')}. Shrink or move the neighbor in the same set of edits, or choose another size or place.` }
  // Doors and windows that fit before must still fit, and new ones must fit.
  const fitted = new Set(allHouses(estate).flatMap(h => placeOpenings(h)).filter(o => !o.problem).map(o => o.id))
  const known = new Set(allHouses(estate).flatMap(h => h.openings).map(o => o.id))
  const broken = allHouses(result).flatMap(h => placeOpenings(h)).filter(o => o.problem && (fitted.has(o.id) || !known.has(o.id)))
  if (broken.length) return { ok: false, error: `Not applied: ${broken.map(o => `${o.id} would not fit because ${o.problem}`).join('; ')}. Move, resize, or remove it in the same set of edits.` }
  return { ok: true, estate: result }
}

/** One operation. Same rules as applyOperations. */
export const applyEdit = (estate: Estate, op: EditOp): EditResult => applyOperations(estate, [op])

const feet = (inches: number) => {
  const v = Math.round(toFt(Math.abs(inches)) * 10) / 10
  return `${v.toLocaleString('en-US')} ft`
}
const direction = (dx: number, dy: number) => [
  dx ? `${feet(dx)} ${dx > 0 ? 'east' : 'west'}` : '',
  dy ? `${feet(dy)} ${dy > 0 ? 'north' : 'south'}` : '',
].filter(Boolean).join(' and ') || 'nowhere'
const ANCHOR_WORDS: Record<Anchor, string> = {
  sw: 'southwest corner', s: 'south edge', se: 'southeast corner', w: 'west edge', center: 'center',
  e: 'east edge', nw: 'northwest corner', n: 'north edge', ne: 'northeast corner',
}

/** Plain-language description of an edit, using names from the estate it applies to. */
export function describeEdit(op: EditOp, e: Estate): string {
  const building = (id: string) => e.buildings.find(b => b.id === id)?.name ?? id
  const room = (id: string) => houseOfRoom(e, id)?.levels.flatMap(l => l.rooms).find(r => r.id === id)?.name ?? id
  const utility = (id: string) => (e.utilities ?? []).find(u => u.id === id)?.name ?? id
  const device = (id: string) => (e.security ?? []).find(d => d.id === id)?.name ?? id
  const furniture = (id: string) => { const it = allHouses(e).flatMap(h => h.furniture ?? []).find(x => x.id === id); return it ? `the ${CATALOG[it.kind]?.name.toLowerCase() ?? it.kind} in ${room(it.roomId)}` : id }
  switch (op.op) {
    case 'moveBuilding': return `Move ${building(op.buildingId)} ${direction(op.dx, op.dy)}`
    case 'resizeBuilding': return `Resize ${building(op.buildingId)} to ${feet(op.w)} × ${feet(op.d)}, keeping its ${ANCHOR_WORDS[op.anchor]}`
    case 'moveRoom': return `Move ${room(op.roomId)} ${direction(op.dx, op.dy)}`
    case 'resizeRoom': return `Resize ${room(op.roomId)} to ${feet(op.w)} × ${feet(op.d)}, keeping its ${ANCHOR_WORDS[op.anchor]}`
    case 'addRoom': {
      const house = allHouses(e).find(h => h.levels.some(l => l.id === op.levelId))
      const level = house?.levels.find(l => l.id === op.levelId)?.name ?? op.levelId
      const where = house && house !== e.house ? ` of the ${building(house.buildingId).toLowerCase()}` : ''
      return `Add ${op.room.name} (${feet(op.room.rect.w)} × ${feet(op.room.rect.d)}) to the ${level.toLowerCase()}${where}`
    }
    case 'removeRoom': return `Remove ${room(op.roomId)}`
    case 'renameRoom': return `Rename ${room(op.roomId)} to ${op.name}`
    case 'setRoomType': return `Make ${room(op.roomId)} a ${op.type} room`
    case 'addDoor': case 'addWindow': {
      const o = op.opening
      const what = o.kind === 'window' ? 'window' : o.kind === 'garage-door' ? 'garage door' : o.kind === 'opening' ? 'cased opening' : 'door'
      return `Add a ${feet(o.width)} × ${feet(o.height)} ${what} (${o.id}) on the ${SIDE_WORD[o.side]} wall of ${room(o.roomId)}`
    }
    case 'moveOpening': return `Move ${op.openingId} to ${feet(op.offset)} along the ${SIDE_WORD[op.side]} wall of ${room(allHouses(e).flatMap(h => h.openings).find(o => o.id === op.openingId)?.roomId ?? '')}`
    case 'resizeOpening': return `Resize ${op.openingId} to ${feet(op.width)} × ${feet(op.height)}${op.sill ? `, sill ${feet(op.sill)}` : ''}`
    case 'removeOpening': return `Remove ${op.openingId}`
    case 'moveWall': return `Move the ${SIDE_WORD[op.side]} wall of ${room(op.roomId)} ${feet(op.distance)} ${op.distance > 0 ? 'out' : 'in'}`
    case 'setWallThickness': return `Make ${op.kind} walls ${op.thickness} in thick`
    case 'addRoad': return `Add ${op.road.name} (${feet(op.road.width ?? 240)} wide${op.road.turnaround ? ', turnaround at its end' : ''})`
    case 'removeRoad': return `Remove ${e.roads.find(r => r.id === op.roadId)?.name ?? op.roadId}`
    case 'setRoadWidth': return `Make ${e.roads.find(r => r.id === op.roadId)?.name ?? op.roadId} ${feet(op.width)} wide`
    case 'setTurnaround': return `${op.turnaround ? 'Add' : 'Remove'} a turnaround at the end of ${e.roads.find(r => r.id === op.roadId)?.name ?? op.roadId}`
    case 'addWaterSource': return `Add ${op.source.name}, ${op.source.gallons.toLocaleString('en-US')} gallons`
    case 'removeWaterSource': return `Remove ${(e.waterSources ?? []).find(w => w.id === op.sourceId)?.name ?? op.sourceId}`
    case 'setIgnition': return `Set ${e.buildings.find(b => b.id === op.buildingId)?.name ?? op.buildingId} to a class ${op.ignition.roofClass} roof, ${op.ignition.emberVents ? 'ember-resistant' : 'standard'} vents, ${op.ignition.enclosedEaves ? 'boxed' : 'open'} eaves, ${op.ignition.decks === 'none' ? 'no' : op.ignition.decks} decks`
    case 'setFireRule': return `Set fire rule ${op.rule} to ${op.value.toLocaleString('en-US')}`
    case 'addUtility': return `Add ${op.utility.name} (${op.utility.kind}, ${op.utility.capacity.toLocaleString('en-US')} ${UTILITY_UNIT[op.utility.kind]}, ${feet(op.utility.rect.w)} × ${feet(op.utility.rect.d)})`
    case 'moveUtility': return `Move ${utility(op.utilityId)} ${direction(op.dx, op.dy)}`
    case 'resizeUtility': return `Resize ${utility(op.utilityId)} to ${feet(op.w)} × ${feet(op.d)}, keeping its ${ANCHOR_WORDS[op.anchor]}`
    case 'setUtility': {
      const kind = (e.utilities ?? []).find(u => u.id === op.utilityId)?.kind
      return `Set ${utility(op.utilityId)} to ${op.capacity.toLocaleString('en-US')} ${kind ? UTILITY_UNIT[kind] : ''}, serving ${op.serves.map(building).join(', ') || 'no buildings'}${kind === 'septic' && op.pumped !== undefined ? (op.pumped ? ', pumped' : ', by gravity') : ''}`
    }
    case 'removeUtility': return `Remove ${utility(op.utilityId)}`
    case 'addDevice': return `Add ${op.device.name}${op.device.kind === 'camera' ? `, facing ${Math.round(op.device.facing ?? 0)}°, ${op.device.fov ?? 90}° view` : ''}, ${feet(op.device.range)} reach`
    case 'moveDevice': return `Move ${device(op.deviceId)} ${direction(op.dx, op.dy)}`
    case 'aimCamera': return `Aim ${device(op.deviceId)} at ${Math.round(op.facing)}° with a ${op.fov}° view and ${feet(op.range)} range`
    case 'removeDevice': return `Remove ${device(op.deviceId)}`
    case 'setOccupancy': return `Set ${building(op.buildingId)} to ${op.beds} sleeping and ${op.staff} by day${op.backupPower ? ', on backup power' : ', no backup power'}`
    case 'setUtilityRule': return `Set utility rule ${op.rule} to ${op.value.toLocaleString('en-US')}`
    case 'addBeam': return `Add a ${feet(op.beam.to - op.beam.from)} ${op.beam.material} beam (${op.beam.id}) under the ${allHouses(e).flatMap(h => h.levels).find(l => l.id === op.beam.levelId)?.name.toLowerCase() ?? op.beam.levelId}`
    case 'removeBeam': return `Remove beam ${op.beamId}`
    case 'setBeam': return `Make beam ${op.beamId} ${op.material}${op.posts.length ? ` with ${op.posts.length} post${op.posts.length === 1 ? '' : 's'} at ${op.posts.map(p => feet(p)).join(', ')}` : ', no posts'}`
    case 'addFurniture': return `Add ${CATALOG[op.item.kind]?.name.toLowerCase() ?? op.item.kind} (${op.item.id}) to ${room(op.item.roomId)}`
    case 'moveFurniture': return `Move ${furniture(op.itemId)} ${direction(op.dx, op.dy)}`
    case 'rotateFurniture': return `Turn ${furniture(op.itemId)} to face ${({ 0: 'north', 90: 'west', 180: 'south', 270: 'east' } as const)[op.rotation]}`
    case 'removeFurniture': return `Remove ${furniture(op.itemId)}`
    case 'furnishRoom': return `Furnish ${room(op.roomId)} again from the first pass`
    case 'fitBeams': return `Redo the beams of the ${building(op.buildingId).toLowerCase()} from its walls`
    case 'setExcavated': return op.excavated ? `Excavate the ${building(op.buildingId).toLowerCase()} site to its walkout, with retaining walls` : `Rely on the natural fall of the land at the ${building(op.buildingId).toLowerCase()}`
    case 'setSwale': return `${op.swale ? 'Add' : 'Remove'} a drainage swale around ${building(op.buildingId)}`
    case 'setCeiling': return op.ceiling ? `Give ${room(op.roomId)} a ${op.ceiling.form} ceiling at ${feet(op.ceiling.height)}` : `Give ${room(op.roomId)} a plain flat ceiling`
    case 'setSafeRoom': return op.safeRoom ? `Make ${room(op.roomId)} the safe room` : `${room(op.roomId)} is no longer a safe room`
    case 'setRoof': {
      const name = allHouses(e).flatMap(h => h.roofs).find(r => r.id === op.roofId)?.name ?? op.roofId
      const shape = op.form === 'shed' ? `shed sloping down to the ${SIDE_WORD[op.low]}` : `${op.form} with its ridge running ${op.ridge === 'ew' ? 'east-west' : 'north-south'}`
      return `Make the ${name.toLowerCase()} a ${op.pitch}:12 ${shape}, ${feet(op.overhang)} overhang`
    }
  }
}

/** Describes each edit against the estate as it stands just before that edit. */
export function describeEdits(ops: EditOp[], e: Estate): string[] {
  const current = structuredClone(e)
  return ops.map(op => {
    const text = describeEdit(op, current)
    run(current, op)
    return text
  })
}
