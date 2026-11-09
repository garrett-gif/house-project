import type { HouseModel, ProgramItem, Roof, Room, RoomType } from './types'
import { ft, p } from './geometry'
import { withHouseDefaults } from './firstPass'

const r = (id: string, name: string, type: RoomType, x: number, y: number, w: number, d: number, bathId?: string): Room => ({
  id, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, bathId,
})

/** Overall plan: 190 ft wide U opening south. West and east wings are 46 by 64 ft; the north bar is 190 by 44 ft. */
export const HOUSE_WIDTH = 190
export const HOUSE_DEPTH = 108
export const WING_WIDTH = 46
export const WING_DEPTH = 64
export const GARAGE_WIDTH = 38
export const GARAGE_DEPTH = 26

/*
 * Main house, first layout (v1). Room coordinates are house-local feet: 0,0 is the southwest corner of the west wing.
 *
 * Bearing lines shared by all three floors, so walls stack where they can:
 *   North bar: y = 64 (south face), 88 and 94 (the gallery), 108 (north face).
 *   Bar cross walls: x = 24, 48, 96, 106, 114, 130, 144 on every floor that has a wall there.
 *   Wings: x = 24 in the west wing, y = 24 in both wings.
 * The great room is two stories, so the kids floor leaves the space above it open.
 * The ground falls south: the walkout opens to the pool courtyard, and its other outside walls are foundation.
 */

const walkout: Room[] = [
  // North bar, south band.
  r('craft', 'Family craft room (paper, 3D printing, sewing)', 'living', 0, 64, 24, 24),
  r('lower-lobby', 'Lower lobby', 'circulation', 24, 64, 24, 24),
  r('gym', 'Gym (free weights, machines, mats, Pilates)', 'wellness', 48, 64, 48, 24),
  r('spa-lounge', 'Spa lounge and showers', 'wellness', 96, 64, 24, 24),
  r('steam', 'Steam room', 'wellness', 120, 64, 10, 12),
  r('sauna', 'Sauna', 'wellness', 120, 76, 10, 12),
  r('hair-nail', 'Hair and nail', 'wellness', 130, 64, 14, 12),
  r('massage', 'Massage room', 'wellness', 130, 76, 14, 12),
  r('pool-deck', 'Hot tub and cold plunge', 'wellness', 144, 64, 46, 24),
  // Gallery and north band.
  r('w-hall', 'Lower gallery', 'circulation', 0, 88, 190, 6),
  r('mech', 'Mechanical', 'service', 0, 94, 24, 14),
  r('pool-equip', 'Pool equipment', 'service', 24, 94, 24, 14),
  r('w-storage', 'Storage', 'service', 48, 94, 24, 14),
  r('locker', 'Locker room and showers', 'bath', 72, 94, 24, 14),
  r('w-powder', 'Powder', 'bath', 96, 94, 10, 14),
  r('w-elevator', 'Elevator', 'service', 106, 94, 8, 14),
  r('w-stair', 'Stairs', 'circulation', 114, 94, 16, 14),
  r('wine-cellar', 'Wine cellar', 'service', 130, 94, 24, 14),
  r('w-storage-2', 'Storage', 'service', 154, 94, 36, 14),
  // West wing: theater with its lobby and candy wall, and the woodshop opening to the courtyard.
  r('woodshop', 'Dust-controlled woodshop', 'service', 0, 0, 46, 24),
  r('theater', '20-seat theater', 'living', 0, 24, 24, 40),
  r('theater-lobby', 'Theater lobby, candy wall, popcorn and soda', 'circulation', 24, 24, 22, 40),
  // East wing: the indoor pool, opening south to the outdoor pool.
  r('indoor-pool', 'Indoor pool, laps and play', 'pool', 144, 0, 46, 64),
]

