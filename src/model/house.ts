import type { HouseModel, Opening, ProgramItem, Roof, Room, RoomType } from './types'
import { ft, p } from './geometry'
import { withHouseDefaults } from './firstPass'

const r = (id: string, name: string, type: RoomType, x: number, y: number, w: number, d: number, bathId?: string): Room => ({
  id, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, bathId,
})

/*
 * Main house, second layout (v2): open and homey rather than a compound. Room coordinates are house-local feet:
 * 0,0 is the southwest corner of the south terrace; the house itself runs from y = 16 to the north door at y = 84.
 *
 * - An open core: the two-story great room is the middle of the house. The kitchen opens to it on the west, the
 *   hearth room and bar on the east, the foyer and den on the north. There is no entry gallery: the front door
 *   opens straight into the great room and the view south.
 * - Outdoor rooms all along the south: the kitchen terrace, a porch off the great room, the hearth terrace, and the
 *   primary deck.
 * - Cozy spots mixed with the big rooms: the hearth room with a window seat, the den, the library, and the kids'
 *   homework and art room.
 * - Wings stay short: service and garage to the west, the primary and guest suites to the east, the kids' floor
 *   over the kitchen side, and the walkout below with the indoor pool directly under the great room, so no walls
 *   stand over it.
 *
 * Bearing lines shared by the floors: y = 16, 40, 62, 84 and x = 36, 52, 66, 110, 124.
 */
const walkout: Room[] = [
  // West: theater and its lobby, woodshop, mechanical.
  r('theater', '20-seat theater', 'living', 0, 16, 36, 24),
  r('theater-lobby', 'Theater lobby, candy wall, popcorn and soda', 'circulation', 0, 40, 36, 14),
  r('woodshop', 'Dust-controlled woodshop', 'service', 0, 54, 20, 30),
  r('mech', 'Mechanical', 'service', 20, 54, 16, 14),
  r('pool-equip', 'Pool equipment', 'service', 20, 68, 16, 16),
  // Middle: gym and craft room open to the south, the lower lobby at the stair.
  r('gym', 'Gym (free weights, machines, mats, Pilates)', 'wellness', 36, 16, 30, 30),
  r('craft', 'Family craft room (paper, 3D printing, sewing)', 'living', 36, 46, 30, 16),
  r('lower-lobby', 'Lower lobby', 'circulation', 36, 62, 16, 22),
  r('w-stair', 'Stairs', 'circulation', 52, 62, 14, 14),
  r('w-elevator', 'Elevator', 'service', 52, 76, 8, 8),
  r('w-storage', 'Storage', 'service', 60, 76, 6, 8),
  // Under the great room: the indoor pool, with the lower family room and bar beside it.
  r('indoor-pool', 'Indoor pool, laps and play', 'pool', 66, 16, 44, 46),
  r('w-lounge', 'Lower family room and bar', 'living', 66, 62, 20, 22),
  r('w-hall', 'Pool hall', 'circulation', 86, 62, 24, 6),
  r('locker', 'Locker room and showers', 'bath', 86, 68, 12, 16),
  r('w-powder', 'Powder', 'bath', 98, 68, 6, 16),
  r('wine-cellar', 'Wine cellar', 'service', 104, 68, 6, 16),
  r('pool-deck', 'Hot tub and cold plunge', 'wellness', 110, 16, 14, 22),
  r('w-storage-2', 'Pool storage', 'service', 110, 38, 14, 24),
  // Safe room in the buried north side: concrete foundation walls, no windows, one door from the pool hall.
  { ...r('safe-room', 'Safe room', 'service', 110, 62, 14, 22), safeRoom: true },
  // East: the spa, under the primary suite.
  r('spa-lounge', 'Spa lounge and showers', 'wellness', 124, 16, 22, 24),
  r('steam', 'Steam room', 'wellness', 146, 16, 12, 8),
  r('sauna', 'Sauna', 'wellness', 158, 16, 12, 8),
  r('massage', 'Massage room', 'wellness', 146, 24, 12, 10),
  r('hair-nail', 'Hair and nail', 'wellness', 158, 24, 12, 10),
  r('spa-hall', 'Spa hall', 'circulation', 146, 34, 24, 6),
]

