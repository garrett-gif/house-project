import type { Building, Room, SecurityDevice, Side, Utility } from '../model/types'
import type { EditOp } from '../model/edits'
import type { PlacedOpening } from '../model/walls'

/**
 * Turning a pointer drag into one named edit. Everything here is in model inches; the views convert pointer
 * positions to inches before calling these. Snapping keeps hand edits on a tidy grid.
 */
export const snap = (inches: number, step: number) => Math.round(inches / step) * step

export type RoomGrab = { kind: 'room' } | { kind: 'wall'; side: Side }

/**
 * Where on a room a press landed: within `edge` inches of a side grabs that wall, otherwise the whole room.
 * Corners favor the nearer side.
 */
export function grabRoom(room: Room, x: number, y: number, edge = 15): RoomGrab {
  const { rect: r } = room
  const d: [Side, number][] = [['w', x - r.x], ['e', r.x + r.w - x], ['s', y - r.y], ['n', r.y + r.d - y]]
  const [side, dist] = d.sort((a, b) => a[1] - b[1])[0]
  return dist <= edge ? { kind: 'wall', side } : { kind: 'room' }
}

/** The edit for dragging a room, or one of its walls, by dx east and dy north. Null when it would not change anything. */
export function roomDragOp(room: Room, grab: RoomGrab, dx: number, dy: number, step = 6): EditOp | null {
  if (grab.kind === 'room') {
    const sx = snap(dx, step), sy = snap(dy, step)
    return sx || sy ? { op: 'moveRoom', roomId: room.id, dx: sx, dy: sy } : null
  }
  // Moving a wall outward makes the room bigger: east and north are positive for e and n, negative for w and s.
  const outward = grab.side === 'e' ? dx : grab.side === 'w' ? -dx : grab.side === 'n' ? dy : -dy
  const distance = snap(outward, step)
  return distance ? { op: 'moveWall', roomId: room.id, side: grab.side, distance } : null
}

/** The edit for sliding a door or window along its wall. Offsets are measured from the side's west or south end. */
export function openingDragOp(o: PlacedOpening, dx: number, dy: number, step = 3): EditOp | null {
  const along = o.orientation === 'h' ? dx : dy
  const shift = snap(along, step)
  return shift ? { op: 'moveOpening', openingId: o.id, side: o.side, offset: o.offset + shift } : null
}

/** The edit for dragging a building on the site. */
export function buildingDragOp(b: Building, dx: number, dy: number, step = 12): EditOp | null {
  const sx = snap(dx, step), sy = snap(dy, step)
  return sx || sy ? { op: 'moveBuilding', buildingId: b.id, dx: sx, dy: sy } : null
}

/** The edit for dragging a utility on the site, snapped to 1 ft. */
export function utilityDragOp(u: Utility, dx: number, dy: number, step = 12): EditOp | null {
  const sx = snap(dx, step), sy = snap(dy, step)
  return sx || sy ? { op: 'moveUtility', utilityId: u.id, dx: sx, dy: sy } : null
}

/** The edit for dragging a camera or light, snapped to 1 ft. */
export function deviceDragOp(d: SecurityDevice, dx: number, dy: number, step = 12): EditOp | null {
  const sx = snap(dx, step), sy = snap(dy, step)
  return sx || sy ? { op: 'moveDevice', deviceId: d.id, dx: sx, dy: sy } : null
}

export const cursorFor = (grab: RoomGrab) => grab.kind === 'room' ? 'move' : grab.side === 'e' || grab.side === 'w' ? 'ew-resize' : 'ns-resize'
