import type { Access, Building, BuildingUse, Estate, Ignition, Pt, Road, WaterSource, Zone, ZoneKind } from './types'
import { bezier, box, ft, p } from './geometry'
import { mainHouse } from './house'
import { withDerivedGeometry } from './derive'

const SIZE = 6600

/** Planned for every building: metal roofs, ember-resistant vents, boxed eaves, and no combustible decks. */
const PLANNED: Ignition = { roofClass: 'A', emberVents: true, enclosedEaves: true, decks: 'none' }

const b = (id: string, name: string, use: BuildingUse, access: Access, cx: number, cy: number, w: number, d: number, h: number): Building =>
  ({ id, name, use, access, rect: box(cx, cy, w, d), height: ft(h), ignition: PLANNED })

const z = (id: string, name: string, kind: ZoneKind, access: Access, x0: number, y0: number, x1: number, y1: number, cleared: boolean, round = false): Zone =>
  ({ id, name, kind, access, rect: { x: ft(x0), y: ft(y0), w: ft(x1 - x0), d: ft(y1 - y0) }, cleared, round })

const line = (...coords: [number, number][]): Pt[] => coords.map(([x, y]) => p(x, y))

const approach = [
  ...bezier(p(1000, 0), p(500, 1300), p(600, 2500), p(350, 3400)),
  ...bezier(p(350, 3400), p(200, 4300), p(250, 5400), p(750, 5450)).slice(1),
  ...line([750, 5520], [1152, 5520]),
]

const inset = 100
const roads: Road[] = [
  { id: 'estate-drive', name: 'Estate drive', kind: 'estate', points: approach, gate: 'Estate gate', turnaround: true },
  { id: 'guest-road', name: 'Estate cross road', kind: 'estate', points: line([350, 3400], [2520, 3400]) },
  { id: 'guest-north', name: 'Guest and transporter road', kind: 'estate', points: line([1800, 3400], [1800, 5450]), turnaround: true },
  { id: 'entertainment-spur', name: 'Entertainment shop spur', kind: 'estate', points: line([1800, 5050], [1440, 5050]), turnaround: true },
  { id: 'work-main', name: 'Work main road', kind: 'work', points: line([3000, 0], [3000, 1800], [5600, 1800]), gate: 'Work gate' },
  { id: 'work-loop', name: 'Work loop', kind: 'work', points: line([3000, 1800], [3550, 2250], [3550, 4450], [5750, 4450], [5750, 2120], [5600, 1800]) },
  { id: 'ops-yard', name: 'Operations yard road', kind: 'work', points: line([3000, 720], [5400, 720]), turnaround: true },
  { id: 'lodging-street', name: 'Lodging street', kind: 'work', points: line([3000, 1375], [1950, 1375]), turnaround: true },
  { id: 'cabin-street', name: 'Cabin and RV street', kind: 'work', points: line([3000, 790], [2050, 790]), turnaround: true },
  { id: 'gated-link', name: 'Gated link', kind: 'gated-link', points: line([2520, 3400], [3550, 3400]) },
  // Fire lanes, 20 ft wide, so an engine can reach every outside wall within a 150 ft hose pull.
  { id: 'house-fire-lane', name: 'House fire lane', kind: 'estate', width: ft(20), points: line([1000, 5520], [1000, 5300], [1800, 5300]) },
  { id: 'car-fire-lane', name: 'Car building fire lane', kind: 'estate', width: ft(20), turnaround: true, points: line([1440, 5300], [1440, 5560], [1700, 5560]) },
  { id: 'entertainment-fire-lane', name: 'Entertainment shop fire lane', kind: 'estate', width: ft(20), points: line([1440, 5300], [1440, 4930], [1140, 4930], [1140, 5300]) },
  { id: 'guest-fire-lane', name: 'Guest house fire lane', kind: 'estate', width: ft(20), turnaround: true, points: line([750, 5450], [700, 4950]) },
  { id: 'lodging-north-lane', name: 'Lodging north fire lane', kind: 'work', width: ft(20), turnaround: true, points: line([3000, 1720], [1950, 1720]) },
  { id: 'lodging-middle-lane', name: 'Lodging middle fire lane', kind: 'work', width: ft(20), turnaround: true, points: line([3000, 1000], [1950, 1000]) },
  { id: 'cabin-south-lane', name: 'Cabin and RV south fire lane', kind: 'work', width: ft(20), turnaround: true, points: line([3000, 580], [2000, 580]) },
  { id: 'office-lane', name: 'Office fire lane', kind: 'work', width: ft(20), turnaround: true, points: line([3000, 420], [3700, 420]) },
  { id: 'classroom-lane', name: 'Classroom fire lane', kind: 'work', width: ft(20), turnaround: true, points: line([4100, 1800], [4100, 1960]) },
  { id: 'perimeter', name: 'Perimeter road', kind: 'perimeter', points: line([inset, inset], [SIZE - inset, inset], [SIZE - inset, SIZE - inset], [inset, SIZE - inset], [inset, inset]) },
]

/** Fire water: cisterns with dry hydrants near each group of buildings, and the pond. Sizes are planning assumptions. */
const water = (id: string, name: string, kind: WaterSource['kind'], x: number, y: number, gallons: number): WaterSource => ({ id, name, kind, at: p(x, y), gallons })
const waterSources: WaterSource[] = [
  water('estate-cistern', 'Estate fire cistern', 'cistern', 1300, 5520, 60000),
  water('pond-hydrant', 'Pond dry hydrant', 'pond', 2950, 2530, 2000000),
  water('lodging-cistern', 'Lodging fire cistern', 'cistern', 2400, 1250, 60000),
  water('ops-cistern', 'Operations fire cistern', 'cistern', 4300, 900, 100000),
  water('training-cistern', 'Training fire cistern', 'cistern', 4100, 2250, 30000),
  water('aviation-cistern', 'Aviation fire cistern', 'cistern', 5900, 1300, 60000),
]

