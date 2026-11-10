import type { HouseModel, ProgramItem, Roof, Room } from './types'
import { ft, p } from './geometry'
import { build, door, rooms } from './amenities'
import type { R } from './amenities'

/*
 * The compound's lodging, commons, classroom, hangars, pool house, and fuel island, from Garrett's answers on
 * 2026-11-09 (docs/design-brief.md). Each is a detailed building in local feet like the shops and amenities, with the
 * first pass of doors, windows, roofs, and furniture, then the doors that need placing by hand. Origins put each
 * building where the site plan had its box.
 */

const shed = (id: string, name: string, levelId: string, x: number, y: number, w: number, d: number, low: Roof['low'], pitch = 3): Roof =>
  ({ id, name, levelId, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, form: 'shed', pitch, ridge: 'ew', low, overhang: ft(1) })
const gable = (id: string, name: string, levelId: string, x: number, y: number, w: number, d: number, ridge: 'ew' | 'ns', pitch = 8): Roof =>
  ({ id, name, levelId, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) }, form: 'gable', pitch, ridge, low: 's', overhang: ft(2) })

// ---------------------------------------------------------------------------------------------------------------
// Lodges: all private rooms, each with its own bath ("it cuts down on drama"), most for one person, some for couples.
// Two floors on a single corridor, 9 rooms a floor: 14 singles and 4 couples' rooms, 22 beds. A lodge lounge at the
// west end, a stair at each end, and a housekeeping closet. 118 x 54 ft.
function lodgeFloor(level: 'a' | 'b'): R[] {
  const out: R[] = []
  const couples = level === 'b'
  // A room: a 12 x 24 ft bedroom on the corridor, with an 8 x 9 ft bath on the corridor side and a walk-in closet on the window side.
  const unit = (n: number, x: number, south: boolean) => {
    const name = south || !couples ? `Private room ${n}` : `Couple's room ${n}`
    if (south) out.push([`room-${n}`, name, 'bedroom', x, 0, 12, 24], [`bath-${n}`, `Bath ${n}`, 'bath', x + 12, 15, 8, 9], [`closet-${n}`, `Closet ${n}`, 'service', x + 12, 0, 8, 15])
    else out.push([`room-${n}`, name, 'bedroom', x, 30, 12, 24], [`bath-${n}`, `Bath ${n}`, 'bath', x + 12, 30, 8, 9], [`closet-${n}`, `Closet ${n}`, 'service', x + 12, 39, 8, 15])
  }
  out.push([`lounge`, 'Lodge lounge', 'living', 0, 0, 18, 24])
  ;[18, 38, 58, 78, 98].forEach((x, i) => unit(i + 1, x, true))
  out.push(['corridor', 'Corridor', 'circulation', 0, 24, 118, 6])
  out.push(['stair-w', 'Stairs, west', 'circulation', 0, 30, 14, 24])
  ;[14, 34, 54, 74].forEach((x, i) => unit(i + 6, x, false))
  out.push(['stair-e', 'Stairs, east', 'circulation', 94, 30, 14, 24], ['housekeeping', 'Housekeeping closet', 'service', 108, 30, 10, 24])
  return out
}
/** Each room's bath is its own: rooms name their baths. */
const withBaths = (list: Room[]) => list.map(r => r.type === 'bedroom' ? { ...r, bathId: r.id.replace('-room-', '-bath-') } : r)

function lodge(n: number, cx: number, cy: number): HouseModel {
  const pre = `l${n}`
  const lv = (k: 'a' | 'b') => withBaths(rooms(`${pre}${k}`, lodgeFloor(k)))
  const program: ProgramItem[] = [
    { roomId: `${pre}a-lounge`, need: 'A lounge in each lodge', minArea: 300 },
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(i => [`${pre}a-room-${i}`, `${pre}b-room-${i}`].map(id => ({ roomId: id, need: 'A private room with its own bath', minArea: 150, near: [id.replace('-room-', '-bath-')] }))),
  ]
  return build({
    buildingId: `lodge-${n}`, origin: p(cx - 59, cy - 27), concept: true, program, style: 'lodge',
    levels: [
      { id: `${pre}-ground`, name: 'Ground floor', elevation: 0, floorHeight: ft(10), rooms: lv('a') },
      { id: `${pre}-upper`, name: 'Upper floor', elevation: ft(10), floorHeight: ft(9), rooms: lv('b') },
    ],
  }, [
    // Doors at both ends of the corridor and into the lounge from the porch side.
    door(`${pre}-door-w`, `${pre}a-corridor`, 'w', 3, 3.5), door(`${pre}-door-e`, `${pre}a-corridor`, 'e', 3, 3.5),
    door(`${pre}-door-lounge`, `${pre}a-lounge`, 's', 9, 3.5),
  ], [], 8)
}
export const lodges = (): HouseModel[] => [[2050, 1650], [2700, 1650], [2050, 1100], [2700, 1100], [2380, 1050]].map(([x, y], i) => lodge(i + 1, x, y))

