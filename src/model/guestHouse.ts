import type { HouseModel, ProgramItem, Roof, Room, RoomType } from './types'
import { ft, p } from './geometry'
import { withHouseDefaults } from './firstPass'

const r = (id: string, name: string, type: RoomType, x: number, y: number, w: number, d: number, bathId?: string): Room => ({
  id, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, bathId,
})

/*
 * Guest house, first layout (v1), for big gatherings: a 74 x 38 ft bar on two floors, in the main house's family
 * of simple 8:12 gables. House-local feet, 0,0 at the southwest corner.
 *
 * Bearing lines shared by both floors: y = 22 and 28 (the hall), x = 30, 52, and 66 across the south band, and
 * x = 38 and 52 around the stair in the north band. The great room is two stories, open to the upper hall.
 * Views and the terrace face south; the entry faces north to the fire lane and parking.
 */
const main: Room[] = [
  // South band: gathering rooms and one main-floor suite for guests who should not climb stairs.
  { ...r('g-great', 'Great room, two story, fireplace', 'living', 0, 0, 30, 22), twoStory: true },
  r('g-kitchen', 'Kitchen and dining for a crowd', 'living', 30, 0, 22, 22),
  r('g-bed-1', 'Main-floor suite', 'bedroom', 52, 0, 14, 22, 'g-bath-1'),
  r('g-bath-1', 'Main-floor suite bath', 'bath', 66, 0, 8, 22),
  r('g-terrace', 'South terrace', 'outdoor', 0, -16, 52, 16),
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
  r('g-bed-3', 'Guest suite 3', 'bedroom', 52, 0, 14, 22, 'g-bath-3'),
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
  { id: 'g-roof', name: 'Guest house roof', levelId: 'g-upper', rect: { x: 0, y: 0, w: ft(74), d: ft(38) }, form: 'gable', pitch: 8, ridge: 'ew', low: 's', overhang: ft(2) },
  { id: 'g-porch-roof', name: 'North porch roof', levelId: 'g-main', rect: { x: 0, y: ft(38), w: ft(40), d: ft(8) }, form: 'shed', pitch: 4, ridge: 'ew', low: 'n', overhang: ft(1) },
]

/** First layout of the guest house, about 4,960 sq ft. A starting point to react to. */
const firstPass: HouseModel = withHouseDefaults({
  buildingId: 'guest-house',
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
export const guestHouse: HouseModel = {
  ...firstPass,
  openings: [
    ...firstPass.openings.filter(o => !(o.roomId === 'g-stair' && o.side === 'n')),
    { id: 'g-front-door', kind: 'door', roomId: 'g-foyer', side: 'n', offset: ft(6), width: 42, height: 96, sill: 0, swing: 'in' },
    { id: 'g-mudroom-door', kind: 'door', roomId: 'g-mudroom', side: 'n', offset: ft(7), width: 36, height: 84, sill: 0, swing: 'in' },
    // South glass for the view: tall fixed windows in the great room, a wide one over the kitchen counter.
    { id: 'g-great-view-1', kind: 'window', roomId: 'g-great', side: 's', offset: ft(4.5), width: 60, height: 96, sill: 12, operation: 'fixed' },
    { id: 'g-great-view-2', kind: 'window', roomId: 'g-great', side: 's', offset: ft(23), width: 72, height: 96, sill: 12, operation: 'fixed' },
    { id: 'g-kitchen-view', kind: 'window', roomId: 'g-kitchen', side: 's', offset: ft(18), width: 72, height: 48, sill: 42, operation: 'slider' },
  ],
}