const main: Room[] = [
  // North bar, south band: everyday rooms facing the courtyard.
  r('mudroom', 'Mudroom, lockers, bench, and dog wash', 'service', 0, 64, 24, 24),
  r('dining', 'Formal dining', 'living', 24, 64, 24, 24),
  r('kitchen', 'Eat-in party kitchen, island and table', 'living', 48, 64, 48, 24),
  { ...r('great', 'Great room, two story', 'living', 96, 64, 48, 24), twoStory: true },
  r('east-hall', 'Hall to primary suite', 'circulation', 144, 64, 6, 24),
  r('library', 'Library', 'living', 150, 64, 40, 24),
  // Gallery and north band: entry, service, vertical circulation.
  r('m-hall', 'Gallery', 'circulation', 0, 88, 190, 6),
  r('laundry', 'Laundry', 'service', 0, 94, 20, 14),
  r('pantry', 'Pantry', 'service', 20, 94, 28, 14),
  r('scullery', 'Scullery, full second kitchen', 'service', 48, 94, 24, 14),
  r('foyer', 'Formal foyer, north door', 'circulation', 72, 94, 24, 14),
  r('powder', 'Powder', 'bath', 96, 94, 10, 14),
  r('m-elevator', 'Elevator', 'service', 106, 94, 8, 14),
  r('m-stair', 'Stairs', 'circulation', 114, 94, 16, 14),
  r('office', 'Home office', 'living', 130, 94, 24, 14),
  r('lounge', 'Bar and lounge', 'living', 154, 94, 36, 14),
  // West wing: family room by the kitchen side, then a guest or in-law suite with its own sitting room.
  r('family', 'Family room', 'living', 0, 40, 46, 24),
  r('guest-sitting', 'Guest suite sitting room', 'living', 0, 24, 24, 16),
  r('guest-kitchenette', 'Guest kitchenette', 'service', 24, 24, 22, 16),
  r('guest-bed', 'Guest or in-law bedroom', 'bedroom', 0, 0, 24, 24, 'guest-bath'),
  r('guest-bath', 'Guest bath', 'bath', 24, 0, 22, 12),
  r('guest-closet', 'Guest closet', 'service', 24, 12, 22, 12),
  // West garage, side entry, off the mudroom.
  r('garage', '3-car garage, side entry', 'garage', -38, 64, 38, 26),
  // East wing: primary suite, with the bedroom and sitting area on the courtyard and a private deck to the south.
  r('primary', 'Primary bedroom, fireplace', 'bedroom', 144, 0, 28, 24, 'bath-his'),
  r('primary-sitting', 'Primary sitting area, fireplace', 'living', 172, 0, 18, 24),
  r('primary-hall', 'Primary hall', 'circulation', 144, 24, 6, 40),
  r('bath-his', 'His bath', 'bath', 150, 24, 12, 14),
  r('vanity', 'Vanity and makeup', 'service', 162, 24, 10, 14),
  r('bath-hers', 'Her bath', 'bath', 172, 24, 18, 14),
  r('closet-his', 'His closet', 'service', 150, 38, 12, 26),
  r('closet-hers', 'Her closet', 'service', 162, 38, 28, 26),
  // Outdoor rooms: no walls.
  r('terrace', 'Covered terrace, steps to pool', 'outdoor', 46, 52, 98, 12),
  r('primary-deck', 'Primary private deck', 'outdoor', 144, -16, 46, 16),
]