// ---------------------------------------------------------------------------------------------------------------
// Commons: dining for 150 with a commercial kitchen, laundry, lounge and game room, fitness, and a small store.
// One story, 160 x 100 ft, lodge style. The dining hall and lounge face south; deliveries come to the east side.
const COMMONS: R[] = [
  ['dining', 'Dining hall, 160 seats', 'living', 0, 0, 64, 50],
  ['kitchen', 'Commercial kitchen', 'service', 64, 0, 36, 36],
  ['servery', 'Servery and coffee bar', 'living', 64, 36, 36, 14],
  ['dry-storage', 'Dry storage and walk-ins', 'service', 100, 0, 16, 25],
  ['dish', 'Dish room', 'service', 100, 25, 16, 25],
  ['laundry', 'Laundry room for the compound', 'service', 116, 0, 44, 25],
  ['restrooms', 'Restrooms', 'bath', 116, 25, 22, 25],
  ['mech', 'Mechanical and electrical', 'service', 138, 25, 22, 25],
  ['hall', 'Commons hall', 'circulation', 0, 50, 160, 8],
  ['lounge', 'Lounge and game room', 'living', 0, 58, 50, 42],
  ['store', 'Camp store', 'living', 50, 58, 20, 42],
  ['lobby', 'Entry lobby', 'circulation', 70, 58, 20, 42],
  ['fitness', 'Fitness room', 'wellness', 90, 58, 50, 42],
  ['fitness-lockers', 'Fitness restrooms and showers', 'bath', 140, 58, 20, 42],
]
const commonsProgram: ProgramItem[] = [
  { roomId: 'cm-dining', need: 'Dining for 150', seats: 150, near: ['cm-servery'] },
  { roomId: 'cm-kitchen', need: 'Commercial kitchen behind the servery', minArea: 1000, near: ['cm-servery', 'cm-dry-storage', 'cm-dish'] },
  { roomId: 'cm-laundry', need: 'Laundry for the compound', minArea: 800 },
  { roomId: 'cm-lounge', need: 'Lounge and game room', minArea: 1500 },
  { roomId: 'cm-fitness', need: 'Fitness room', minArea: 1500 },
  { roomId: 'cm-store', need: 'A small store', minArea: 600 },
]
export const commonsBuilding = (): HouseModel => build({
  buildingId: 'commons', origin: p(2380 - 80, 1460 - 50), concept: true, program: commonsProgram, style: 'lodge',
  levels: [{ id: 'cm-floor', name: 'Commons floor', elevation: 0, floorHeight: ft(12), rooms: rooms('cm', COMMONS) }],
}, [
  door('cm-entry', 'cm-lobby', 'n', 10, 6),
  door('cm-servery-open', 'cm-servery', 'w', 7, 12, 'opening', 8),
  door('cm-dock', 'cm-dry-storage', 's', 8, 8, 'garage-door', 10),
], [], 6)

// ---------------------------------------------------------------------------------------------------------------
// Cabins: six, each 28 x 26 ft, sleeping four: a living room with a kitchenette, a bedroom with a queen, a bunk room,
// a bath, and a covered porch. Two rows of three, 75 ft apart east-west and 60 ft north-south.
function cabinRooms(n: number, x: number, y: number): R[] {
  return [
    [`${n}-living`, `Cabin ${n} living and kitchenette`, 'living', x, y, 16, 26],
    [`${n}-bed`, `Cabin ${n} bedroom`, 'bedroom', x + 16, y + 15, 12, 11],
    [`${n}-bunk`, `Cabin ${n} bunk room`, 'bedroom', x + 16, y + 7, 12, 8],
    [`${n}-bath`, `Cabin ${n} bath`, 'bath', x + 16, y, 12, 7],
    [`${n}-porch`, `Cabin ${n} covered porch`, 'outdoor', x, y - 8, 16, 8],
  ]
}
const CABIN_AT: [number, number][] = [[0, 0], [75, 0], [150, 0], [0, 60], [75, 60], [150, 60]]
export const cabinsBuilding = (): HouseModel => build({
  buildingId: 'cabins', origin: p(2150 - 89, 680 - 39), concept: true, style: 'lodge',
  program: CABIN_AT.map((_, i) => ({ roomId: `ca-${i + 1}-living`, need: 'A cabin for four with a kitchenette', minArea: 350 })),
  roofs: CABIN_AT.flatMap(([x, y], i) => [gable(`ca-roof-${i + 1}`, `Cabin ${i + 1} roof`, 'ca-floor', x, y, 28, 26, 'ns', 10), shed(`ca-porch-roof-${i + 1}`, `Cabin ${i + 1} porch roof`, 'ca-floor', x, y - 8, 16, 8, 's')]),
  // Both sleeping rooms share the cabin's bath, which also opens to the living room.
  levels: [{ id: 'ca-floor', name: 'Cabins', elevation: 0, floorHeight: ft(9), rooms: rooms('ca', CABIN_AT.flatMap(([x, y], i) => cabinRooms(i + 1, x, y))).map(r => r.type === 'bedroom' ? { ...r, bathId: r.id.replace(/-(bed|bunk)$/, '-bath') } : r) }],
}, CABIN_AT.flatMap((_, i) => [door(`ca-${i + 1}-door`, `ca-${i + 1}-living`, 's', 8, 3), door(`ca-${i + 1}-bath-door`, `ca-${i + 1}-bath`, 'w', 2.5, 2.5)]), [], 10)

