import type { FurnitureItem, HouseModel, Opening, ProgramItem, Roof, Room, RoomType } from './types'
import { ft, p } from './geometry'
import { withHouseDefaults } from './firstPass'
import { CATALOG, furnishRoom } from './furniture'

/**
 * Shop buildings for the compound's fleets, generated from what they hold. Every machine is stored indoors in
 * drive-through lanes: each lane has an overhead door at both ends, and machines park nose to tail along it with
 * 4 ft between them and 3 ft at each end. Support rooms sit in a wing at the west end.
 */
export interface FleetGroup { kind: string; count: number; laneFt: number }
export interface ShopSpec {
  buildingId: string
  prefix: string
  name: string
  /** Southwest corner on the site, in feet. */
  at: [number, number]
  depthFt: number
  bayName: string
  groups: FleetGroup[]
  /** Support rooms in the west wing, in feet within the wing: [id, name, type, x, y, w, d]. */
  wing?: { widthFt: number; rooms: [string, string, RoomType, number, number, number, number][] }
  door: { widthFt: number; heightFt: number }
  /** Support rooms the brief asks for, as program items. */
  needs?: ProgramItem[]
}

/** How many of a machine fit nose to tail in a lane of the given depth. */
export const perLane = (kind: string, depthFt: number) => Math.max(1, Math.floor((ft(depthFt) - 72 + 48) / (CATALOG[kind].d + 48)))

export function shopBuilding(spec: ShopSpec): HouseModel {
  const levelId = `${spec.prefix}-floor`
  const wingW = spec.wing?.widthFt ?? 0
  // A 4 ft walkway along the west wall keeps people doors clear of the first lane.
  const WALK = 4
  const lanes = spec.groups.flatMap(g => Array.from({ length: Math.ceil(g.count / perLane(g.kind, spec.depthFt)) }, () => g))
  const bayW = WALK + lanes.reduce((s, l) => s + l.laneFt, 0)
  const bayId = `${spec.prefix}-bays`
  const rooms: Room[] = [
    ...(spec.wing?.rooms ?? []).map(([id, name, type, x, y, w, d]) => ({ id: `${spec.prefix}-${id}`, name, type, rect: { x: ft(x), y: ft(y), w: ft(w), d: ft(d) } })),
    { id: bayId, name: spec.bayName, type: 'garage', rect: { x: ft(wingW), y: 0, w: ft(bayW), d: ft(spec.depthFt) } },
  ]
  const width = wingW + bayW
  const roofs: Roof[] = [{ id: `${spec.prefix}-roof`, name: `${spec.name} roof`, levelId, rect: { x: 0, y: 0, w: ft(width), d: ft(spec.depthFt) }, form: 'gable', pitch: 3, ridge: width >= spec.depthFt ? 'ew' : 'ns', low: 's', overhang: ft(2) }]
  const program: ProgramItem[] = [
    { roomId: bayId, need: `Indoor bays for the whole fleet`, holds: Object.fromEntries(spec.groups.map(g => [g.kind, g.count])) },
    ...(spec.needs ?? []),
  ]
  const base = withHouseDefaults({
    buildingId: spec.buildingId, origin: p(...spec.at), concept: true, program, roofs, furniture: [],
    levels: [{ id: levelId, name: 'Shop floor', elevation: 0, floorHeight: ft(spec.door.heightFt + 6), rooms }],
  })

  // Overhead doors at both ends of every lane, and the machines parked along it facing north.
  const doors: Opening[] = []
  const machines: FurnitureItem[] = []
  const placedOf = new Map<string, number>()
  let x = WALK
  lanes.forEach((g, i) => {
    const center = ft(x + g.laneFt / 2)
    for (const side of ['s', 'n'] as const) doors.push({ id: `${spec.prefix}-od-${i + 1}${side}`, kind: 'garage-door', roomId: bayId, side, offset: center, width: ft(Math.min(spec.door.widthFt, g.laneFt - 2)), height: ft(spec.door.heightFt), sill: 0 })
    const c = CATALOG[g.kind]
    const n = Math.min(perLane(g.kind, spec.depthFt), g.count - (placedOf.get(g.kind) ?? 0))
    for (let k = 0; k < n; k++) {
      const count = (placedOf.get(g.kind) ?? 0) + 1
      placedOf.set(g.kind, count)
      machines.push({ id: `${spec.prefix}-${g.kind}-${count}`, kind: g.kind, roomId: bayId, x: ft(wingW) + center, y: 36 + c.d / 2 + k * (c.d + 48), rotation: 0 })
    }
    x += g.laneFt
  })
  // Keep the first pass's people doors and windows; replace its overhead doors with the lane doors.
  // A people door at the east end of the bays, so the building has a walk-out door that is not an overhead door.
  const exit: Opening = { id: `${spec.prefix}-exit`, kind: 'door', roomId: bayId, side: 'e', offset: ft(spec.depthFt / 2), width: 36, height: 84, sill: 0, swing: 'out' }
  const openings = [...base.openings.filter(o => !(o.roomId === bayId && o.kind === 'garage-door')), ...doors, exit]
  const withDoors: HouseModel = { ...base, openings }
  const support = rooms.filter(r => r.id !== bayId).flatMap(r => furnishRoom(withDoors, r))
  return { ...withDoors, furniture: [...machines, ...support] }
}

