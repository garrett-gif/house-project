import type { FurnitureItem, HouseModel, Opening, ProgramItem, Room, RoomType } from './types'
import { ft, p } from './geometry'
import { withHouseDefaults } from './firstPass'
import { CATALOG, firstPassFurniture } from './furniture'
import { placeOpenings } from './walls'

/** Overhead doors on every building but the main house are 16 ft tall, per Garrett. */
export const OVERHEAD_DOOR_HEIGHT = 16

/**
 * The office and dispatch building, the car collection building, and the entertainment shop, from Garrett's
 * answers on 2026-11-09. Each is a detailed building: rooms in local feet, the first pass of doors, windows, roofs,
 * and furniture, then the doors and machines that need placing by hand.
 */
type R = [string, string, RoomType, number, number, number, number]
const rooms = (prefix: string, list: R[], twoStory: string[] = []): Room[] =>
  list.map(([id, name, type, x, y, w, d]) => ({ id: `${prefix}-${id}`, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, ...(twoStory.includes(id) ? { twoStory: true } : {}) }))
const door = (id: string, roomId: string, side: Opening['side'], offsetFt: number, widthFt: number, kind: Opening['kind'] = 'door', heightFt = 7): Opening =>
  ({ id, kind, roomId, side, offset: ft(offsetFt), width: ft(widthFt), height: ft(heightFt), sill: 0, ...(kind === 'door' ? { swing: 'out' as const } : {}) })

/** Builds a detailed building and furnishes it after its own doors are in, keeping any hand-placed pieces. */
function build(house: Parameters<typeof withHouseDefaults>[0], extraDoors: Opening[] = [], placed: FurnitureItem[] = []): HouseModel {
  const first = withHouseDefaults({ ...house, furniture: [] })
  // Big flat-ish gables suit these long spans better than the house's 8:12.
  const roofs = first.roofs.map(r => ({ ...r, pitch: 4 }))
  // Hand-placed doors win: drop any first-pass opening on the same wall that they overlap. Overhead doors are 16 ft.
  const extraIds = new Set(extraDoors.map(o => o.id))
  const trial = placeOpenings({ ...first, openings: [...extraDoors, ...first.openings] })
  const clash = new Set(trial.filter(o => !extraIds.has(o.id) && /overlaps/.test(o.problem ?? '') && extraDoors.some(x => o.problem!.includes(x.id))).map(o => o.id))
  const openings = [...first.openings.filter(o => !clash.has(o.id)), ...extraDoors].map(o => o.kind === 'garage-door' ? { ...o, height: ft(OVERHEAD_DOOR_HEIGHT) } : o)
  const withDoors: HouseModel = { ...first, roofs, openings }
  const done = new Set(placed.map(i => i.roomId))
  const furnished = firstPassFurniture(withDoors).filter(i => !done.has(i.roomId))
  return { ...withDoors, furniture: [...placed, ...furnished] }
}