const upper: Room[] = [
  // South band: four kids' rooms, each with its own bath. Open to the great room below between x 96 and 144.
  ...[0, 24, 48, 72].flatMap((x, i) => [
    r(`kid-${i + 1}`, `Kid bedroom ${i + 1}`, 'bedroom', x, 64, 16, 24, `kid-${i + 1}-bath`),
    r(`kid-${i + 1}-bath`, `Bath ${i + 1}`, 'bath', x + 16, 64, 8, 24),
  ]),
  r('kids-living', 'Kids living area', 'living', 144, 64, 46, 24),
  r('u-hall', 'Hall', 'circulation', 0, 88, 190, 6),
  // North band: three more kids' rooms, homework, laundry, the extra bedroom, playroom.
  ...[[0, 14, 6], [20, 14, 14], [48, 14, 10]].flatMap(([x, w, bw], i) => [
    r(`kid-${i + 5}`, `Kid bedroom ${i + 5}`, 'bedroom', x, 94, w, 14, `kid-${i + 5}-bath`),
    r(`kid-${i + 5}-bath`, `Bath ${i + 5}`, 'bath', x + w, 94, bw, 14),
  ]),
  r('homework', 'Homework room', 'living', 72, 94, 24, 14),
  r('kids-laundry', 'Kids laundry', 'service', 96, 94, 10, 14),
  r('u-elevator', 'Elevator', 'service', 106, 94, 8, 14),
  r('u-stair', 'Stairs', 'circulation', 114, 94, 16, 14),
  r('extra-bed', 'Extra bedroom', 'bedroom', 130, 94, 20, 14, 'extra-bath'),
  r('extra-bath', 'Extra bedroom bath', 'bath', 150, 94, 8, 14),
  r('playroom', 'Playroom', 'living', 158, 94, 32, 14),
]

/** The brief as checkable requirements. Sizes are working targets, to wall centerlines. */
const program: ProgramItem[] = [
  { roomId: 'kitchen', need: 'Large eat-in kitchen for parties, island and table', levelId: 'main', minArea: 900, minWidth: 20, near: ['terrace'] },
  { roomId: 'scullery', need: 'Scullery as a complete second kitchen', levelId: 'main', minArea: 250 },
  { roomId: 'great', need: 'Two-story great room', levelId: 'main', minArea: 900, minWidth: 20 },
  { roomId: 'dining', need: 'Formal dining', levelId: 'main', minArea: 400, near: ['kitchen'] },
  { roomId: 'foyer', need: 'Formal front door on the north', levelId: 'main', minArea: 250 },
  { roomId: 'mudroom', need: 'Family mudroom with lockers and dog wash, next to the garage', levelId: 'main', minArea: 300, near: ['garage'] },
  { roomId: 'garage', need: '3-car side garage', levelId: 'main', minArea: 900, minWidth: 24 },
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
 * Roofs: simple gables at 8:12 with 2 ft overhangs, which shed snow and suit the mountain-minimalist, European look.
 * The north bar's ridge runs east-west over the kids floor and the two-story great room. Each wing and the garage
 * get a gable whose ridge runs along the block and dies into the taller bar.
 */
const gable = (id: string, name: string, levelId: string, x: number, y: number, w: number, d: number, ridge: 'ew' | 'ns'): Roof =>
  ({ id, name, levelId, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, form: 'gable', pitch: 8, ridge, low: 's', overhang: ft(2) })
const roofs: Roof[] = [
  gable('roof-bar', 'North bar roof', 'upper', 0, 64, 190, 44, 'ew'),
  gable('roof-west', 'West wing roof', 'main', 0, 0, 46, 64, 'ns'),
  gable('roof-east', 'East wing roof', 'main', 144, 0, 46, 64, 'ns'),
  gable('roof-garage', 'Garage roof', 'main', -38, 64, 38, 26, 'ew'),
]

/** First real layout of the main house, from the brief. A starting point to react to, not a finished design. */
export const mainHouse: HouseModel = withHouseDefaults({
  buildingId: 'main-house',
  origin: p(1060, 5360),
  concept: true,
  program,
  roofs,
  levels: [
    { id: 'walkout', name: 'Walkout level', elevation: ft(-11), floorHeight: ft(11), exposed: ['s'], rooms: walkout },
    { id: 'main', name: 'Main floor', elevation: 0, floorHeight: ft(11), rooms: main },
    { id: 'upper', name: 'Kids floor', elevation: ft(11), floorHeight: ft(10), rooms: upper },
  ],
})
