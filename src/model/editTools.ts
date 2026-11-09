import type { EditOp } from './edits'
import { ANCHORS, DOOR_KINDS, ROOM_TYPES, SIDES, WALL_KINDS, WINDOW_OPERATIONS } from './edits'

/**
 * Tool definitions for the chat editor. Claude works in feet, which it handles more reliably;
 * `toEditOp` converts to the model's inches. Plain JSON Schema, no SDK types, so the model stays SDK-free.
 */
export interface EditToolSpec { name: EditOp['op']; description: string; input_schema: Record<string, unknown> }

const num = (description: string) => ({ type: 'number', description })
const str = (description: string) => ({ type: 'string', description })
const anchor = { type: 'string', enum: ANCHORS, description: 'Point that stays fixed: sw, s, se, w, center, e, nw, n, ne. For example n keeps the north edge in place and grows or shrinks to the south.' }
const side = { type: 'string', enum: SIDES, description: 'Side of the room: n, s, e, or w.' }
const offset = num('Distance in feet from the start of that side (its west end for n and s sides, its south end for e and w sides) to the center of the opening.')
const object = (properties: Record<string, unknown>) =>
  ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

export const EDIT_TOOLS: EditToolSpec[] = [
  {
    name: 'moveBuilding',
    description: 'Move a building on the site by an offset in feet. Moving the main house moves all of its rooms. Covered walkways attached to the building follow it.',
    input_schema: object({ buildingId: str('Building id from the model summary.'), eastFt: num('Feet to move east. Negative moves west.'), northFt: num('Feet to move north. Negative moves south.') }),
  },
  {
    name: 'resizeBuilding',
    description: 'Set a building footprint to a new east-west width and north-south depth in feet. Not available for the main house, whose outline comes from its rooms.',
    input_schema: object({ buildingId: str('Building id from the model summary.'), widthFt: num('New east-west width in feet.'), depthFt: num('New north-south depth in feet.'), anchor }),
  },
  {
    name: 'moveRoom',
    description: 'Move a room of the main house within its level by an offset in feet.',
    input_schema: object({ roomId: str('Room id from the model summary.'), eastFt: num('Feet to move east. Negative moves west.'), northFt: num('Feet to move north. Negative moves south.') }),
  },
  {
    name: 'resizeRoom',
    description: 'Set a room of the main house to a new east-west width and north-south depth in feet. It does not move neighboring rooms. Rooms on the same level may not overlap, so when a room grows into a neighbor, shrink or move that neighbor in the same set of edits.',
    input_schema: object({ roomId: str('Room id from the model summary.'), widthFt: num('New east-west width in feet.'), depthFt: num('New north-south depth in feet.'), anchor }),
  },
  {
    name: 'addRoom',
    description: 'Add a rectangular room to one level of the main house. Position is the southwest corner in house-local feet.',
    input_schema: object({
      levelId: str('Level id from the model summary.'),
      id: str('New unique room id: lowercase letters, numbers, and hyphens.'),
      name: str('Room name shown on the plan.'),
      type: { type: 'string', enum: ROOM_TYPES, description: 'Room type.' },
      xFt: num('House-local east coordinate of the southwest corner, in feet.'),
      yFt: num('House-local north coordinate of the southwest corner, in feet.'),
      widthFt: num('East-west width in feet.'),
      depthFt: num('North-south depth in feet.'),
      bathId: { type: ['string', 'null'], description: 'For a bedroom, the id of its own bathroom. Otherwise null.' },
    }),
  },
  {
    name: 'removeRoom',
    description: 'Remove a room from the main house.',
    input_schema: object({ roomId: str('Room id from the model summary.') }),
  },
  {
    name: 'renameRoom',
    description: 'Change the name of a room in the main house.',
    input_schema: object({ roomId: str('Room id from the model summary.'), name: str('New room name.') }),
  },
  {
    name: 'setRoomType',
    description: 'Change the type of a room in the main house, for example from service to wellness.',
    input_schema: object({ roomId: str('Room id from the model summary.'), type: { type: 'string', enum: ROOM_TYPES, description: 'New room type.' } }),
  },
  {
    name: 'addDoor',
    description: 'Add a door, cased opening, or garage door in a wall of a room. It connects to whatever is on the other side of that wall. Must fit on one wall without crossing a corner or another opening.',
    input_schema: object({
      id: str('New unique opening id: lowercase letters, numbers, and hyphens.'),
      kind: { type: 'string', enum: DOOR_KINDS, description: 'door, opening (cased, no door), or garage-door.' },
      roomId: str('Room id the door is hosted on.'), side, offsetFt: offset,
      widthFt: num('Door width in feet. Typical: 2.67 for baths, 3 for rooms, 3.5 for an entry, 6 for a patio door.'),
      heightFt: num('Door height in feet. Typical: 6.67 or 8.'),
      swing: { type: 'string', enum: ['in', 'out', 'none'], description: 'Swings into the host room (in) or out of it (out). none for openings and garage doors.' },
    }),
  },
  {
    name: 'addWindow',
    description: 'Add a window in an outside wall of a room. Bedroom windows need enough clear opening to escape through.',
    input_schema: object({
      id: str('New unique opening id: lowercase letters, numbers, and hyphens.'),
      roomId: str('Room id the window is in.'), side, offsetFt: offset,
      widthFt: num('Window width in feet.'), heightFt: num('Window height in feet.'),
      sillFt: num('Height of the sill above the floor in feet. Bedroom escape windows need 3.67 or lower.'),
      operation: { type: 'string', enum: WINDOW_OPERATIONS, description: 'How it opens. Casement gives the most clear opening.' },
    }),
  },
  {
    name: 'moveOpening',
    description: 'Move an existing door or window along its wall, or to another side of its room.',
    input_schema: object({ openingId: str('Opening id from the model summary.'), side, offsetFt: offset }),
  },
  {
    name: 'resizeOpening',
    description: 'Change the size of an existing door or window. Doors keep a sill of 0.',
    input_schema: object({ openingId: str('Opening id from the model summary.'), widthFt: num('New width in feet.'), heightFt: num('New height in feet.'), sillFt: num('Sill height in feet. 0 for doors.') }),
  },
  {
    name: 'removeOpening',
    description: 'Remove a door, window, or opening.',
    input_schema: object({ openingId: str('Opening id from the model summary.') }),
  },
  {
    name: 'moveWall',
    description: 'Move one wall of a room in or out. The room grows or shrinks, and any room on the other side of that wall gives or takes the same space. Use this for requests like "make the kitchen 10 ft wider" when a neighbor should give up the room.',
    input_schema: object({ roomId: str('Room id from the model summary.'), side, distanceFt: num('Feet to move the wall. Positive moves it outward and makes the room bigger.') }),
  },
  {
    name: 'setWallThickness',
    description: 'Set the default thickness of one kind of wall for the whole house, in inches.',
    input_schema: object({ kind: { type: 'string', enum: WALL_KINDS, description: 'exterior, interior, or foundation.' }, thicknessIn: num('Thickness in inches, for example 8 for 2x6 framing with siding.') }),
  },
]