// ---------------------------------------------------------------------------------------------------------------
// Office and dispatch: one story, lodge-style, at the compound entrance. Entry from the south, by the office lane.
const OFFICE: R[] = [
  ['training-a', 'Training room A, operable wall to B', 'living', 0, 0, 24, 44],
  ['training-b', 'Training room B, operable wall to A', 'living', 24, 0, 24, 44],
  ['reception', 'Reception lobby, fireplace', 'circulation', 48, 0, 40, 44],
  ['exec-lounge', 'Executive lounge and bar', 'living', 88, 0, 20, 24],
  ['exec-office', 'Executive office', 'living', 108, 0, 28, 24],
  ['exec-bath', 'Executive bath', 'bath', 136, 0, 12, 24],
  ['exec-closet', 'Executive closet', 'service', 148, 0, 12, 24],
  ['exec-ante', 'Executive anteroom and assistant', 'living', 88, 24, 48, 20],
  ['exec-conference', 'Executive conference room', 'living', 136, 24, 24, 20],
  ['hall', 'Office hall', 'circulation', 0, 44, 160, 8],
  ['eoc', 'Emergency operations room, 40 seats', 'living', 0, 52, 44, 48],
  ['dispatch', 'Dispatch floor, 8 positions', 'living', 44, 52, 30, 30],
  ['radio', 'Radio and server room', 'service', 44, 82, 14, 18],
  ['dispatch-rest', 'Dispatcher rest room and kitchenette', 'living', 58, 82, 16, 18],
  ['conference', 'Conference room, 16 seats', 'living', 74, 52, 22, 34],
  ['records', 'Records and plans room', 'service', 74, 86, 22, 14],
  ['break', 'Break room', 'living', 96, 52, 26, 26],
  ['restrooms', 'Restrooms', 'bath', 96, 78, 14, 22],
  ['showers', 'Staff showers and lockers', 'bath', 110, 78, 12, 22],
  ['mail', 'Mail, print, and supply', 'service', 122, 52, 20, 48],
  ['storage', 'Records storage', 'service', 142, 52, 18, 48],
  ['open', 'Open office', 'living', 160, 0, 26, 100],
  ...[0, 1, 2, 3, 4, 5].map((i): R => [`office-${i + 1}`, `Private office ${i + 1}`, 'living', 186, i * 16 + (i === 5 ? 0 : 0), 14, i === 5 ? 20 : 16]),
]
const officeProgram: ProgramItem[] = [
  { roomId: 'of-training-a', need: 'Training room for 25, opening to B for 50', seats: 25, near: ['of-training-b'] },
  { roomId: 'of-training-b', need: 'Training room for 25, opening to A for 50', seats: 25 },
  { roomId: 'of-conference', need: 'Conference room for 16', seats: 16 },
  { roomId: 'of-eoc', need: 'Emergency operations room for 40, beside dispatch', seats: 40, near: ['of-dispatch'] },
  { roomId: 'of-dispatch', need: 'Dispatch floor with 8 positions', holds: { 'dispatch-row-4': 2 }, near: ['of-radio'] },
  { roomId: 'of-exec-office', need: 'Large executive office with a private bath and lounge', minArea: 500, near: ['of-exec-bath', 'of-exec-lounge'] },
  { roomId: 'of-exec-conference', need: 'Private conference room off the executive suite', seats: 8 },
  { roomId: 'of-break', need: 'Break room', minArea: 500 },
  { roomId: 'of-reception', need: 'Reception', minArea: 800 },
]
export const officeBuilding: HouseModel = build({
  buildingId: 'offices', origin: p(3360, 440), concept: true, program: officeProgram,
  levels: [{ id: 'of-floor', name: 'Office floor', elevation: 0, floorHeight: ft(12), rooms: rooms('of', OFFICE) }],
}, [
  door('of-entry', 'of-reception', 's', 20, 6), door('of-exec-entry', 'of-exec-lounge', 's', 3, 3.5),
  // A 24 ft operable wall: open, the two training rooms are one room for 50.
  door('of-operable-wall', 'of-training-a', 'e', 22, 24, 'opening', 9),
])