const main: Room[] = [
  // West: pantry and scullery behind the kitchen, the family entry through the mudroom from the garage.
  r('pantry', 'Pantry and cold storage', 'service', 0, 16, 20, 24),
  r('scullery', 'Scullery, full second kitchen', 'service', 20, 16, 16, 24),
  r('mudroom', 'Mudroom, lockers, bench, and dog wash', 'service', 0, 40, 22, 14),
  r('back-hall', 'Back hall', 'circulation', 22, 40, 14, 6),
  r('laundry', 'Laundry', 'service', 22, 46, 14, 8),
  r('garage', '3-car garage, side entry', 'garage', 0, 54, 36, 30),
  // The open core.
  r('kitchen', 'Eat-in party kitchen, island and table', 'living', 36, 16, 30, 30),
  r('dining', 'Formal dining', 'living', 36, 46, 30, 16),
  r('office', 'Library and home office', 'living', 36, 62, 16, 22),
  r('m-stair', 'Stairs', 'circulation', 52, 62, 14, 14),
  r('m-elevator', 'Elevator', 'service', 52, 76, 8, 8),
  r('coat', 'Coat closet', 'service', 60, 76, 6, 8),
  { ...r('great', 'Great room, two story, fireplace', 'living', 66, 16, 44, 46), twoStory: true },
  r('foyer', 'Formal foyer, north door', 'circulation', 66, 62, 20, 22),
  r('powder', 'Powder', 'bath', 86, 62, 8, 22),
  r('den', 'Den with a window seat', 'living', 94, 62, 16, 22),
  r('hearth', 'Hearth room, fireplace and window seat', 'living', 110, 16, 14, 22),
  r('lounge', 'Bar and lounge', 'living', 110, 38, 14, 24),
  r('guest-hall', 'Guest entry', 'circulation', 110, 62, 14, 22),
  // East: the primary suite to the south, the guest suite to the north.
  r('primary', 'Primary bedroom, fireplace', 'bedroom', 124, 16, 26, 24, 'bath-his'),
  r('primary-sitting', 'Primary sitting area, fireplace', 'living', 150, 16, 20, 24),
  r('primary-hall', 'Primary entry', 'circulation', 124, 40, 10, 22),
  r('bath-hers', 'Her bath', 'bath', 134, 40, 18, 12),
  r('vanity', 'Vanity and makeup', 'service', 152, 40, 8, 12),
  r('closet-hers', 'Her closet', 'service', 160, 40, 10, 16),
  r('bath-his', 'His bath', 'bath', 134, 52, 14, 10),
  r('closet-his', 'His closet', 'service', 148, 52, 12, 10),
  r('linen', 'Linen', 'service', 160, 56, 10, 6),
  r('guest-sitting', 'Guest suite sitting room', 'living', 124, 62, 18, 22),
  r('guest-bed', 'Guest or in-law bedroom', 'bedroom', 142, 62, 18, 22, 'guest-bath'),
  r('guest-bath', 'Guest bath', 'bath', 160, 62, 10, 22),
  // Outdoor rooms all along the south.
  r('terrace', 'Kitchen terrace and outdoor kitchen', 'outdoor', 0, 0, 66, 16),
  r('great-porch', 'Covered porch off the great room', 'outdoor', 66, 0, 44, 16),
  r('hearth-terrace', 'Hearth terrace and fire pit', 'outdoor', 110, 0, 14, 16),
  r('primary-deck', 'Primary private deck', 'outdoor', 124, 0, 46, 16),
]

const upper: Room[] = [
  // South row: four kids' rooms, each with its own bath, on the view side.
  ...[0, 16.5, 33, 49.5].flatMap((x, i) => [
    r(`kid-${i + 1}`, `Kid bedroom ${i + 1}`, 'bedroom', x, 16, 11, 17, `kid-${i + 1}-bath`),
    r(`kid-${i + 1}-bath`, `Bath ${i + 1}`, 'bath', x + 11, 16, 5.5, 17),
  ]),
  r('kids-gallery', 'Kids gallery, built-in desks and window seats', 'circulation', 0, 33, 66, 8),
  r('kids-living', 'Kids living area', 'living', 16.5, 41, 35.5, 23),
  r('homework', 'Homework and art room', 'living', 52, 41, 14, 21),
  // West: two more kids' rooms facing west.
  r('kid-5', 'Kid bedroom 5', 'bedroom', 0, 41, 16.5, 11, 'kid-5-bath'),
  r('kid-5-bath', 'Bath 5', 'bath', 0, 52, 16.5, 5.5),
  r('kid-6', 'Kid bedroom 6', 'bedroom', 0, 57.5, 16.5, 12.5, 'kid-6-bath'),
  r('kid-6-bath', 'Bath 6 and closet', 'bath', 0, 70, 16.5, 14),
  // North: the seventh kid's room and the extra bedroom, then the stair.
  r('kid-7', 'Kid bedroom 7', 'bedroom', 16.5, 64, 12, 20, 'kid-7-bath'),
  r('kid-7-bath', 'Bath 7', 'bath', 28.5, 64, 5.5, 20),
  r('extra-bed', 'Extra bedroom', 'bedroom', 34, 64, 12, 20, 'extra-bath'),
  r('extra-bath', 'Extra bedroom bath', 'bath', 46, 64, 6, 20),
  r('u-stair', 'Stairs', 'circulation', 52, 62, 14, 14),
  r('u-elevator', 'Elevator', 'service', 52, 76, 8, 8),
  r('u-storage', 'Kids storage', 'service', 60, 76, 6, 8),
]