const WILDLAND_WING: ShopSpec['wing'] = {
  widthFt: 60,
  rooms: [
    ['fitness', 'Crew fitness room', 'wellness', 0, 0, 24, 40],
    ['ready', 'Crew ready room', 'living', 0, 40, 24, 36],
    ['offices', 'Station offices', 'living', 0, 76, 24, 34],
    ['hall', 'Station hall', 'circulation', 24, 0, 8, 110],
    ['decon', 'Decon showers and restrooms', 'bath', 32, 0, 28, 34],
    ['hose', 'Hose wash and drying', 'service', 32, 34, 28, 36],
    ['lockers', 'Gear lockers', 'service', 32, 70, 28, 40],
  ],
}
const FORESTRY_WING: ShopSpec['wing'] = {
  widthFt: 60,
  rooms: [
    ['offices', 'Forestry shop offices', 'living', 0, 0, 24, 40],
    ['ready', 'Crew ready room', 'living', 0, 40, 24, 40],
    ['parts', 'Parts room', 'service', 0, 80, 24, 50],
    ['hall', 'Shop hall', 'circulation', 24, 0, 8, 130],
    ['locker-room', 'Crew locker room and restrooms', 'bath', 32, 0, 28, 40],
    ['gear', 'Gear lockers', 'service', 32, 40, 28, 40],
    ['fabrication', 'Welding and fabrication', 'service', 32, 80, 28, 50],
  ],
}
const MAINTENANCE_WING: ShopSpec['wing'] = {
  widthFt: 60,
  rooms: [
    ['offices', 'Shop offices', 'living', 0, 0, 24, 36],
    ['parts', 'Parts room', 'service', 0, 36, 24, 74],
    ['hall', 'Shop hall', 'circulation', 24, 0, 8, 110],
    ['locker-room', 'Mechanics locker room and restrooms', 'bath', 32, 0, 28, 36],
    ['fabrication', 'Welding and fabrication', 'service', 32, 36, 28, 74],
  ],
}

/** The compound's shops, sized for at least 25 of each machine, everything indoors. */
export const SHOP_SPECS: ShopSpec[] = [
  {
    buildingId: 'wildland-shop', prefix: 'wl', name: 'Wildland fire station', at: [3290, 1400], depthFt: 110, bayName: 'Apparatus bays',
    groups: [{ kind: 'engine-t3', count: 25, laneFt: 16 }, { kind: 'engine-t6', count: 25, laneFt: 16 }, { kind: 'water-tender', count: 25, laneFt: 16 }, { kind: 'crew-carrier', count: 3, laneFt: 16 }],
    wing: WILDLAND_WING, door: { widthFt: 14, heightFt: 14 },
    needs: [
      { roomId: 'wl-lockers', need: 'Gear lockers by the apparatus floor', minArea: 800, near: ['wl-bays'] },
      { roomId: 'wl-hose', need: 'Hose wash and drying', minArea: 800, near: ['wl-bays'] },
      { roomId: 'wl-fitness', need: 'Crew fitness room', minArea: 800 },
      { roomId: 'wl-offices', need: 'Station offices', minArea: 600 },
    ],
  },
  {
    buildingId: 'dozer-barn', prefix: 'dz', name: 'Dozer barn', at: [3820, 1360], depthFt: 160, bayName: 'Dozer and transport bays',
    groups: [{ kind: 'dozer-lowboy', count: 25, laneFt: 18 }], door: { widthFt: 16, heightFt: 16 },
  },
  {
    buildingId: 'maintenance-shop', prefix: 'mx', name: 'Maintenance shop', at: [4110, 1400], depthFt: 110, bayName: 'Service and wash bays',
    groups: [{ kind: 'service-lift', count: 12, laneFt: 20 }, { kind: 'wash-rack', count: 2, laneFt: 20 }],
    wing: MAINTENANCE_WING, door: { widthFt: 16, heightFt: 16 },
    needs: [{ roomId: 'mx-parts', need: 'Parts room', minArea: 1500 }],
  },
  {
    buildingId: 'forestry-shop', prefix: 'fs', name: 'Forestry machine shop', at: [4500, 1385], depthFt: 130, bayName: 'Harvest machine bays',
    groups: [{ kind: 'feller-buncher', count: 25, laneFt: 14 }, { kind: 'harvester', count: 25, laneFt: 14 }, { kind: 'skidder', count: 25, laneFt: 14 }, { kind: 'forwarder', count: 25, laneFt: 14 }],
    wing: FORESTRY_WING, door: { widthFt: 12, heightFt: 14 },
    needs: [{ roomId: 'fs-gear', need: 'Gear lockers', minArea: 800 }, { roomId: 'fs-offices', need: 'Forestry offices', minArea: 600 }],
  },
  {
    buildingId: 'forestry-barn', prefix: 'fb', name: 'Forestry machine barn', at: [3290, 880], depthFt: 130, bayName: 'Loader, excavator, masticator, and chipper bays',
    groups: [{ kind: 'log-loader', count: 25, laneFt: 14 }, { kind: 'excavator', count: 25, laneFt: 14 }, { kind: 'masticator', count: 25, laneFt: 14 }, { kind: 'chipper', count: 25, laneFt: 14 }],
    door: { widthFt: 12, heightFt: 14 },
  },
  {
    buildingId: 'forestry-fleet', prefix: 'ff', name: 'Forestry fleet barn', at: [3830, 880], depthFt: 130, bayName: 'Log truck, pickup, and UTV bays',
    groups: [{ kind: 'log-truck', count: 25, laneFt: 14 }, { kind: 'pickup', count: 25, laneFt: 12 }, { kind: 'utv', count: 25, laneFt: 10 }],
    door: { widthFt: 12, heightFt: 14 },
  },
]

export const shopBuildings = (): HouseModel[] => SHOP_SPECS.map(shopBuilding)
