import type { EditOp } from './edits'
import { ANCHORS, DOOR_KINDS, FIRE_RULE_NAMES, ROAD_KINDS, ROOM_TYPES, SIDES, WALL_KINDS, WINDOW_OPERATIONS } from './edits'
import { ROOF_FORMS } from './roofs'
import { UTILITY_KINDS, UTILITY_RULE_NAMES } from './utilities'
import { BEAM_MATERIALS } from './beams'
import { CATALOG } from './furniture'

const FACING = { north: 0, west: 90, south: 180, east: 270 } as const
const facing = { type: 'string', enum: Object.keys(FACING), description: 'Which way the front of the piece faces; its back goes to the opposite side.' }

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
const bool = (description: string) => ({ type: 'boolean', description })
const ids = (description: string) => ({ type: 'array', items: { type: 'string' }, description })
const CAPACITY = 'Capacity in the unit of its kind: well gpm, storage gallons, septic gallons a day of design flow, service, solar, and generator kW, propane tank gallons.'
const object = (properties: Record<string, unknown>) =>
  ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

export const EDIT_TOOLS: EditToolSpec[] = [
  {
    name: 'moveBuilding',
    description: 'Move a building on the site by an offset in feet. Moving the main house or guest house moves all of its rooms. Covered walkways attached to the building follow it.',
    input_schema: object({ buildingId: str('Building id from the model summary.'), eastFt: num('Feet to move east. Negative moves west.'), northFt: num('Feet to move north. Negative moves south.') }),
  },
  {
    name: 'resizeBuilding',
    description: 'Set a building footprint to a new east-west width and north-south depth in feet. Not available for the main house or guest house, whose outlines come from their rooms.',
    input_schema: object({ buildingId: str('Building id from the model summary.'), widthFt: num('New east-west width in feet.'), depthFt: num('New north-south depth in feet.'), anchor }),
  },
  {
    name: 'moveRoom',
    description: 'Move a room of the main house or guest house within its level by an offset in feet.',
    input_schema: object({ roomId: str('Room id from the model summary.'), eastFt: num('Feet to move east. Negative moves west.'), northFt: num('Feet to move north. Negative moves south.') }),
  },
  {
    name: 'resizeRoom',
    description: 'Set a room of the main house or guest house to a new east-west width and north-south depth in feet. It does not move neighboring rooms. Rooms on the same level may not overlap, so when a room grows into a neighbor, shrink or move that neighbor in the same set of edits.',
    input_schema: object({ roomId: str('Room id from the model summary.'), widthFt: num('New east-west width in feet.'), depthFt: num('New north-south depth in feet.'), anchor }),
  },
  {
    name: 'addRoom',
    description: 'Add a rectangular room to one level of the main house or guest house; the level id decides which. Position is the southwest corner in the house-local feet of that building.',
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
      wingId: { type: ['string', 'null'], description: 'Wing id from the model summary when the room belongs to a turned wing; its position is then in that wing’s own feet. Otherwise null.' },
    }),
  },
  {
    name: 'removeRoom',
    description: 'Remove a room from the main house or guest house.',
    input_schema: object({ roomId: str('Room id from the model summary.') }),
  },
  {
    name: 'renameRoom',
    description: 'Change the name of a room in the main house or guest house.',
    input_schema: object({ roomId: str('Room id from the model summary.'), name: str('New room name.') }),
  },
  {
    name: 'setRoomType',
    description: 'Change the type of a room in the main house or guest house, for example from service to wellness.',
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
  {
    name: 'setRoof',
    description: 'Change the shape of an existing roof: gable, hip, or shed, its pitch, which way the ridge runs, and the overhang. The area it covers stays the same.',
    input_schema: object({
      roofId: str('Roof id from the model summary.'),
      form: { type: 'string', enum: [...ROOF_FORMS], description: 'gable, hip, or shed.' },
      pitch: num('Rise in inches per 12 inches of run, for example 8 for an 8:12 roof.'),
      ridge: { type: 'string', enum: ['ew', 'ns'], description: 'For gable and hip roofs: ridge runs east-west (ew) or north-south (ns). Keep the current value for a shed.' },
      low: { type: 'string', enum: SIDES, description: 'For a shed roof: the side it slopes down toward. Keep the current value for gable and hip.' },
      overhangFt: num('Overhang past the walls in feet.'),
    }),
  },
  {
    name: 'addRoad',
    description: 'Add a road or fire lane on the site. Points are site feet: x east, y north from the southwest parcel corner, in driving order. Mark a turnaround at the last point if it dead-ends.',
    input_schema: object({
      id: str('New unique road id: lowercase letters, numbers, and hyphens.'),
      name: str('Road name.'),
      kind: { type: 'string', enum: ROAD_KINDS, description: 'estate for private roads, work for compound roads, perimeter, or gated-link.' },
      pointsFt: { type: 'array', items: { type: 'number' }, description: 'Flat list of site coordinates in feet: x1, y1, x2, y2, and so on. At least two points.' },
      widthFt: num('Drivable width in feet. Fire apparatus roads need at least the fire rule minimum, 20 ft by default.'),
      turnaround: bool('True if there is a turnaround for fire apparatus at the last point.'),
    }),
  },
  { name: 'removeRoad', description: 'Remove a road.', input_schema: object({ roadId: str('Road id from the model summary.') }) },
  { name: 'setRoadWidth', description: 'Change the drivable width of a road.', input_schema: object({ roadId: str('Road id from the model summary.'), widthFt: num('Width in feet.') }) },
  { name: 'setTurnaround', description: 'Add or remove a fire apparatus turnaround at the last point of a road.', input_schema: object({ roadId: str('Road id from the model summary.'), turnaround: bool('True to add, false to remove.') }) },
  {
    name: 'addWaterSource',
    description: 'Add fire water: a cistern, a pond dry hydrant, or a hydrant, at a site point in feet.',
    input_schema: object({
      id: str('New unique id: lowercase letters, numbers, and hyphens.'), name: str('Name.'),
      kind: { type: 'string', enum: ['cistern', 'pond', 'hydrant'], description: 'cistern, pond, or hydrant.' },
      xFt: num('Site x in feet, east from the southwest parcel corner.'), yFt: num('Site y in feet, north from the southwest parcel corner.'),
      gallons: num('Usable gallons.'),
    }),
  },
  { name: 'removeWaterSource', description: 'Remove a fire water source.', input_schema: object({ sourceId: str('Water source id from the model summary.') }) },
  {
    name: 'setIgnition',
    description: 'Set how a building resists embers and flame.',
    input_schema: object({
      buildingId: str('Building id from the model summary.'),
      roofClass: { type: 'string', enum: ['A', 'B', 'C', 'unrated'], description: 'Fire-tested roof class.' },
      emberVents: bool('True if vents are ember-resistant.'),
      enclosedEaves: bool('True if eaves are boxed in with soffits.'),
      decks: { type: 'string', enum: ['none', 'noncombustible', 'combustible'], description: 'Decks and porches.' },
    }),
  },
  {
    name: 'setFireRule',
    description: 'Replace one of the wildfire planning values with the owner\'s own standard. Zone distances, widths, and distances are in feet; gallons are gallons.',
    input_schema: object({ rule: { type: 'string', enum: [...FIRE_RULE_NAMES], description: 'Which rule.' }, value: num('New value.') }),
  },
  {
    name: 'addUtility',
    description: 'Add a utility on the site: a well, water storage tank, septic system (the rectangle is its drainfield, primary and reserve), grid power service, solar array, generator, or propane tank. The rectangle is in site feet and becomes cleared ground.',
    input_schema: object({
      id: str('New unique id: lowercase letters, numbers, and hyphens.'), name: str('Name.'),
      kind: { type: 'string', enum: UTILITY_KINDS, description: 'What it is.' },
      xFt: num('Site x of the southwest corner in feet.'), yFt: num('Site y of the southwest corner in feet.'),
      widthFt: num('East-west width in feet.'), depthFt: num('North-south depth in feet.'),
      capacity: num(CAPACITY), serves: ids('Ids of the buildings it serves. Empty for solar that feeds the grid service.'),
      pumped: bool('Septic only: true if effluent is pumped to the drainfield, so it may sit uphill. False otherwise.'),
    }),
  },
  { name: 'moveUtility', description: 'Move a utility by an offset in feet.', input_schema: object({ utilityId: str('Utility id from the model summary.'), eastFt: num('Feet east. Negative is west.'), northFt: num('Feet north. Negative is south.') }) },
  { name: 'resizeUtility', description: 'Resize a utility\'s rectangle, such as a drainfield or solar array.', input_schema: object({ utilityId: str('Utility id from the model summary.'), widthFt: num('East-west width in feet.'), depthFt: num('North-south depth in feet.'), anchor }) },
  { name: 'setUtility', description: 'Change a utility\'s capacity and the buildings it serves, and for septic whether it is pumped.', input_schema: object({ utilityId: str('Utility id from the model summary.'), capacity: num(CAPACITY), serves: ids('Ids of the buildings it serves.'), pumped: bool('Septic only: true if pumped to the drainfield. Ignored for other kinds.') }) },
  { name: 'removeUtility', description: 'Remove a utility.', input_schema: object({ utilityId: str('Utility id from the model summary.') }) },
  {
    name: 'addDevice',
    description: 'Add a security camera or a light at a site point in feet. Cameras look toward facingDeg (0 east, 90 north) across fovDeg; lights ignore both.',
    input_schema: object({
      id: str('New unique id: lowercase letters, numbers, and hyphens.'), name: str('Name.'),
      kind: { type: 'string', enum: ['camera', 'light'], description: 'camera or light.' },
      xFt: num('Site x in feet.'), yFt: num('Site y in feet.'), rangeFt: num('How far the camera sees or the light reaches, in feet.'),
      facingDeg: num('Camera direction in degrees: 0 east, 90 north, 180 west, 270 south.'), fovDeg: num('Camera field of view in degrees.'),
      power: { type: 'string', enum: ['grid', 'backup', 'solar'], description: 'What keeps it on: grid only, the backup generator, or its own solar panel and battery.' },
      onBuilding: { type: ['string', 'null'], description: 'Id of the building it is mounted on, which it then moves with, or null.' },
    }),
  },
  { name: 'moveDevice', description: 'Move a camera or light by an offset in feet.', input_schema: object({ deviceId: str('Device id from the model summary.'), eastFt: num('Feet east. Negative is west.'), northFt: num('Feet north. Negative is south.') }) },
  { name: 'aimCamera', description: 'Point a camera, and set its view and range.', input_schema: object({ deviceId: str('Camera id from the model summary.'), facingDeg: num('Direction in degrees: 0 east, 90 north, 180 west, 270 south.'), fovDeg: num('Field of view in degrees.'), rangeFt: num('Range in feet.') }) },
  { name: 'removeDevice', description: 'Remove a camera or light.', input_schema: object({ deviceId: str('Device id from the model summary.') }) },
  {
    name: 'setOccupancy',
    description: 'Set how many people sleep in a building and how many more are there by day at peak, and whether it must keep power in an outage. These drive water, septic, power, and parking demand.',
    input_schema: object({ buildingId: str('Building id from the model summary.'), beds: num('People sleeping there at peak.'), staff: num('Daytime staff, students, or visitors who do not sleep there.'), backupPower: bool('True if it must be on a generator.') }),
  },
  {
    name: 'setUtilityRule',
    description: 'Replace one of the utility or security planning values with the owner\'s or county\'s standard. Distances in feet, flows in gallons a day, backupShare as a fraction.',
    input_schema: object({ rule: { type: 'string', enum: UTILITY_RULE_NAMES, description: 'Which rule.' }, value: num('New value.') }),
  },
  { name: 'setExcavated', description: 'Set whether a house site is excavated down to its walkout, with retaining walls, instead of relying on the natural fall of the land.', input_schema: object({ buildingId: str('main-house or guest-house.'), excavated: bool('True to excavate.') }) },
  {
    name: 'addBeam',
    description: 'Add a beam in the floor framing under a level, carrying a wall of that level over open floor below. House-local feet: an east-west beam (h) runs along y = atFt from fromFt to toFt in x; a north-south beam (v) runs along x = atFt from fromFt to toFt in y.',
    input_schema: object({
      id: str('New unique id: lowercase letters, numbers, and hyphens.'), levelId: str('Level whose walls it carries, from the model summary.'),
      orientation: { type: 'string', enum: ['h', 'v'], description: 'h runs east-west, v runs north-south.' },
      atFt: num('The line it runs on, in house-local feet.'), fromFt: num('Start along the line, in feet.'), toFt: num('End along the line, in feet.'),
      material: { type: 'string', enum: BEAM_MATERIALS, description: 'lvl, glulam, or steel.' },
      postsFt: { type: 'array', items: { type: 'number' }, description: 'Post positions along the line, in feet, between from and to. Empty for none.' },
    }),
  },
  { name: 'removeBeam', description: 'Remove a beam.', input_schema: object({ beamId: str('Beam id from the model summary.') }) },
  { name: 'setBeam', description: 'Change a beam\'s material and its posts. Posts shorten its spans.', input_schema: object({ beamId: str('Beam id from the model summary.'), material: { type: 'string', enum: BEAM_MATERIALS, description: 'lvl, glulam, or steel.' }, postsFt: { type: 'array', items: { type: 'number' }, description: 'Post positions along its line, in house-local feet. Empty for none.' } }) },
  { name: 'fitBeams', description: 'Replace a house\'s beams with the rule-based first pass for its current walls, for example after moving walls.', input_schema: object({ buildingId: str('main-house or guest-house.') }) },
  {
    name: 'addFurniture',
    description: 'Place a piece of furniture, a fixture, an appliance, or a machine from the catalog in a room. Position is its center in house-local feet.',
    input_schema: object({
      id: str('New unique id: lowercase letters, numbers, and hyphens.'), kind: { type: 'string', enum: Object.keys(CATALOG), description: 'Catalog piece.' },
      roomId: str('Room id from the model summary.'), xFt: num('Center x, house-local feet.'), yFt: num('Center y, house-local feet.'), facing,
    }),
  },
  { name: 'moveFurniture', description: 'Move a piece by an offset in feet.', input_schema: object({ itemId: str('Furniture id from the model summary.'), eastFt: num('Feet east. Negative is west.'), northFt: num('Feet north. Negative is south.') }) },
  { name: 'rotateFurniture', description: 'Turn a piece to face another way.', input_schema: object({ itemId: str('Furniture id from the model summary.'), facing }) },
  { name: 'removeFurniture', description: 'Remove a piece.', input_schema: object({ itemId: str('Furniture id from the model summary.') }) },
  { name: 'furnishRoom', description: 'Replace the furniture of a room with the automatic first pass for its current size and doors.', input_schema: object({ roomId: str('Room id from the model summary.') }) },
  { name: 'setSwale', description: 'Add or remove a graded drainage swale or curtain drain around a building that sits low.', input_schema: object({ buildingId: str('Building id from the model summary.'), swale: bool('True to add, false to remove.') }) },
  {
    name: 'setStyle',
    description: 'Set the material palette of a detailed building: mountain-modern (stone base, rough-sawn timber, dark standing-seam roof, black windows), metal-timber (dark metal with timber accents), lodge (heavy timber and stone), or glass-gallery (dark metal and big glass).',
    input_schema: object({
      buildingId: str('Building id from the model summary.'),
      style: { type: 'string', enum: ['mountain-modern', 'metal-timber', 'lodge', 'glass-gallery'], description: 'Style id.' },
    }),
  },
  {
    name: 'setBay',
    description: 'Make a window a bay that projects out of its outside wall (box, or angled with 45 degree sides), optionally with a built-in window seat, or set bay to null to make it flush again.',
    input_schema: object({
      openingId: str('Window id from the model summary.'),
      form: { type: ['string', 'null'], enum: ['box', 'angled', null], description: 'box or angled; null to remove the bay.' },
      depthFt: num('How far the bay projects from the wall, 1 to 4 ft. Ignored when removing.'),
      seat: bool('True for a built-in window seat.'),
    }),
  },
  {
    name: 'setCeiling',
    description: 'Shape a room ceiling: flat, vaulted (rising from the long walls to a peak, with exposed timber trusses), beamed (flat with exposed beams), or tray (raised center). Vaults and trays need nothing built above them, or a two-story room. Heights are above the room floor.',
    input_schema: object({
      roomId: str('Room id from the model summary.'),
      form: { type: 'string', enum: ['flat', 'vaulted', 'beamed', 'tray'], description: 'Ceiling form.' },
      heightFt: num('Flat or beamed: the ceiling height. Vaulted or tray: the peak or raised center. Feet above the room floor.'),
      ridge: { type: ['string', 'null'], enum: ['ew', 'ns', null], description: 'Vaulted: which way the peak runs, ew or ns. Null for the room long way.' },
      spacingFt: { type: ['number', 'null'], description: 'Vaulted: timber truss spacing in feet, 0 for none. Beamed: beam spacing. Null for the default (12 ft trusses, 6 ft beams).' },
    }),
  },
  { name: 'setSafeRoom', description: 'Mark or unmark a room of the main house as the safe room.', input_schema: object({ roomId: str('Room id from the model summary.'), safeRoom: bool('True to make it a safe room.') }) },
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
    const item = (prop as { items?: { type: string } }).items?.type ?? 'number'
    const ok = types.some(t => t === 'null' ? value === null
      : t === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : t === 'array' ? Array.isArray(value) && value.every(v => item === 'string' ? typeof v === 'string' : typeof v === 'number' && Number.isFinite(v))
      : typeof value === t)
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
          ...(v.wingId ? { wingId: s('wingId') } : {}),
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
    case 'addRoad': {
      const flat = v.pointsFt as number[]
      if (flat.length < 4 || flat.length % 2) return { ok: false, error: 'pointsFt needs pairs of x and y, at least two points.' }
      const points = Array.from({ length: flat.length / 2 }, (_, i) => ({ x: inches(flat[2 * i]), y: inches(flat[2 * i + 1]) }))
      return { ok: true, op: { op: 'addRoad', road: { id: s('id'), name: s('name'), kind: s('kind') as never, points, width: inches(n('widthFt')), turnaround: v.turnaround as boolean } } }
    }
    case 'removeRoad': return { ok: true, op: { op: 'removeRoad', roadId: s('roadId') } }
    case 'setRoadWidth': return { ok: true, op: { op: 'setRoadWidth', roadId: s('roadId'), width: inches(n('widthFt')) } }
    case 'setTurnaround': return { ok: true, op: { op: 'setTurnaround', roadId: s('roadId'), turnaround: v.turnaround as boolean } }
    case 'addWaterSource': return { ok: true, op: { op: 'addWaterSource', source: { id: s('id'), name: s('name'), kind: s('kind') as never, at: { x: inches(n('xFt')), y: inches(n('yFt')) }, gallons: n('gallons') } } }
    case 'removeWaterSource': return { ok: true, op: { op: 'removeWaterSource', sourceId: s('sourceId') } }
    case 'setIgnition': return { ok: true, op: { op: 'setIgnition', buildingId: s('buildingId'), ignition: { roofClass: s('roofClass') as never, emberVents: v.emberVents as boolean, enclosedEaves: v.enclosedEaves as boolean, decks: s('decks') as never } } }
    case 'setFireRule': return { ok: true, op: { op: 'setFireRule', rule: s('rule') as never, value: n('value') } }
    case 'addUtility': return { ok: true, op: { op: 'addUtility', utility: { id: s('id'), name: s('name'), kind: s('kind') as never, rect: { x: inches(n('xFt')), y: inches(n('yFt')), w: inches(n('widthFt')), d: inches(n('depthFt')) }, capacity: n('capacity'), serves: v.serves as string[], ...(v.pumped ? { pumped: true } : {}) } } }
    case 'moveUtility': return { ok: true, op: { op: 'moveUtility', utilityId: s('utilityId'), dx: inches(n('eastFt')), dy: inches(n('northFt')) } }
    case 'resizeUtility': return { ok: true, op: { op: 'resizeUtility', utilityId: s('utilityId'), w: inches(n('widthFt')), d: inches(n('depthFt')), anchor: s('anchor') as never } }
    case 'setUtility': return { ok: true, op: { op: 'setUtility', utilityId: s('utilityId'), capacity: n('capacity'), serves: v.serves as string[], pumped: v.pumped as boolean } }
    case 'setExcavated': return { ok: true, op: { op: 'setExcavated', buildingId: s('buildingId'), excavated: v.excavated as boolean } }
    case 'addBeam': return { ok: true, op: { op: 'addBeam', beam: { id: s('id'), levelId: s('levelId'), orientation: s('orientation') as never, at: inches(n('atFt')), from: inches(n('fromFt')), to: inches(n('toFt')), material: s('material') as never, posts: (v.postsFt as number[]).map(inches) } } }
    case 'removeBeam': return { ok: true, op: { op: 'removeBeam', beamId: s('beamId') } }
    case 'setBeam': return { ok: true, op: { op: 'setBeam', beamId: s('beamId'), material: s('material') as never, posts: (v.postsFt as number[]).map(inches) } }
    case 'fitBeams': return { ok: true, op: { op: 'fitBeams', buildingId: s('buildingId') } }
    case 'addFurniture': return { ok: true, op: { op: 'addFurniture', item: { id: s('id'), kind: s('kind'), roomId: s('roomId'), x: inches(n('xFt')), y: inches(n('yFt')), rotation: FACING[s('facing') as keyof typeof FACING] } } }
    case 'moveFurniture': return { ok: true, op: { op: 'moveFurniture', itemId: s('itemId'), dx: inches(n('eastFt')), dy: inches(n('northFt')) } }
    case 'rotateFurniture': return { ok: true, op: { op: 'rotateFurniture', itemId: s('itemId'), rotation: FACING[s('facing') as keyof typeof FACING] } }
    case 'removeFurniture': return { ok: true, op: { op: 'removeFurniture', itemId: s('itemId') } }
    case 'furnishRoom': return { ok: true, op: { op: 'furnishRoom', roomId: s('roomId') } }
    case 'setSwale': return { ok: true, op: { op: 'setSwale', buildingId: s('buildingId'), swale: v.swale as boolean } }
    case 'removeUtility': return { ok: true, op: { op: 'removeUtility', utilityId: s('utilityId') } }
    case 'addDevice': return { ok: true, op: { op: 'addDevice', device: {
      id: s('id'), name: s('name'), kind: s('kind') as never, at: { x: inches(n('xFt')), y: inches(n('yFt')) }, range: inches(n('rangeFt')),
      ...(v.kind === 'camera' ? { facing: n('facingDeg'), fov: n('fovDeg') } : {}), power: s('power') as never, ...(v.onBuilding ? { on: s('onBuilding') } : {}),
    } } }
    case 'moveDevice': return { ok: true, op: { op: 'moveDevice', deviceId: s('deviceId'), dx: inches(n('eastFt')), dy: inches(n('northFt')) } }
    case 'aimCamera': return { ok: true, op: { op: 'aimCamera', deviceId: s('deviceId'), facing: n('facingDeg'), fov: n('fovDeg'), range: inches(n('rangeFt')) } }
    case 'removeDevice': return { ok: true, op: { op: 'removeDevice', deviceId: s('deviceId') } }
    case 'setOccupancy': return { ok: true, op: { op: 'setOccupancy', buildingId: s('buildingId'), beds: n('beds'), staff: n('staff'), backupPower: v.backupPower as boolean } }
    case 'setUtilityRule': return { ok: true, op: { op: 'setUtilityRule', rule: s('rule') as never, value: n('value') } }
    case 'setStyle': return { ok: true, op: { op: 'setStyle', buildingId: s('buildingId'), style: s('style') as never } }
    case 'setBay': return { ok: true, op: { op: 'setBay', openingId: s('openingId'), bay: v.form ? { form: s('form') as never, depth: inches(n('depthFt')), ...(v.seat ? { seat: true } : {}) } : null } }
    case 'setCeiling': return { ok: true, op: { op: 'setCeiling', roomId: s('roomId'), ceiling: { form: s('form') as never, height: inches(n('heightFt')), ...(v.ridge ? { ridge: s('ridge') as never } : {}), ...(typeof v.spacingFt === 'number' ? { spacing: inches(n('spacingFt')) } : {}) } } }
    case 'setSafeRoom': return { ok: true, op: { op: 'setSafeRoom', roomId: s('roomId'), safeRoom: v.safeRoom as boolean } }
    case 'setRoof': return { ok: true, op: { op: 'setRoof', roofId: s('roofId'), form: s('form') as never, pitch: n('pitch'), ridge: s('ridge') as never, low: s('low') as never, overhang: inches(n('overhangFt')) } }
  }
}