/** The brief as checkable requirements. Sizes are working targets, to wall centerlines. */
const program: ProgramItem[] = [
  { roomId: 'kitchen', need: 'Large eat-in kitchen for parties, island and table', levelId: 'main', minArea: 900, minWidth: 20, near: ['terrace'] },
  { roomId: 'scullery', need: 'Scullery as a complete second kitchen', levelId: 'main', minArea: 250 },
  { roomId: 'great', need: 'Two-story great room', levelId: 'main', minArea: 900, minWidth: 20 },
  { roomId: 'dining', need: 'Formal dining', levelId: 'main', minArea: 400, near: ['kitchen'] },
  { roomId: 'foyer', need: 'Formal front door on the north', levelId: 'main', minArea: 250 },
  { roomId: 'mudroom', need: 'Family mudroom with lockers and dog wash, next to the garage', levelId: 'main', minArea: 300, near: ['garage'] },
  { roomId: 'garage', need: '3-car garage', levelId: 'main', minArea: 900, minWidth: 24 },
  { roomId: 'office', need: 'Home office', minArea: 250 },
  { roomId: 'primary', need: 'Primary bedroom on the main floor, with fireplace', levelId: 'main', minArea: 400, minWidth: 16 },
  { roomId: 'primary-sitting', need: 'Sitting area connected to the primary bedroom', levelId: 'main', minArea: 250, near: ['primary'] },
  { roomId: 'bath-his', need: 'His bathroom', levelId: 'main', minArea: 120 },
  { roomId: 'bath-hers', need: 'Her bathroom', levelId: 'main', minArea: 150 },
  { roomId: 'closet-his', need: 'His walk-in closet', levelId: 'main', minArea: 120 },
  { roomId: 'closet-hers', need: 'Her walk-in closet', levelId: 'main', minArea: 150 },
  { roomId: 'vanity', need: 'Vanity or makeup area', levelId: 'main', minArea: 80 },
  { roomId: 'primary-deck', need: 'Private deck off the primary suite', levelId: 'main', near: ['primary-sitting'] },
  { roomId: 'guest-bed', need: 'Guest or in-law suite with its own sitting room', levelId: 'main', minArea: 250, near: ['guest-sitting'] },
  { roomId: 'kids-living', need: 'Separate kids living area on the upper floor', levelId: 'upper', minArea: 600 },
  ...[1, 2, 3, 4, 5, 6, 7].map(n => ({ roomId: `kid-${n}`, need: `Kid bedroom ${n} on the upper floor`, levelId: 'upper', minArea: 180, minWidth: 11 })),
  { roomId: 'extra-bed', need: 'One to two additional bedrooms', minArea: 200 },
  { roomId: 'craft', need: 'Walkout craft room for paper, 3D printing, and sewing', levelId: 'walkout', minArea: 450 },
  { roomId: 'woodshop', need: 'Separate dust-controlled woodshop on the walkout level', levelId: 'walkout', minArea: 450 },
  { roomId: 'theater', need: '20-seat theater', minArea: 750, minWidth: 20, near: ['theater-lobby'] },
  { roomId: 'theater-lobby', need: 'Candy wall, popcorn, and soda by the theater', minArea: 200 },
  { roomId: 'gym', need: 'Walkout gym with free weights, machines, mats, and Pilates', levelId: 'walkout', minArea: 900 },
  { roomId: 'steam', need: 'Steam room', levelId: 'walkout', minArea: 60 },
  { roomId: 'sauna', need: 'Sauna', levelId: 'walkout', minArea: 60 },
  { roomId: 'massage', need: 'Massage room', levelId: 'walkout', minArea: 120 },
  { roomId: 'hair-nail', need: 'Hair and nail space', levelId: 'walkout', minArea: 120 },
  { roomId: 'pool-deck', need: 'Hot tub and cold plunge', levelId: 'walkout', minArea: 300, near: ['indoor-pool'] },
  { roomId: 'indoor-pool', need: 'Attached indoor pool for laps and play, connected to the spa', minArea: 2000, minWidth: 30, near: ['pool-deck'] },
  { roomId: 'm-elevator', need: 'Elevator serving every floor', levelId: 'main' },
  { roomId: 'u-elevator', need: 'Elevator serving every floor', levelId: 'upper' },
  { roomId: 'w-elevator', need: 'Elevator serving every floor', levelId: 'walkout' },
]