// ---------------------------------------------------------------------------------------------------------------
// Classroom: three classrooms of 30, a fire behavior and forestry lab, a gear room with an overhead door, an
// instructor office, restrooms, and a lobby. About 7,000 sq ft, 100 x 70 ft.
const CLASSROOM: R[] = [
  ['class-1', 'Classroom 1, 30 seats', 'living', 0, 0, 30, 36],
  ['class-2', 'Classroom 2, 30 seats', 'living', 30, 0, 30, 36],
  ['class-3', 'Classroom 3, 30 seats', 'living', 60, 0, 30, 36],
  ['instructor', 'Instructor office', 'living', 90, 0, 10, 36],
  ['hall', 'Classroom hall', 'circulation', 0, 36, 100, 8],
  ['lab', 'Fire behavior and forestry lab', 'living', 0, 44, 40, 26],
  ['gear', 'Gear room for training', 'service', 40, 44, 30, 26],
  ['lobby', 'Classroom lobby', 'circulation', 70, 44, 16, 26],
  ['restrooms', 'Restrooms', 'bath', 86, 44, 14, 26],
]
export const classroomBuilding = (): HouseModel => build({
  buildingId: 'classroom', origin: p(4100 - 50, 2030 - 35), concept: true, style: 'metal-timber',
  program: [
    ...[1, 2, 3].map(n => ({ roomId: `cr-class-${n}`, need: `Classroom ${n} for 30`, seats: 30 })),
    { roomId: 'cr-lab', need: 'Fire behavior and forestry lab', minArea: 900 },
    { roomId: 'cr-gear', need: 'Gear room', minArea: 600 },
  ],
  levels: [{ id: 'cr-floor', name: 'Classroom floor', elevation: 0, floorHeight: ft(12), rooms: rooms('cr', CLASSROOM) }],
}, [door('cr-entry', 'cr-lobby', 'n', 8, 6), door('cr-gear-door', 'cr-gear', 'n', 15, 12, 'garage-door', 16)])

// ---------------------------------------------------------------------------------------------------------------
// Hangars: six light helicopters in one hangar, a twin turboprop in another, aircraft maintenance, a pilot ready room,
// aviation parts, crew quarters, and fuel and oil storage. 210 x 120 ft, clean metal with timber. Hangar doors face
// south to the helipads and the airstrip apron.
const HANGARS: R[] = [
  ['helo', 'Helicopter hangar, 6 aircraft', 'garage', 0, 0, 150, 90],
  ['plane', 'Airplane hangar', 'garage', 150, 0, 60, 60],
  ['maint', 'Aircraft maintenance shop', 'service', 150, 60, 60, 30],
  ['hall', 'Hangar hall', 'circulation', 0, 90, 210, 6],
  ['ready', 'Pilot ready room', 'living', 0, 96, 40, 24],
  ['parts', 'Aviation parts room', 'service', 40, 96, 30, 24],
  ['office', 'Flight operations office', 'living', 70, 96, 20, 24],
  ['restrooms', 'Restrooms and showers', 'bath', 90, 96, 20, 24],
  ['crew', 'Flight crew quarters', 'living', 110, 96, 40, 24],
  ['oil', 'Oil and fluids storage', 'service', 150, 96, 20, 24],
  ['mech', 'Mechanical', 'service', 170, 96, 40, 24],
]
export const hangarBuilding = (): HouseModel => build({
  buildingId: 'hangars', origin: p(5970 - 105, 1970 - 60), concept: true, style: 'metal-timber',
  program: [
    { roomId: 'hg-helo', need: 'Hangar for 4 to 6 helicopters', holds: { helicopter: 6 } },
    { roomId: 'hg-plane', need: 'Hangar for 1 to 2 airplanes', holds: { airplane: 1 } },
    { roomId: 'hg-maint', need: 'Aircraft maintenance', near: ['hg-helo', 'hg-plane'] },
    { roomId: 'hg-ready', need: 'Pilot ready room' },
  ],
  levels: [{ id: 'hg-floor', name: 'Hangar floor', elevation: 0, floorHeight: ft(24), rooms: rooms('hg', HANGARS) }],
}, [
  ...[15, 52, 89, 126].map((x, i) => door(`hg-helo-door-${i + 1}`, 'hg-helo', 's', x, 22, 'garage-door', 16)),
  door('hg-plane-door', 'hg-plane', 's', 30, 23, 'garage-door', 16),
  door('hg-entry', 'hg-ready', 'n', 8, 3.5),
])