// ---------------------------------------------------------------------------------------------------------------
// Car collection: a two-story showroom for 20, a storage hall for 35, toys, the car shop, and a mezzanine lounge
// that looks down on the showroom. Climate controlled throughout.
const CAR_GROUND: R[] = [
  ['showroom', 'Showroom, 20 cars', 'garage', 0, 0, 120, 96],
  ['wash', 'Wash bay', 'garage', 120, 0, 24, 32],
  ['detail', 'Detail bay', 'garage', 144, 0, 24, 32],
  ['prep', 'Body and prep bay', 'garage', 168, 0, 24, 32],
  ['paint', 'Paint booth', 'garage', 192, 0, 24, 32],
  ['mixing', 'Paint mixing room', 'service', 216, 0, 24, 32],
  ['mechanic', 'Mechanic area, 4 lifts', 'garage', 120, 32, 64, 32],
  ['tires', 'Tire and alignment', 'garage', 184, 32, 32, 32],
  ['parts', 'Parts and tools room', 'service', 216, 32, 24, 32],
  ['lobby', 'Car lobby', 'circulation', 120, 64, 24, 32],
  ['stair', 'Stairs', 'circulation', 144, 64, 14, 32],
  ['elevator', 'Elevator', 'service', 158, 64, 8, 32],
  ['restrooms', 'Restrooms', 'bath', 166, 64, 20, 32],
  ['break', 'Break room', 'living', 186, 64, 20, 32],
  ['mech', 'Mechanical and climate control', 'service', 206, 64, 34, 32],
  ['storage', 'Storage hall, 35 cars', 'garage', 0, 96, 180, 72],
  ['toys', 'Toys: motorcycles, UTVs, snowmobiles', 'garage', 180, 96, 60, 72],
]
const CAR_MEZZ: R[] = [
  ['lounge', "Collector's lounge, bar, and event space", 'living', 120, 0, 96, 64],
  ['landing', 'Mezzanine landing', 'circulation', 120, 64, 24, 32],
  ['mezz-stair', 'Stairs', 'circulation', 144, 64, 14, 32],
  ['mezz-elevator', 'Elevator', 'service', 158, 64, 8, 32],
  ['mezz-restrooms', 'Mezzanine restrooms', 'bath', 166, 64, 20, 32],
  ['catering', 'Catering kitchen', 'service', 186, 64, 20, 32],
]
/** Cars on display with room to walk around them, the rest nose in along a storage aisle, and the toys in rows. */
function carPlacements(): FurnitureItem[] {
  const out: FurnitureItem[] = []
  const add = (kind: string, roomId: string, x: number, y: number, rotation: FurnitureItem['rotation'] = 0) => out.push({ id: `cb-${kind}-${out.length + 1}`, kind, roomId, x, y, rotation })
  const show = [...Array(5).fill('suv'), ...Array(7).fill('classic-car'), ...Array(8).fill('sports-car')]
  show.forEach((kind, i) => add(kind, 'cb-showroom', 120 + 240 * (i % 6), 144 + 288 * Math.floor(i / 6)))
  const stored = [...Array(11).fill('suv'), ...Array(12).fill('classic-car'), ...Array(12).fill('sports-car')]
  stored.forEach((kind, i) => add(kind, 'cb-storage', 60 + 120 * (i % 18), i < 18 ? 1308 : 1860, i < 18 ? 180 : 0))
  for (let i = 0; i < 8; i++) add('motorcycle', 'cb-toys', 2160 + 80 + 70 * i, 1250)
  for (let i = 0; i < 4; i++) add('utv', 'cb-toys', 2160 + 90 + 150 * i, 1500)
  for (let i = 0; i < 4; i++) add('snowmobile', 'cb-toys', 2160 + 90 + 150 * i, 1800)
  // Four lifts in a row across the mechanic area.
  for (let i = 0; i < 4; i++) add('car-lift', 'cb-mechanic', 1548 + 180 * i, 576)
  return out
}
const carProgram: ProgramItem[] = [
  { roomId: 'cb-showroom', need: 'Showroom for 20, with room to walk around each car', holds: { suv: 5, 'classic-car': 7, 'sports-car': 8 } },
  { roomId: 'cb-storage', need: 'Climate-controlled storage for 35 more', holds: { suv: 11, 'classic-car': 12, 'sports-car': 12 } },
  { roomId: 'cb-toys', need: 'Motorcycles, UTVs, and snowmobiles', holds: { motorcycle: 8, utv: 4, snowmobile: 4 } },
  { roomId: 'cb-paint', need: 'Paint booth with a mixing room', holds: { 'paint-booth': 1 }, near: ['cb-mixing'] },
  { roomId: 'cb-mechanic', need: 'Mechanic area with 4 lifts', holds: { 'car-lift': 4 } },
  { roomId: 'cb-lounge', need: 'Lounge and event space on the mezzanine, open to the showroom', minArea: 3000 },
]
export const carBuilding: HouseModel = build({
  buildingId: 'car-building', origin: p(1170, 4320), concept: true, program: carProgram,
  levels: [
    { id: 'cb-floor', name: 'Ground floor', elevation: 0, floorHeight: ft(18), rooms: rooms('cb', CAR_GROUND, ['showroom']) },
    { id: 'cb-mezz', name: 'Mezzanine', elevation: ft(18), floorHeight: ft(12), rooms: rooms('cb', CAR_MEZZ) },
  ],
}, [door('cb-entry', 'cb-showroom', 'w', 48, 6)], carPlacements())