/**
 * Roofs: simple gables at 8:12 with 2 ft overhangs. The kids' block and the great room carry the tall roofs; the
 * entry, the hearth room, and the primary wing are one story under lower gables.
 */
const gable = (id: string, name: string, levelId: string, x: number, y: number, w: number, d: number, ridge: 'ew' | 'ns'): Roof =>
  ({ id, name, levelId, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, form: 'gable', pitch: 8, ridge, low: 's', overhang: ft(2) })
const roofs: Roof[] = [
  gable('roof-kids', 'Kids wing roof', 'upper', 0, 16, 66, 68, 'ns'),
  gable('roof-great', 'Great room roof', 'upper', 66, 16, 44, 46, 'ns'),
  gable('roof-entry', 'Entry roof', 'main', 66, 62, 58, 22, 'ew'),
  gable('roof-hearth', 'Hearth room roof', 'main', 110, 16, 14, 46, 'ns'),
  gable('roof-primary', 'Primary and guest wing roof', 'main', 124, 16, 46, 68, 'ns'),
]

/** Second layout of the main house, about 24,500 sq ft. A starting point to react to. */
const firstPass: HouseModel = withHouseDefaults({
  buildingId: 'main-house',
  // The owner chose to keep the walkout facing south and excavate for it.
  excavated: true,
  origin: p(1060, 5395),
  concept: true,
  program,
  roofs,
  levels: [
    { id: 'walkout', name: 'Walkout level', elevation: ft(-11), floorHeight: ft(11), exposed: ['s'], rooms: walkout },
    { id: 'main', name: 'Main floor', elevation: 0, floorHeight: ft(11), rooms: main },
    { id: 'upper', name: 'Kids floor', elevation: ft(11), floorHeight: ft(10), rooms: upper },
  ],
})

/**
 * The rule-based first pass connects every room, but an open house wants wide cased openings around the great room,
 * and the primary bath and closet reached from the primary suite rather than the guest room behind them.
 */
const opening = (id: string, roomId: string, side: Opening['side'], offsetFt: number, widthFt: number): Opening =>
  ({ id, kind: 'opening', roomId, side, offset: ft(offsetFt), width: ft(widthFt), height: ft(8), sill: 0 })
const door = (id: string, roomId: string, side: Opening['side'], offsetFt: number, width: number): Opening =>
  ({ id, kind: 'door', roomId, side, offset: ft(offsetFt), width, height: 80, sill: 0, swing: 'in' })
const REPLACED = new Set(['bath-his-door-1', 'closet-his-door-1', 'den-door-3', 'great-door-1', 'hearth-door-1', 'lounge-door-2'])

export const mainHouse: HouseModel = {
  ...firstPass,
  openings: [
    ...firstPass.openings.filter(o => !REPLACED.has(o.id)),
    opening('kitchen-great', 'kitchen', 'e', 15, 16),
    opening('kitchen-dining', 'kitchen', 'n', 15, 12),
    opening('dining-great', 'dining', 'e', 8, 8),
    opening('great-foyer', 'great', 'n', 10, 10),
    opening('great-den', 'great', 'n', 36, 8),
    opening('great-hearth', 'great', 'e', 11, 10),
    opening('great-lounge', 'great', 'e', 34, 10),
    door('bath-his-door', 'bath-his', 'w', 5, 32),
    door('closet-his-door', 'closet-his', 'w', 5, 30),
    door('guest-bed-door', 'guest-bed', 'w', 6, 36),
  ],
}
