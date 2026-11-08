import type { Estate, Inches, Rect, Room, RoomType } from './types'
import { overlaps, partsOf, toFt, translate } from './geometry'
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
      found.room.rect = resizeRect(found.room.rect, op.w, op.d, op.anchor)
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
    for (const pa of partsOf(a)) for (const pb of partsOf(b)) {
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