// ---------------------------------------------------------------------------------------------------------------
// Pool house: changing rooms, a pool bar, a covered loggia with the outdoor kitchen and fireplace, and pool equipment,
// on the north side of the pool deck at the open south end of the main house's courtyard. Mountain modern, 80 x 48 ft.
const POOL: R[] = [
  ['deck', 'Outdoor pool deck', 'outdoor', 0, 0, 80, 30],
  ['changing-w', 'Changing room, west', 'bath', 0, 30, 12, 18],
  ['changing-e', 'Changing room, east', 'bath', 12, 30, 12, 18],
  ['bar', 'Pool bar', 'living', 24, 30, 20, 18],
  ['loggia', 'Covered loggia, outdoor kitchen and fireplace', 'outdoor', 44, 30, 24, 18],
  ['equipment', 'Pool equipment', 'service', 68, 30, 12, 18],
]
export const poolHouse = (): HouseModel => build({
  buildingId: 'outdoor-pool', origin: p(1130 - 40, 5319 - 20), concept: true, style: 'mountain-modern',
  program: [{ roomId: 'ph-bar', need: 'Pool bar', near: ['ph-deck'] }, { roomId: 'ph-loggia', need: 'Outdoor kitchen by the pool', near: ['ph-deck'] }],
  roofs: [gable('ph-roof', 'Pool house roof', 'ph-floor', 0, 30, 44, 18, 'ew', 10), shed('ph-loggia-roof', 'Loggia roof', 'ph-floor', 44, 30, 24, 18, 's'), gable('ph-equip-roof', 'Equipment roof', 'ph-floor', 68, 30, 12, 18, 'ew', 6)],
  levels: [{ id: 'ph-floor', name: 'Pool house', elevation: 0, floorHeight: ft(10), rooms: rooms('ph', POOL) }],
}, [door('ph-changing-w-door', 'ph-changing-w', 's', 6, 3), door('ph-changing-e-door', 'ph-changing-e', 's', 6, 3), door('ph-bar-door', 'ph-bar', 's', 10, 8, 'opening', 8), door('ph-equip-door', 'ph-equipment', 'e', 9, 4)], [], 10)

// ---------------------------------------------------------------------------------------------------------------
// Fuel island: a canopy over four dispensers, a tank farm of three double-wall aboveground tanks in containment, and
// a small building for lubricants, DEF, and the attendant. Laid out with separations: 30 ft between the canopy and the
// tanks, 30 ft between the canopy and the building, the tanks 50 ft from the building. 150 x 100 ft.
const FUEL: R[] = [
  ['canopy', 'Fuel canopy, four dispensers', 'outdoor', 0, 0, 60, 40],
  ['tanks', 'Tank farm in containment', 'outdoor', 90, 0, 60, 40],
  ['lube', 'Lubricant and DEF storage', 'service', 0, 70, 30, 30],
  ['attendant', 'Attendant office', 'living', 30, 70, 12, 18],
  ['restroom', 'Restroom', 'bath', 30, 88, 12, 12],
]
export const fuelIsland = (): HouseModel => build({
  buildingId: 'fuel', origin: p(5050 - 75, 470 - 50), concept: true, style: 'metal-timber',
  program: [{ roomId: 'fu-canopy', need: 'Covered fueling for the fleet' }, { roomId: 'fu-tanks', need: 'Aboveground tanks in containment' }],
  roofs: [shed('fu-canopy-roof', 'Fuel canopy', 'fu-floor', 0, 0, 60, 40, 'n', 3), gable('fu-roof', 'Storage building roof', 'fu-floor', 0, 70, 42, 30, 'ew', 4)],
  levels: [{ id: 'fu-floor', name: 'Fuel island', elevation: 0, floorHeight: ft(14), rooms: rooms('fu', FUEL) }],
}, [door('fu-lube-door', 'fu-lube', 's', 15, 12, 'garage-door', 16), door('fu-attendant-door', 'fu-attendant', 's', 6, 3), door('fu-restroom-door', 'fu-restroom', 's', 6, 2.67)])

/** Every compound building, for the sample estate. */
export const compoundBuildings = (): HouseModel[] => [...lodges(), commonsBuilding(), cabinsBuilding(), classroomBuilding(), hangarBuilding(), poolHouse(), fuelIsland()]

