import type { Building, BuildingUse, Estate, Rect, Utility, UtilityKind, UtilityRules } from './types'
import { area, partsOf, toFt } from './geometry'
import { houseByBuilding } from './houses'

/**
 * Planning values for utilities and security, from common rules of thumb: 100 gallons of water and 75 gallons of
 * sewage a day per person sleeping on site, 15 each per daytime person, a drainfield loading of 0.6 gallons per
 * square foot per day with room for a full replacement field, wells pumped 12 hours a day, a day of stored water,
 * generators sized for 60% of the load they back up, and common separation distances. South Dakota and Meade
 * County rules, soil tests, and the owner's standards should replace them.
 */
export const DEFAULT_UTILITY_RULES: UtilityRules = {
  waterGpdPerBed: 100, waterGpdPerStaff: 15, sewageGpdPerBed: 75, sewageGpdPerStaff: 15,
  drainfieldGpdPerSqFt: 0.6, drainfieldReserve: 2, wellPumpHours: 12, storageDays: 1, backupShare: 0.6,
  wellToSepticFt: 100, wellToFuelFt: 100, septicToBuildingFt: 20, septicToWaterFt: 100, solarShadeFt: 100,
  maxTrenchFt: 1500, sqFtPerParkingSpace: 350, cameraForestFt: 50, approachFt: 300, backupFeedFt: 1500,
  // Site and grading: fire apparatus roads at 10%, building pads and drainfields on gentle ground, sewer fall.
  maxRoadGradePct: 10, maxPerimeterGradePct: 12, maxBuildingSlopePct: 10, maxDrainfieldSlopePct: 15, septicFallFt: 2, wellUpgradientFt: 500,
  maxBeamSpanFt: 32,
}
export const UTILITY_RULE_NAMES = Object.keys(DEFAULT_UTILITY_RULES) as (keyof UtilityRules)[]
export const UTILITY_KINDS: UtilityKind[] = ['well', 'storage', 'septic', 'service', 'solar', 'generator', 'propane']
export const UTILITY_UNIT: Record<UtilityKind, string> = {
  well: 'gpm', storage: 'gallons', septic: 'gallons a day', service: 'kW', solar: 'kW', generator: 'kW', propane: 'gallons',
}
export const UTILITY_BASIS = 'Advisory planning values; replace them with state and county rules, soil and well tests, and your standards.'

export const utilityRules = (e: Estate): UtilityRules => ({ ...DEFAULT_UTILITY_RULES, ...e.utilityRules })

/** Rough peak electrical demand per square foot of floor, by use. */
const WATTS_PER_SQFT: Record<BuildingUse, number> = { residence: 4, lodging: 4, assembly: 6, business: 5, accessory: 2, aviation: 3 }

/** Ground cleared for building or utilities: cleared zones plus every utility's rectangle. */
export const clearedRects = (e: Estate): Rect[] => [...e.zones.filter(z => z.cleared).map(z => z.rect), ...(e.utilities ?? []).map(u => u.rect)]

/** People at peak: sleeping on site and there for the day. Detailed houses count two per bedroom unless set. */
export function occupancy(e: Estate, b: Building) {
  const house = houseByBuilding(e, b.id)
  const beds = b.beds ?? (house ? 2 * house.levels.flatMap(l => l.rooms).filter(r => r.type === 'bedroom').length : 0)
  return { beds, staff: b.staff ?? 0 }
}

/** Floor area in square feet: the main house from its rooms, others from their footprint, two floors for tall homes and lodges. */
export function floorArea(e: Estate, b: Building) {
  const house = houseByBuilding(e, b.id)
  if (house) return house.levels.flatMap(l => l.rooms).filter(r => r.type !== 'outdoor').reduce((s, r) => s + area(r.rect), 0) / 144
  const floors = (b.use === 'residence' || b.use === 'lodging') ? Math.max(1, Math.floor(toFt(b.height) / 12)) : 1
  return partsOf(b).reduce((s, r) => s + area(r), 0) / 144 * floors
}

/** Water, sewage, and electrical demand at peak. */
export function demand(e: Estate, b: Building) {
  const r = utilityRules(e)
  const { beds, staff } = occupancy(e, b)
  return {
    waterGpd: beds * r.waterGpdPerBed + staff * r.waterGpdPerStaff,
    sewageGpd: beds * r.sewageGpdPerBed + staff * r.sewageGpdPerStaff,
    kw: b.loadKw ?? floorArea(e, b) * WATTS_PER_SQFT[b.use] / 1000,
  }
}

/** Drainfield area in square feet a septic system needs for its design flow, primary and reserve. */
export const drainfieldNeed = (e: Estate, u: Utility) => {
  const r = utilityRules(e)
  return u.capacity / r.drainfieldGpdPerSqFt * r.drainfieldReserve
}

/**
 * Utilities of one kind grouped into systems: two that serve any of the same buildings work together, like two
 * wells into one network. Each system lists its utilities, the buildings they serve, and their combined capacity.
 */
export function systems(e: Estate, kind: UtilityKind) {
  const list = (e.utilities ?? []).filter(u => u.kind === kind)
  const groups: { utilities: Utility[]; serves: Set<string> }[] = []
  for (const u of list) {
    const joined = groups.filter(g => u.serves.some(id => g.serves.has(id)))
    const merged = { utilities: [u, ...joined.flatMap(g => g.utilities)], serves: new Set([...u.serves, ...joined.flatMap(g => [...g.serves])]) }
    for (const g of joined) groups.splice(groups.indexOf(g), 1)
    groups.push(merged)
  }
  return groups.map(g => ({ ...g, capacity: g.utilities.reduce((s, u) => s + u.capacity, 0), buildings: e.buildings.filter(b => g.serves.has(b.id)) }))
}
