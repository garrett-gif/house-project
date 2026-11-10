import type { HouseModel, ProgramItem, Roof, Room, RoomType } from './types'
import { ft, p } from './geometry'
import { withHouseDefaults } from './firstPass'
import { firstPassFurniture } from './furniture'

const r = (id: string, name: string, type: RoomType, x: number, y: number, w: number, d: number, bathId?: string): Room => ({
  id, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, bathId,
})

/*
 * Guest house, second layout (v2), for big gatherings: a 74 x 38 ft bar on two floors. Per Garrett's brief it is the
 * main house's family, smaller: mountain modern, stone base, timber siding, a dark 10:12 standing-seam roof, a vaulted
 * great room with timber trusses and a glass gable, window seats in bays, and covered porches front and back.
 * House-local feet, 0,0 at the southwest corner.
 *
 * Bearing lines shared by both floors: y = 22 and 28 (the hall), x = 30, 52, and 66 across the south band, and
 * x = 38 and 52 around the stair in the north band. The great room is two stories, open to the upper hall.
 * Views and the terrace face south; the entry faces north to the fire lane and parking.
 */
const main: Room[] = [
  // South band: gathering rooms and one main-floor suite for guests who should not climb stairs.
  // The great room is open through both floors, vaulted under trusses, with a glass gable to the west.
  { ...r('g-great', 'Great room, vaulted, stone fireplace', 'living', 0, 0, 30, 22), twoStory: true, ceiling: { form: 'vaulted', height: ft(24), ridge: 'ew', spacing: ft(10), glassEnds: ['w'] } },
  { ...r('g-kitchen', 'Kitchen and dining for a crowd', 'living', 30, 0, 22, 22), ceiling: { form: 'beamed', height: ft(9), spacing: ft(4) } },
  r('g-bed-1', 'Main-floor suite, window seat', 'bedroom', 52, 0, 14, 22, 'g-bath-1'),
  r('g-bath-1', 'Main-floor suite bath', 'bath', 66, 0, 8, 22),
  r('g-terrace', 'Covered south porch, outdoor kitchen and fireplace', 'outdoor', 0, -16, 52, 16),
  // Covered porch across the front door and the mudroom door, out of the snow.
  r('g-porch', 'Covered north porch', 'outdoor', 0, 38, 40, 8),
  r('g-hall', 'Hall', 'circulation', 0, 22, 74, 6),
  // North band: entry and service.
  r('g-mudroom', 'Mudroom and laundry', 'service', 0, 28, 14, 10),
  r('g-mech', 'Mechanical', 'service', 14, 28, 6, 10),
  r('g-powder', 'Powder', 'bath', 20, 28, 6, 10),
  r('g-foyer', 'Foyer, north door', 'circulation', 26, 28, 12, 10),
  r('g-stair', 'Stairs', 'circulation', 38, 28, 14, 10),
  r('g-pantry', 'Pantry and bar', 'service', 52, 28, 10, 10),
  r('g-storage', 'Storage and linen', 'service', 62, 28, 12, 10),
]

const upper: Room[] = [
  r('g-bed-2', 'Guest suite 2', 'bedroom', 30, 0, 16, 22, 'g-bath-2'),
  r('g-bath-2', 'Guest suite 2 bath', 'bath', 46, 0, 6, 22),
  r('g-bed-3', 'Guest suite 3, window seat', 'bedroom', 52, 0, 14, 22, 'g-bath-3'),
  r('g-bath-3', 'Guest suite 3 bath', 'bath', 66, 0, 8, 22),
  r('g-upper-hall', 'Upper hall, open to the great room', 'circulation', 0, 22, 74, 6),
  r('g-bunk', 'Bunk room, sleeps six', 'bedroom', 0, 28, 22, 10, 'g-bunk-bath'),
  r('g-bunk-bath', 'Bunk room bath', 'bath', 22, 28, 8, 10),
  r('g-linen', 'Linen', 'service', 30, 28, 8, 10),
  r('g-upper-stair', 'Stairs', 'circulation', 38, 28, 14, 10),
  r('g-bed-4', 'Guest suite 4', 'bedroom', 52, 28, 14, 10, 'g-bath-4'),
  r('g-bath-4', 'Guest suite 4 bath', 'bath', 66, 28, 8, 10),
]