export const sampleEstate: Estate = withDerivedGeometry({
  name: 'House Project',
  layoutVersion: 3,
  parcel: { seed: 1876, size: ft(SIZE), gridSize: 128 },
  buildings: [
    // The U-shaped outline is derived from the house rooms and origin by withDerivedGeometry.
    { id: 'main-house', name: 'Main house', use: 'residence', access: 'private', height: ft(32), ignition: PLANNED, rect: { x: 0, y: 0, w: 0, d: 0 } },
    b('outdoor-pool', 'Outdoor pool and pool house', 'accessory', 'private', 1155, 5388, 80, 40, 14),
    b('car-building', 'Car collection building', 'accessory', 'private', 1576, 5450, 220, 160, 30),
    b('entertainment', 'Entertainment shop', 'assembly', 'private', 1300, 5050, 240, 160, 32),
    b('guest-house', 'Guest house', 'residence', 'private', 640, 4880, 70, 45, 24),
    b('lodge-1', 'Lodge 1', 'lodging', 'work', 2050, 1650, 150, 60, 26),
    b('lodge-2', 'Lodge 2', 'lodging', 'work', 2700, 1650, 150, 60, 26),
    b('lodge-3', 'Lodge 3', 'lodging', 'work', 2050, 1100, 150, 60, 26),
    b('lodge-4', 'Lodge 4', 'lodging', 'work', 2700, 1100, 150, 60, 26),
    b('lodge-5', 'Lodge 5', 'lodging', 'work', 2380, 1050, 150, 60, 26),
    b('commons', 'Dining, kitchen, laundry, commons', 'assembly', 'work', 2380, 1460, 160, 100, 24),
    b('cabins', 'Cabins', 'lodging', 'work', 2150, 680, 220, 120, 16),
    b('rv', 'RV hookups', 'lodging', 'work', 2650, 680, 200, 120, 2),
    b('offices', 'Offices and dispatch', 'business', 'work', 3470, 500, 160, 110, 28),
    b('forestry-shop', 'Forestry shop', 'business', 'work', 3490, 1440, 300, 120, 28),
    b('wildland-shop', 'Wildland shop', 'business', 'work', 4270, 1440, 300, 120, 28),
    b('maintenance-shop', 'Maintenance shop', 'business', 'work', 5010, 1440, 260, 120, 28),
    b('fuel', 'Fuel island and storage', 'business', 'work', 5050, 470, 160, 120, 18),
    b('classroom', 'Classroom building', 'assembly', 'visitor', 4100, 2030, 150, 90, 20),
    b('hangars', 'Hangars and aviation fuel', 'aviation', 'work', 5970, 1970, 200, 120, 30),
    b('helipads', 'Helipads', 'aviation', 'shared', 5970, 1630, 640, 90, 1),
  ],
  zones: [
    z('estate-fuelbreak', 'Estate fuel break', 'fuelbreak', 'private', 180, 3550, 2580, 5950, false),
    z('estate-core', 'Estate grounds', 'estate', 'private', 400, 3700, 2300, 5750, true),
    z('kart-track', 'Outdoor kart track', 'recreation', 'private', 650, 3800, 1550, 4300, true, true),
    z('operations', 'Operations compound', 'operations', 'work', 3150, 150, 5450, 1800, true),
    { ...z('equipment-yard', 'Equipment yard', 'operations', 'work', 3150, 770, 5310, 1150, true), hardstand: true },
    { ...z('parking', 'Parking', 'operations', 'visitor', 3900, 260, 4700, 680, true), hardstand: true },
    // Widened 50 ft west so the west lodges have 100 ft of cleared ground around them.
    z('lodging', 'Lodging village', 'lodging', 'work', 1850, 500, 2900, 1900, true),
    z('training', 'Training ground', 'training', 'visitor', 3700, 2250, 5600, 4350, false),
    z('aviation-corridor', 'Runway corridor', 'aviation', 'shared', 5710, 2200, 6210, 5700, true),
    { ...z('aviation-apron', 'Aviation apron', 'aviation', 'shared', 5500, 1450, 6400, 2200, true), hardstand: true },
    // Paved aprons around the shops and the fuel island, which an engine can work from.
    { ...z('shop-apron', 'Shop aprons', 'operations', 'work', 3250, 1320, 5250, 1560, true), hardstand: true },
    { ...z('fuel-apron', 'Fuel island apron', 'operations', 'work', 4920, 360, 5200, 580, true), hardstand: true },
    // Cleared ground around the classroom, which otherwise sits in the training forest.
    z('classroom-clearing', 'Classroom clearing', 'training', 'visitor', 3925, 1885, 4275, 2175, true),
    z('incident-camp', 'Incident camp', 'incident', 'shared', 5450, 250, 6350, 1450, true),
    z('pond', 'Pond and fire water', 'water', 'shared', 2630, 2530, 3270, 2970, true, true),
  ],
  roads,
  walkways: [
    { id: 'walk-car', name: 'Covered walkway to car building', points: line([1250, 5430], [1466, 5430]), from: 'main-house', to: 'car-building' },
    { id: 'walk-ent', name: 'Covered walkway to entertainment shop', points: line([1230, 5360], [1230, 5130]), from: 'main-house', to: 'entertainment' },
  ],
  runway: { name: 'Airstrip', rect: box(5960, 3950, 75, 3500) },
  waterSources,
  house: mainHouse,
})
