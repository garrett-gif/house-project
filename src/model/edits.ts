import type { Estate, Inches, Opening, OpeningKind, Rect, RoofForm, Room, RoomType, Side, WallKind, WindowOperation } from './types'
import { ROOF_FORMS } from './roofs'
import { SIDE_WORD, placeOpenings, sideLine } from './walls'
import { footprintOf, overlaps, toFt, translate } from './geometry'
import { withDerivedGeometry } from './derive'

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

function checkOpeningSize(width: number, height: number, sill: number) {
  if (!finite(width, height, sill)) return 'Opening sizes must be numbers.'
  if (width < 12 || height < 12) return 'Openings must be at least 1 ft wide and 1 ft tall.'
  if (width > 12 * 24 || height > 12 * 12) return 'Openings must be under 24 ft wide and 12 ft tall.'
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

/** Mutates a private copy. Returns an error message, or '' on success. */
function run(e: Estate, op: EditOp): string {
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
      return ''
    }
    case 'resizeBuilding': {
      const b = e.buildings.find(x => x.id === op.buildingId)
      if (!b) return `No building with id "${op.buildingId}".`
      if (b.id === e.house.buildingId) return 'The main house outline comes from its rooms. Resize or move rooms instead.'
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
  for (const level of e.house.levels) level.rooms.forEach((a, i) => level.rooms.slice(i + 1).forEach(b => {
    if (overlaps(a.rect, b.rect)) found.set(`room:${[a.id, b.id].sort().join('|')}`, `${a.name} (${a.id}) and ${b.name} (${b.id}) would overlap by ${intersection(a.rect, b.rect)} on the ${level.name.toLowerCase()}`)
  }))
  e.buildings.forEach((a, i) => e.buildings.slice(i + 1).forEach(b => {
    for (const pa of footprintOf(a)) for (const pb of footprintOf(b)) {
      if (overlaps(pa, pb)) { found.set(`building:${[a.id, b.id].sort().join('|')}`, `${a.name} (${a.id}) and ${b.name} (${b.id}) would overlap by ${intersection(pa, pb)}`); return }
    }
  }))
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
  const fitted = new Set(placeOpenings(estate.house).filter(o => !o.problem).map(o => o.id))
  const known = new Set(estate.house.openings.map(o => o.id))
  const broken = placeOpenings(result.house).filter(o => o.problem && (fitted.has(o.id) || !known.has(o.id)))
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
  const room = (id: string) => findRoom(e, id)?.room.name ?? id
  switch (op.op) {
    case 'moveBuilding': return `Move ${building(op.buildingId)} ${direction(op.dx, op.dy)}`
    case 'resizeBuilding': return `Resize ${building(op.buildingId)} to ${feet(op.w)} × ${feet(op.d)}, keeping its ${ANCHOR_WORDS[op.anchor]}`
    case 'moveRoom': return `Move ${room(op.roomId)} ${direction(op.dx, op.dy)}`
    case 'resizeRoom': return `Resize ${room(op.roomId)} to ${feet(op.w)} × ${feet(op.d)}, keeping its ${ANCHOR_WORDS[op.anchor]}`
    case 'addRoom': {
      const level = e.house.levels.find(l => l.id === op.levelId)?.name ?? op.levelId
      return `Add ${op.room.name} (${feet(op.room.rect.w)} × ${feet(op.room.rect.d)}) to the ${level.toLowerCase()}`
    }
    case 'removeRoom': return `Remove ${room(op.roomId)}`
    case 'renameRoom': return `Rename ${room(op.roomId)} to ${op.name}`
    case 'setRoomType': return `Make ${room(op.roomId)} a ${op.type} room`
    case 'addDoor': case 'addWindow': {
      const o = op.opening
      const what = o.kind === 'window' ? 'window' : o.kind === 'garage-door' ? 'garage door' : o.kind === 'opening' ? 'cased opening' : 'door'
      return `Add a ${feet(o.width)} × ${feet(o.height)} ${what} (${o.id}) on the ${SIDE_WORD[o.side]} wall of ${room(o.roomId)}`
    }
    case 'moveOpening': return `Move ${op.openingId} to ${feet(op.offset)} along the ${SIDE_WORD[op.side]} wall of ${room(e.house.openings.find(o => o.id === op.openingId)?.roomId ?? '')}`
    case 'resizeOpening': return `Resize ${op.openingId} to ${feet(op.width)} × ${feet(op.height)}${op.sill ? `, sill ${feet(op.sill)}` : ''}`
    case 'removeOpening': return `Remove ${op.openingId}`
    case 'moveWall': return `Move the ${SIDE_WORD[op.side]} wall of ${room(op.roomId)} ${feet(op.distance)} ${op.distance > 0 ? 'out' : 'in'}`
    case 'setWallThickness': return `Make ${op.kind} walls ${op.thickness} in thick`
    case 'setRoof': {
      const name = e.house.roofs.find(r => r.id === op.roofId)?.name ?? op.roofId
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
