import type { Ceiling, FurnitureItem, HouseModel, Opening, ProgramItem, Roof, Room, RoomType, Wing } from './types'
import { ft, p } from './geometry'
import { withHouseDefaults } from './firstPass'
import { firstPassFurniture } from './furniture'
import { placeOpenings } from './walls'

const r = (id: string, name: string, type: RoomType, x: number, y: number, w: number, d: number, bathId?: string): Room => ({
  id, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, ...(bathId ? { bathId } : {}),
})
/** A room in a wing, in that wing's own feet. */
const w = (wingId: string) => (id: string, name: string, type: RoomType, x: number, y: number, d0: number, d1: number, bathId?: string): Room =>
  ({ ...r(id, name, type, x, y, d0, d1, bathId), wingId })
const west = w('west-wing'), east = w('east-wing')
const vault = (heightFt: number, ridge?: 'ew' | 'ns', extra: Partial<Ceiling> = {}): Ceiling => ({ form: 'vaulted', height: ft(heightFt), ...(ridge ? { ridge } : {}), ...extra })

/*
 * Main house, third layout (v3), from Garrett's brief of 2026-11-09 (docs/design-brief.md): mountain modern, a
 * courtyard U with its wings splayed 20 degrees so the courtyard opens south to the view.
 *
 * - The center bar (house frame, x 0 to 136, y 0 to 68) holds the living spaces along its courtyard side: kitchen,
 *   dining, the vaulted great room with a glass gable and a floor-to-ceiling stone fireplace, and the lower, cozier
 *   hearth room. The north side holds the garage, library, stair, the tall entry under a timber canopy, the den, and
 *   a gear room. The walkout under the bar opens onto the sunken courtyard, with the indoor pool under the great room.
 * - The west wing turns 20 degrees clockwise about the bar's southwest corner: guests on the main floor, kids above,
 *   joined to the kids' rooms over the bar's west end.
 * - The east wing turns 20 degrees counterclockwise about the bar's southeast corner: the primary suite, vaulted with
 *   beams, glass to the south, a fireplace, and a deck over the courtyard.
 * - Each wing pivots on the bar's outside corner, so a small wedge opens on the courtyard side of each joint. The
 *   joints are short glass links: an opening on each side names the room beyond.
 *
 * Bearing lines in the bar: y = 0, 28, 44, 68 and x = 17, 50, 68, 114, 136.
 */
const WINGS: Wing[] = [
  { id: 'west-wing', name: 'Guest and kids wing', pivot: { x: 0, y: 0 }, angle: -20 },
  { id: 'east-wing', name: 'Primary wing', pivot: { x: ft(136), y: 0 }, angle: 20 },
]

const walkout: Room[] = [
  // West: theater (buried on the north), a game room, the woodshop and mechanical on the courtyard side.
  r('theater', '20-seat theater', 'living', 0, 44, 36, 24),
  r('game-room', 'Game room, pool table and darts', 'living', 0, 28, 36, 16),
  r('woodshop', 'Dust-controlled woodshop', 'service', 0, 0, 22, 28),
  r('mech', 'Mechanical', 'service', 22, 0, 14, 12),
  r('pool-equip', 'Pool equipment', 'service', 22, 12, 14, 16),
  // Middle: the gym open to the courtyard, the craft room behind it, the theater lobby at the foot of the stair.
  r('gym', 'Gym (free weights, machines, mats, Pilates)', 'wellness', 36, 0, 32, 29),
  r('craft', 'Family craft room (paper, 3D printing, sewing)', 'living', 36, 29, 32, 15),
  r('theater-lobby', 'Theater lobby, candy wall, popcorn and soda', 'circulation', 36, 44, 18, 24),
  r('w-stair', 'Stairs', 'circulation', 54, 44, 14, 14),
  r('w-elevator', 'Elevator', 'service', 54, 58, 8, 10),
  r('w-storage', 'Storage', 'service', 62, 58, 6, 10),
  // Under the great room: the indoor pool. Behind it the lower family room and bar, lockers, wine, the safe room.
  r('indoor-pool', 'Indoor pool, laps and play', 'pool', 68, 0, 46, 44),
  r('w-lounge', 'Lower family room and bar', 'living', 68, 44, 22, 24),
  r('w-hall', 'Pool hall', 'circulation', 90, 44, 24, 8),
  r('locker', 'Locker room and showers', 'bath', 90, 52, 12, 16),
  r('w-powder', 'Powder', 'bath', 102, 52, 6, 16),
  r('wine-cellar', 'Wine cellar', 'service', 108, 52, 6, 16),
  // East: hot tub and cold plunge on the courtyard, the spa behind, the safe room buried in the northeast corner.
  r('pool-deck', 'Hot tub and cold plunge', 'wellness', 114, 0, 22, 16),
  r('spa-lounge', 'Spa lounge and showers', 'wellness', 114, 16, 22, 12),
  r('steam', 'Steam room', 'wellness', 114, 28, 11, 8),
  r('sauna', 'Sauna', 'wellness', 125, 28, 11, 8),
  r('massage', 'Massage room', 'wellness', 114, 36, 10, 12),
  r('hair-nail', 'Hair and nail', 'wellness', 124, 36, 12, 12),
  { ...r('safe-room', 'Safe room', 'service', 114, 48, 10, 20), safeRoom: true },
  r('w-storage-2', 'Spa storage', 'service', 124, 48, 12, 20),
  // The sunken courtyard between the wings, at the walkout floor.
  r('courtyard', 'Sunken courtyard, lawn and fire pit', 'outdoor', 36, -44, 68, 44),
]