/** Feet to inches, rounded to 1/8 inch so repeated edits do not collect float noise. */
const inches = (feet: number) => Math.round(feet * 12 * 8) / 8

export type ToolConversion = { ok: true; op: EditOp } | { ok: false; error: string }

/** Turns one tool call into an edit operation, checking every field rather than trusting the caller. */
export function toEditOp(name: string, input: unknown): ToolConversion {
  const spec = EDIT_TOOLS.find(t => t.name === name)
  if (!spec) return { ok: false, error: `Unknown edit tool "${name}".` }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Tool input must be an object.' }
  const v = input as Record<string, unknown>
  const schema = spec.input_schema as { properties: Record<string, { type: string | string[] }> }
  for (const [key, prop] of Object.entries(schema.properties)) {
    const types = Array.isArray(prop.type) ? prop.type : [prop.type]
    const value = v[key]
    const ok = types.some(t => t === 'null' ? value === null : t === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === t)
    if (!ok) return { ok: false, error: `Field "${key}" must be ${types.join(' or ')}.` }
  }
  const extra = Object.keys(v).filter(k => !(k in schema.properties))
  if (extra.length) return { ok: false, error: `Unexpected field "${extra[0]}".` }

  const s = (k: string) => v[k] as string
  const n = (k: string) => v[k] as number
  switch (spec.name) {
    case 'moveBuilding': return { ok: true, op: { op: 'moveBuilding', buildingId: s('buildingId'), dx: inches(n('eastFt')), dy: inches(n('northFt')) } }
    case 'resizeBuilding': return { ok: true, op: { op: 'resizeBuilding', buildingId: s('buildingId'), w: inches(n('widthFt')), d: inches(n('depthFt')), anchor: s('anchor') as never } }
    case 'moveRoom': return { ok: true, op: { op: 'moveRoom', roomId: s('roomId'), dx: inches(n('eastFt')), dy: inches(n('northFt')) } }
    case 'resizeRoom': return { ok: true, op: { op: 'resizeRoom', roomId: s('roomId'), w: inches(n('widthFt')), d: inches(n('depthFt')), anchor: s('anchor') as never } }
    case 'addRoom': return {
      ok: true,
      op: {
        op: 'addRoom', levelId: s('levelId'),
        room: {
          id: s('id'), name: s('name'), type: s('type') as never,
          rect: { x: inches(n('xFt')), y: inches(n('yFt')), w: inches(n('widthFt')), d: inches(n('depthFt')) },
          ...(v.bathId ? { bathId: s('bathId') } : {}),
        },
      },
    }
    case 'removeRoom': return { ok: true, op: { op: 'removeRoom', roomId: s('roomId') } }
    case 'renameRoom': return { ok: true, op: { op: 'renameRoom', roomId: s('roomId'), name: s('name') } }
    case 'setRoomType': return { ok: true, op: { op: 'setRoomType', roomId: s('roomId'), type: s('type') as never } }
    case 'addDoor': return {
      ok: true,
      op: { op: 'addDoor', opening: {
        id: s('id'), kind: s('kind') as never, roomId: s('roomId'), side: s('side') as never, offset: inches(n('offsetFt')),
        width: inches(n('widthFt')), height: inches(n('heightFt')), sill: 0, ...(v.swing === 'in' || v.swing === 'out' ? { swing: s('swing') as never } : {}),
      } },
    }
    case 'addWindow': return {
      ok: true,
      op: { op: 'addWindow', opening: {
        id: s('id'), kind: 'window', roomId: s('roomId'), side: s('side') as never, offset: inches(n('offsetFt')),
        width: inches(n('widthFt')), height: inches(n('heightFt')), sill: inches(n('sillFt')), operation: s('operation') as never,
      } },
    }
    case 'moveOpening': return { ok: true, op: { op: 'moveOpening', openingId: s('openingId'), side: s('side') as never, offset: inches(n('offsetFt')) } }
    case 'resizeOpening': return { ok: true, op: { op: 'resizeOpening', openingId: s('openingId'), width: inches(n('widthFt')), height: inches(n('heightFt')), sill: inches(n('sillFt')) } }
    case 'removeOpening': return { ok: true, op: { op: 'removeOpening', openingId: s('openingId') } }
    case 'moveWall': return { ok: true, op: { op: 'moveWall', roomId: s('roomId'), side: s('side') as never, distance: inches(n('distanceFt')) } }
    case 'setWallThickness': return { ok: true, op: { op: 'setWallThickness', kind: s('kind') as never, thickness: n('thicknessIn') } }
  }
}