// ---------------------------------------------------------------------------------------------------------------
// Entertainment shop: the indoor kart track opens south onto the outdoor track; the fun rooms line a concourse,
// with a viewing mezzanine over the trampolines.
const ENT_GROUND: R[] = [
  ['track', 'Indoor kart track', 'living', 0, 0, 230, 140],
  ['pit', 'Kart pit and garage', 'garage', 230, 0, 20, 140],
  ['climbing', 'Climbing wall', 'wellness', 250, 0, 40, 60],
  ['laser', 'Laser tag arena', 'living', 290, 0, 60, 60],
  ['trampoline', 'Trampoline park, foam pit, dodgeball, ninja course', 'wellness', 250, 60, 100, 80],
  ['gear', 'Sports and party storage', 'service', 350, 0, 60, 46],
  ['court', 'Sports court, basketball and pickleball', 'wellness', 350, 46, 60, 94],
  ['concourse', 'Concourse', 'circulation', 0, 140, 240, 16],
  ['concourse-mid', 'Concourse', 'circulation', 240, 140, 90, 16],
  ['concourse-east', 'Concourse', 'circulation', 330, 140, 80, 16],
  ['bowling', 'Bowling, 4 lanes', 'living', 0, 156, 100, 44],
  ['arcade', 'Arcade', 'living', 100, 156, 40, 44],
  ['golf', 'Golf simulators', 'living', 140, 156, 40, 44],
  ['gaming', 'Gaming lounge', 'living', 180, 156, 20, 44],
  ['snack', 'Snack bar', 'living', 200, 156, 20, 44],
  ['kitchen', 'Commercial kitchen', 'service', 220, 156, 20, 44],
  ['party', 'Party room', 'living', 240, 156, 30, 44],
  ['restrooms', 'Restrooms', 'bath', 270, 156, 20, 44],
  ['lobby', 'Arrival lobby', 'circulation', 290, 156, 40, 44],
  ['stair', 'Stairs', 'circulation', 330, 156, 14, 44],
  ['elevator', 'Elevator', 'service', 344, 156, 8, 44],
  ['mech', 'Mechanical', 'service', 352, 156, 28, 44],
  ['storage', 'Storage', 'service', 380, 156, 30, 44],
]
const ENT_MEZZ: R[] = [
  ['viewing', 'Viewing mezzanine and lounge', 'living', 240, 140, 90, 60],
  ['mezz-stair', 'Stairs', 'circulation', 330, 156, 14, 44],
  ['mezz-elevator', 'Elevator', 'service', 344, 156, 8, 44],
]
const entProgram: ProgramItem[] = [
  { roomId: 'en-track', need: 'Indoor kart track of about 35,000 sq ft, connected to the outdoor track', minArea: 30000, holds: { 'kart-circuit': 1 } },
  { roomId: 'en-pit', need: 'Kart pit with 8 karts', holds: { 'go-kart': 8 }, near: ['en-track'] },
  { roomId: 'en-trampoline', need: 'Trampoline park with a foam pit', holds: { 'trampoline-court': 1, 'foam-pit': 1 } },
  { roomId: 'en-bowling', need: 'Four-lane bowling alley', holds: { 'bowling-lanes-4': 1 } },
  { roomId: 'en-golf', need: 'Two golf simulator bays', holds: { 'golf-sim-bay': 2 } },
  { roomId: 'en-kitchen', need: 'Commercial kitchen serving the party room and events', near: ['en-party', 'en-snack'] },
  { roomId: 'en-viewing', need: 'Viewing mezzanine looking over the trampolines', minArea: 4000 },
]
export const entertainmentBuilding: HouseModel = build({
  buildingId: 'entertainment', origin: p(700, 4320), concept: true, program: entProgram,
  levels: [
    { id: 'en-floor', name: 'Ground floor', elevation: 0, floorHeight: ft(18), rooms: rooms('en', ENT_GROUND, ['trampoline', 'climbing', 'court']) },
    { id: 'en-mezz', name: 'Mezzanine', elevation: ft(18), floorHeight: ft(14), rooms: rooms('en', ENT_MEZZ) },
  ],
}, [
  // Two wide doors from the indoor track out to the outdoor track.
  door('en-track-out-1', 'en-track', 's', 60, 16, 'garage-door', 16),
  door('en-track-out-2', 'en-track', 's', 170, 16, 'garage-door', 16),
])

export const AMENITY_IDS = ['offices', 'car-building', 'entertainment'] as const
/** For tests and the summary: every catalog kind used here exists. */
export const amenityKinds = () => [officeBuilding, carBuilding, entertainmentBuilding].flatMap(h => (h.furniture ?? []).map(i => i.kind)).filter(k => !CATALOG[k])