const main: Room[] = [
  // West end: the family hall to the guest and kids wing, laundry, and the mudroom off the garage.
  r('family-hall', 'Family hall, to the guest and kids wing', 'circulation', 0, 0, 17, 14),
  r('laundry', 'Laundry', 'service', 0, 14, 17, 10),
  r('mudroom', 'Mudroom, lockers, bench, and dog wash', 'service', 0, 24, 17, 20),
  // The courtyard side: kitchen with a breakfast bay, dining, the great room, the hearth room.
  { ...r('kitchen', 'Eat-in party kitchen, island, breakfast bay', 'living', 17, 0, 33, 28), ceiling: vault(17, 'ew') },
  r('pantry', 'Pantry and cold storage', 'service', 17, 28, 16, 16),
  r('scullery', 'Scullery, full second kitchen', 'service', 33, 28, 17, 16),
  { ...r('dining', 'Formal dining', 'living', 50, 0, 18, 28), ceiling: { form: 'beamed', height: ft(10), spacing: ft(4) } },
  r('bar', 'Bar and wine alcove', 'living', 50, 28, 18, 16),
  { ...r('great', 'Great room, vaulted, stone fireplace', 'living', 68, 0, 46, 44), ceiling: vault(24, 'ns', { spacing: ft(11), glassEnds: ['s'] }) },
  r('primary-hall', 'Primary suite entry', 'circulation', 114, 0, 22, 14),
  { ...r('hearth', 'Hearth room, fireplace and window seat', 'living', 114, 14, 22, 17), ceiling: { form: 'flat', height: ft(9) } },
  r('e-hall', 'Side hall to the screened porch', 'circulation', 114, 31, 22, 13),
  // The north side: garage, library, stair, the tall entry, powder, den, gear room.
  r('garage', '3-car garage', 'garage', 0, 44, 42, 24),
  r('office', 'Library and home office, window seat', 'living', 42, 44, 12, 24),
  r('m-stair', 'Stairs', 'circulation', 54, 44, 14, 14),
  r('m-elevator', 'Elevator', 'service', 54, 58, 8, 10),
  r('coat', 'Coat closet', 'service', 62, 58, 6, 10),
  { ...r('foyer', 'Formal foyer, north door, timber canopy', 'circulation', 68, 44, 20, 28), ceiling: vault(18, 'ns', { spacing: 0 }) },
  r('powder', 'Powder', 'bath', 88, 44, 8, 24),
  r('den', 'Den with a window seat', 'living', 96, 44, 16, 24),
  r('gear', 'Ski and gear room, side entry', 'service', 112, 44, 24, 24),
  // Outdoor rooms: the covered courtyard porch with its outdoor kitchen and fireplace, and the screened porch.
  r('terrace', 'Covered courtyard porch, outdoor kitchen and fireplace', 'outdoor', 32, -16, 72, 16),
  r('screened-porch', 'Screened porch', 'outdoor', 136, 31, 16, 16),
  // West wing, main floor: guests.
  west('guest-entry', 'Guest wing entry', 'circulation', 0, -12, 18, 12),
  west('guest-hall', 'Guest hall', 'circulation', 12, -30, 6, 18),
  west('extra-bed', 'Extra bedroom', 'bedroom', 0, -30, 12, 18, 'extra-bath'),
  west('extra-bath', 'Extra bedroom bath', 'bath', 0, -38, 12, 8),
  west('w-linen', 'Linen and storage', 'service', 0, -44, 12, 6),
  west('w-closet', 'Guest closet', 'service', 12, -44, 6, 14),
  west('guest-sitting', 'Guest suite sitting room', 'living', 18, -16, 14, 16),
  west('guest-bed', 'Guest or in-law bedroom', 'bedroom', 18, -36, 14, 20, 'guest-bath'),
  west('guest-bath', 'Guest bath', 'bath', 18, -44, 14, 8),
  // East wing: the primary suite.
  east('primary-gallery', 'Primary gallery', 'circulation', -12, -20, 12, 20),
  east('closet-hers', 'Her closet', 'service', -36, -16, 12, 16),
  east('closet-his', 'His closet', 'service', -24, -16, 12, 16),
  east('vanity', 'Vanity and makeup', 'service', -36, -28, 8, 12),
  east('bath-hers', 'Her bath', 'bath', -28, -28, 16, 12),
  east('bath-his', 'His bath', 'bath', -36, -40, 14, 12),
  east('linen', 'Linen', 'service', -22, -40, 10, 12),
  east('primary-nook', 'Primary morning bar and reading nook', 'living', -12, -40, 12, 20),
  { ...east('primary', 'Primary bedroom, fireplace, glass to the south', 'bedroom', -36, -62, 22, 22, 'bath-his'), ceiling: vault(17, 'ew', { spacing: ft(8) }) },
  { ...east('primary-sitting', 'Primary sitting area, window seat', 'living', -14, -62, 14, 22), ceiling: vault(15, 'ns', { spacing: 0 }) },
  east('primary-deck', 'Primary deck over the courtyard', 'outdoor', -36, -76, 36, 14),
]