/** The brief for big gatherings, as checkable requirements. */
const program: ProgramItem[] = [
  { roomId: 'g-great', need: 'Great room big enough for a crowd', levelId: 'g-main', minArea: 600, minWidth: 20, near: ['g-kitchen'] },
  { roomId: 'g-kitchen', need: 'Kitchen and dining for a crowd', levelId: 'g-main', minArea: 450, near: ['g-terrace'] },
  { roomId: 'g-terrace', need: 'Terrace off the great room', levelId: 'g-main', near: ['g-great'] },
  { roomId: 'g-porch', need: 'Covered porch at the front door', levelId: 'g-main', near: ['g-foyer', 'g-mudroom'] },
  { roomId: 'g-bed-1', need: 'One suite on the main floor', levelId: 'g-main', minArea: 250 },
  { roomId: 'g-bed-2', need: 'Guest suite', minArea: 250 },
  { roomId: 'g-bed-3', need: 'Guest suite', minArea: 250 },
  { roomId: 'g-bed-4', need: 'Guest suite', minArea: 120 },
  { roomId: 'g-bunk', need: 'Bunk room for kids or a group', minArea: 200 },
  { roomId: 'g-mudroom', need: 'Mudroom and laundry by the entry', levelId: 'g-main', minArea: 120 },
]

const roofs: Roof[] = [
  { id: 'g-roof', name: 'Guest house roof', levelId: 'g-upper', rect: { x: 0, y: 0, w: ft(74), d: ft(38) }, form: 'gable', pitch: 10, ridge: 'ew', low: 's', overhang: ft(2) },
  { id: 'g-terrace-roof', name: 'South porch roof', levelId: 'g-main', rect: { x: 0, y: ft(-16), w: ft(52), d: ft(16) }, form: 'shed', pitch: 3, ridge: 'ew', low: 's', overhang: ft(1) },
  { id: 'g-porch-roof', name: 'North porch roof', levelId: 'g-main', rect: { x: 0, y: ft(38), w: ft(40), d: ft(8) }, form: 'shed', pitch: 4, ridge: 'ew', low: 'n', overhang: ft(1) },
]

/** Second layout of the guest house, about 4,960 sq ft. A starting point to react to. */
const firstPass: HouseModel = withHouseDefaults({
  buildingId: 'guest-house',
  style: 'mountain-modern',
  origin: p(600, 4860),
  concept: true,
  program,
  roofs,
  levels: [
    { id: 'g-main', name: 'Main floor', elevation: 0, floorHeight: ft(10), rooms: main },
    { id: 'g-upper', name: 'Upper floor', elevation: ft(10), floorHeight: ft(9), rooms: upper },
  ],
})

/**
 * The rule-based first pass puts the outside door on the stair hall. The front door belongs on the foyer's north
 * wall, with a second door into the mudroom from the parking side.
 */
const HAND_WALLS = new Set(['g-great:s', 'g-great:w', 'g-bed-1:s', 'g-bed-3:s', 'g-kitchen:s'])
const finished: HouseModel = {
  ...firstPass,
  openings: [
    ...firstPass.openings.filter(o => !(o.roomId === 'g-stair' && o.side === 'n') && !(o.kind === 'window' && HAND_WALLS.has(`${o.roomId}:${o.side}`))),
    { id: 'g-front-door', kind: 'door', roomId: 'g-foyer', side: 'n', offset: ft(6), width: 42, height: 96, sill: 0, swing: 'in' },
    { id: 'g-mudroom-door', kind: 'door', roomId: 'g-mudroom', side: 'n', offset: ft(7), width: 36, height: 84, sill: 0, swing: 'in' },
    // South glass for the view: a glass wall in the great room beside its porch door, a wide window over the kitchen counter.
    { id: 'g-great-view-1', kind: 'window', roomId: 'g-great', side: 's', offset: ft(4.5), width: 60, height: 96, sill: 12, operation: 'fixed' },
    { id: 'g-great-view-2', kind: 'window', roomId: 'g-great', side: 's', offset: ft(24), width: ft(10), height: 108, sill: 12, operation: 'fixed' },
    { id: 'g-kitchen-view', kind: 'window', roomId: 'g-kitchen', side: 's', offset: ft(18), width: 72, height: 48, sill: 42, operation: 'slider' },
    // Window seats in bays: the great room's west end, the main-floor suite, and suite 3 above it.
    { id: 'g-great-seat', kind: 'window', roomId: 'g-great', side: 'w', offset: ft(11), width: ft(10), height: 60, sill: 18, operation: 'casement', bay: { form: 'angled', depth: ft(3), seat: true } },
    { id: 'g-bed-1-seat', kind: 'window', roomId: 'g-bed-1', side: 's', offset: ft(7), width: ft(6), height: 54, sill: 18, operation: 'casement', bay: { form: 'box', depth: ft(2.5), seat: true } },
    { id: 'g-bed-3-seat', kind: 'window', roomId: 'g-bed-3', side: 's', offset: ft(7), width: ft(6), height: 48, sill: 18, operation: 'casement', bay: { form: 'box', depth: ft(2.5), seat: true } },
  ],
}

/** Furnished after the openings are final, so pieces keep clear of the real doors. */
export const guestHouse: HouseModel = { ...finished, furniture: firstPassFurniture(finished) }