const upper: Room[] = [
  // Over the bar's west end.
  r('kids-landing', 'Kids landing and reading nook, to the kids wing', 'circulation', 0, 0, 17, 28),
  r('kids-gallery', 'Kids gallery, built-in desks and window seats', 'circulation', 0, 28, 24, 16),
  r('kid-7', 'Kid bedroom 7, reading nook', 'bedroom', 24, 28, 12, 16, 'kid-7-bath'),
  r('kid-7-bath', 'Bath 7', 'bath', 36, 28, 6, 16),
  r('u-closet', 'Kids closet and linen', 'service', 42, 28, 8, 16),
  r('kid-3-bath', 'Bath 3', 'bath', 50, 28, 6, 16),
  r('kid-3', 'Kid bedroom 3', 'bedroom', 56, 28, 12, 16, 'kid-3-bath'),
  r('kid-1-bath', 'Bath 1', 'bath', 0, 44, 6, 24),
  r('kid-1', 'Kid bedroom 1', 'bedroom', 6, 44, 12, 24, 'kid-1-bath'),
  r('kids-living', 'Kids living area', 'living', 18, 44, 28, 24),
  r('homework', 'Homework and art room', 'living', 46, 44, 8, 24),
  r('u-stair', 'Stairs', 'circulation', 54, 44, 14, 14),
  r('u-elevator', 'Elevator', 'service', 54, 58, 8, 10),
  r('u-storage', 'Kids storage', 'service', 62, 58, 6, 10),
  // West wing, upper floor: the rest of the kids' rooms, each with its own bath, and their deck.
  west('kids-hall', 'Kids hall, window seat at the end', 'circulation', 12, -44, 6, 44),
  west('kid-2', 'Kid bedroom 2, bunk nook', 'bedroom', 0, -16, 12, 16, 'kid-2-bath'),
  west('kid-2-bath', 'Bath 2', 'bath', 0, -22, 12, 6),
  west('kid-4', 'Kid bedroom 4, bunk nook', 'bedroom', 0, -38, 12, 16, 'kid-4-bath'),
  west('kid-4-bath', 'Bath 4', 'bath', 0, -44, 12, 6),
  west('kid-5', 'Kid bedroom 5', 'bedroom', 18, -14, 14, 14, 'kid-5-bath'),
  west('kid-5-bath', 'Bath 5', 'bath', 18, -20, 14, 6),
  west('kid-6', 'Kid bedroom 6', 'bedroom', 18, -34, 14, 14, 'kid-6-bath'),
  west('kid-6-bath', 'Bath 6', 'bath', 18, -40, 14, 6),
  west('kids-linen', 'Kids linen', 'service', 18, -44, 14, 4),
  west('kids-deck', 'Kids deck', 'outdoor', 0, -56, 18, 12),
]

/** The brief as checkable requirements. Sizes are working targets, to wall centerlines. */
const program: ProgramItem[] = [
  { roomId: 'kitchen', need: 'Large eat-in kitchen for parties, island and table', levelId: 'main', minArea: 900, minWidth: 20, near: ['terrace'] },
  { roomId: 'scullery', need: 'Scullery as a complete second kitchen', levelId: 'main', minArea: 250 },
  { roomId: 'great', need: 'Vaulted great room on the courtyard', levelId: 'main', minArea: 900, minWidth: 20, near: ['terrace'] },
  { roomId: 'dining', need: 'Formal dining', levelId: 'main', minArea: 400, near: ['kitchen'] },
  { roomId: 'foyer', need: 'Formal front door on the north', levelId: 'main', minArea: 250 },
  { roomId: 'mudroom', need: 'Family mudroom with lockers and dog wash, next to the garage', levelId: 'main', minArea: 300, near: ['garage'] },
  { roomId: 'garage', need: '3-car garage', levelId: 'main', minArea: 900, minWidth: 24 },
  { roomId: 'office', need: 'Home office and library', minArea: 250 },
  { roomId: 'bar', need: 'Bar and wine alcove off the great room', levelId: 'main', minArea: 200 },
  { roomId: 'hearth', need: 'A lower, cozier hearth room', levelId: 'main', minArea: 300 },
  { roomId: 'primary', need: 'Primary bedroom on the main floor, with fireplace', levelId: 'main', minArea: 400, minWidth: 16 },
  { roomId: 'primary-sitting', need: 'Sitting area connected to the primary bedroom', levelId: 'main', minArea: 250, near: ['primary'] },
  { roomId: 'bath-his', need: 'His bathroom', levelId: 'main', minArea: 120 },
  { roomId: 'bath-hers', need: 'Her bathroom', levelId: 'main', minArea: 150 },
  { roomId: 'closet-his', need: 'His walk-in closet', levelId: 'main', minArea: 120 },
  { roomId: 'closet-hers', need: 'Her walk-in closet', levelId: 'main', minArea: 150 },
  { roomId: 'vanity', need: 'Vanity or makeup area', levelId: 'main', minArea: 80 },
  { roomId: 'primary-deck', need: 'Private deck off the primary suite', levelId: 'main', near: ['primary-sitting'] },
  { roomId: 'guest-bed', need: 'Guest or in-law suite with its own sitting room', levelId: 'main', minArea: 250, near: ['guest-sitting'] },
  { roomId: 'screened-porch', need: 'Screened porch', levelId: 'main' },
  { roomId: 'kids-living', need: 'Separate kids living area on the upper floor', levelId: 'upper', minArea: 600 },
  ...[1, 2, 3, 4, 5, 6, 7].map(n => ({ roomId: `kid-${n}`, need: `Kid bedroom ${n} on the upper floor`, levelId: 'upper', minArea: 180, minWidth: 11 })),
  { roomId: 'kids-deck', need: 'Deck off the kids floor', levelId: 'upper' },
  { roomId: 'extra-bed', need: 'One to two additional bedrooms', minArea: 200 },
  { roomId: 'craft', need: 'Walkout craft room for paper, 3D printing, and sewing', levelId: 'walkout', minArea: 450 },
  { roomId: 'woodshop', need: 'Separate dust-controlled woodshop on the walkout level', levelId: 'walkout', minArea: 450 },
  { roomId: 'theater', need: '20-seat theater', minArea: 750, minWidth: 20, near: ['theater-lobby'], seats: 20 },
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
 * Roofs: mountain modern, a mix of steep gables and low sheds in dark standing seam. The great room and the entry
 * carry tall gables facing the courtyard and the drive; the kitchen, the kids' block, and the wings have their own
 * gables; the porches get low sheds.
 */
const roof = (id: string, name: string, levelId: string, x: number, y: number, rw: number, d: number, form: Roof['form'], pitch: number, ridgeOrLow: string, wingId?: string): Roof => ({
  id, name, levelId, rect: { x: ft(x), y: ft(y), w: ft(rw), d: ft(d) }, form, pitch, overhang: ft(2),
  ridge: ridgeOrLow === 'ns' ? 'ns' : 'ew', low: (['n', 's', 'e', 'w'].includes(ridgeOrLow) ? ridgeOrLow : 's') as Roof['low'], ...(wingId ? { wingId } : {}),
})
const roofs: Roof[] = [
  roof('roof-great', 'Great room roof', 'main', 68, 0, 46, 44, 'gable', 10, 'ns'),
  roof('roof-kitchen', 'Kitchen and dining roof', 'main', 17, 0, 51, 28, 'gable', 8, 'ew'),
  roof('roof-kids', 'Kids block roof', 'upper', 0, 28, 68, 40, 'gable', 8, 'ew'),
  roof('roof-landing', 'Kids landing roof', 'upper', 0, 0, 17, 28, 'shed', 4, 'e'),
  roof('roof-entry', 'Entry gable and timber canopy', 'main', 68, 44, 20, 28, 'gable', 10, 'ns'),
  roof('roof-north', 'North side roof', 'main', 88, 44, 48, 24, 'gable', 8, 'ew'),
  roof('roof-hearth', 'Hearth room roof', 'main', 114, 0, 22, 44, 'gable', 6, 'ns'),
  roof('roof-porch', 'Courtyard porch roof', 'main', 32, -16, 72, 16, 'shed', 3, 's'),
  roof('roof-screened', 'Screened porch roof', 'main', 136, 31, 16, 16, 'shed', 3, 'e'),
  roof('roof-west-wing', 'Guest and kids wing roof', 'upper', 0, -44, 32, 44, 'gable', 8, 'ns', 'west-wing'),
  roof('roof-primary', 'Primary wing roof', 'main', -36, -62, 36, 62, 'gable', 10, 'ns', 'east-wing'),
]

const firstPass: HouseModel = withHouseDefaults({
  buildingId: 'main-house',
  style: 'mountain-modern',
  // The owner chose to keep the walkout facing south and excavate for it: the courtyard is dug to the walkout floor.
  excavated: true,
  origin: p(1060, 5409),
  concept: true,
  program,
  roofs,
  wings: WINGS,
  levels: [
    { id: 'walkout', name: 'Walkout level', elevation: ft(-11), floorHeight: ft(11), exposed: ['s'], rooms: walkout },
    { id: 'main', name: 'Main floor', elevation: 0, floorHeight: ft(11), rooms: main },
    { id: 'upper', name: 'Kids floor', elevation: ft(11), floorHeight: ft(10), rooms: upper },
  ],
})

const opening = (id: string, roomId: string, side: Opening['side'], offsetFt: number, widthFt: number, extra: Partial<Opening> = {}): Opening =>
  ({ id, kind: 'opening', roomId, side, offset: ft(offsetFt), width: ft(widthFt), height: ft(8), sill: 0, ...extra })
const door = (id: string, roomId: string, side: Opening['side'], offsetFt: number, width: number, extra: Partial<Opening> = {}): Opening =>
  ({ id, kind: 'door', roomId, side, offset: ft(offsetFt), width, height: 80, sill: 0, swing: 'in', ...extra })
const glass = (id: string, roomId: string, side: Opening['side'], offsetFt: number, widthFt: number, heightFt = 8, sillFt = 1, extra: Partial<Opening> = {}): Opening =>
  ({ id, kind: 'window', roomId, side, offset: ft(offsetFt), width: ft(widthFt), height: ft(heightFt), sill: ft(sillFt), operation: 'fixed', ...extra })

/** Hand-placed openings: the joints, the open plan around the great room, the glass, the bays, and the doors out. */
const HAND: Opening[] = [
  // The joints: a cased opening each side of each glass link.
  opening('j-family-guest', 'family-hall', 's', 5, 3.5, { through: 'guest-entry' }),
  opening('j-guest-family', 'guest-entry', 'n', 5, 3.5, { through: 'family-hall' }),
  opening('j-landing-kids', 'kids-landing', 's', 15, 3.5, { through: 'kids-hall' }),
  opening('j-kids-landing', 'kids-hall', 'n', 3, 3.5, { through: 'kids-landing' }),
  opening('j-hall-primary', 'primary-hall', 's', 17, 3.5, { through: 'primary-gallery' }),
  opening('j-primary-hall', 'primary-gallery', 'n', 7, 3.5, { through: 'primary-hall' }),
  // Service: the garage into the mudroom, the kitchen into the pantry and scullery.
  door('garage-mudroom', 'garage', 's', 8, 36, { swing: 'out' }),
  opening('kitchen-pantry', 'kitchen', 'n', 8, 3.5),
  opening('kitchen-scullery', 'kitchen', 'n', 25, 4),
  // Primary suite: the bedroom opens wide to its sitting area; the vanity belongs with her bath.
  opening('primary-sitting-open', 'primary', 'e', 11, 8),
  // The kids' closet opens from their living area, not through two baths.
  door('u-closet-door', 'u-closet', 'n', 2, 30),
  door('vanity-bath-hers', 'vanity', 'e', 6, 32),
  // Open plan: wide cased openings between the kitchen, dining, bar, great room, foyer, den, and hearth room.
  opening('kitchen-dining', 'kitchen', 'e', 14, 16),
  opening('dining-great', 'dining', 'e', 14, 12),
  opening('bar-great', 'bar', 'e', 8, 10),
  opening('great-foyer', 'great', 'n', 10, 10),
  opening('great-den', 'great', 'n', 37, 8),
  opening('great-hearth', 'great', 'e', 22.5, 8),
  opening('great-primary-hall', 'great', 'e', 7, 6),
  // The great room's glass wall to the courtyard, with doors out to the porch at each end.
  door('great-porch-w', 'great', 's', 4, 72, { height: 96, swing: 'out' }),
  glass('great-glass', 'great', 's', 23, 30, 9, 1),
  door('great-porch-e', 'great', 's', 42, 72, { height: 96, swing: 'out' }),
  // Kitchen: a breakfast bay with a seat, and a door to the porch.
  glass('kitchen-bay', 'kitchen', 's', 8, 12, 5, 1.5, { bay: { form: 'angled', depth: ft(4), seat: true }, operation: 'casement' }),
  door('kitchen-porch', 'kitchen', 's', 24, 72, { height: 96, swing: 'out' }),
  glass('dining-glass', 'dining', 's', 9, 12, 7, 1.5),
  // Hearth room: a box bay with a window seat on the east.
  glass('hearth-bay', 'hearth', 'e', 8.5, 8, 5, 1.5, { bay: { form: 'box', depth: ft(3), seat: true }, operation: 'casement' }),
  door('e-hall-porch', 'e-hall', 'e', 6.5, 36, { swing: 'out' }),
  // Library window seat in a bay on the north.
  glass('office-bay', 'office', 'n', 6, 8, 5, 1.5, { bay: { form: 'box', depth: ft(3), seat: true }, operation: 'casement' }),
  door('gear-side-entry', 'gear', 'n', 12, 36, { swing: 'in' }),
  // The tall entry: a glass transom over the front door.
  glass('foyer-glass', 'foyer', 'n', 16, 5, 9, 1),
  // Primary suite: a glass wall south from the bedroom, a window seat bay in the sitting area.
  glass('primary-glass', 'primary', 's', 11, 16, 8, 1, { operation: 'slider' }),
  glass('primary-sitting-bay', 'primary-sitting', 'e', 11, 8, 5, 1.5, { bay: { form: 'angled', depth: ft(2.5), seat: true }, operation: 'casement' }),
  // A reading nook in a bay off the kids' landing, and a door from the kids' hall to their deck.
  glass('kids-landing-seat', 'kids-landing', 'w', 14, 6, 5, 1.5, { bay: { form: 'box', depth: ft(2.5), seat: true }, operation: 'casement' }),
  door('kids-deck-door', 'kids-hall', 's', 3, 36, { swing: 'out' }),
]

/** The first pass's doors, windows, and openings, less any on a wall where a hand-placed one overlaps them. */
const handIds = new Set(HAND.map(o => o.id))
const trial = placeOpenings({ ...firstPass, openings: [...HAND, ...firstPass.openings] })
const clash = new Set(trial.filter(o => !handIds.has(o.id) && /overlaps/.test(o.problem ?? '') && HAND.some(x => o.problem!.includes(x.id))).map(o => o.id))
/** First-pass doors that the hand-placed ones replace: the garage into the library, his bath into her vanity, the kids' closet through their baths. */
const REPLACED: [string, string][] = [['garage', 'office'], ['bath-his', 'vanity'], ['u-closet', 'kid-7-bath'], ['u-closet', 'kid-3-bath']]
const replaced = new Set(trial.filter(o => REPLACED.some(([a, b]) => (o.roomId === a && o.leadsTo === b) || (o.roomId === b && o.leadsTo === a))).map(o => o.id))
const finished: HouseModel = { ...firstPass, openings: [...firstPass.openings.filter(o => !clash.has(o.id) && !replaced.has(o.id)), ...HAND] }

/** Fireplaces, built-ins, and nooks from the brief, placed by hand where the recipe would not put them. */
const extra: FurnitureItem[] = []

/** Furnished after the openings are final, so pieces keep clear of the real doors. */
export const mainHouse: HouseModel = { ...finished, furniture: [...firstPassFurniture(finished), ...extra] }
