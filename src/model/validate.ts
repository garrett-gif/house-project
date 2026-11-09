import type { Building, Check, CheckStatus, Estate, Rect } from './types'
import { wallChecks } from './wallChecks'
import { programChecks } from './programChecks'
import { roofChecks } from './roofChecks'
import { fireChecks } from './fireChecks'
import { utilityChecks } from './utilityChecks'
import { securityChecks } from './securityChecks'
import { allHouses, checksForEachHouse } from './houses'
import { SQ_IN_PER_ACRE, area, center, footprintOf, ft, overlaps, partsOf, pathLength, pointToRect, rectDistance, samplePath, toFt } from './geometry'

const QUARTER_MILE = ft(1320)
const ROAD_REACH = ft(350)
const PLANNED_RUNWAY = ft(3500)
const OUTDOOR_POOL_GAP = ft(60)
const MAX_WALKWAY = ft(300)

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const check = (id: string, label: string, ok: boolean, detail: string, failAs: CheckStatus = 'fail', elements: string[] = []): Check =>
  ok || elements.length === 0 ? { id, label, status: ok ? 'pass' : failAs, detail } : { id, label, status: failAs, detail, elements: [...new Set(elements)] }

export function forestAcres(e: Estate) {
  // Zones nested inside a larger cleared zone are not counted twice.
  const cleared = e.zones.filter(z => z.cleared)
  const outer = cleared.filter(z => !cleared.some(o => o !== z && area(o.rect) > area(z.rect) &&
    z.rect.x >= o.rect.x && z.rect.y >= o.rect.y && z.rect.x + z.rect.w <= o.rect.x + o.rect.w && z.rect.y + z.rect.d <= o.rect.y + o.rect.d))
  // Utilities clear their own ground where they sit outside a cleared zone.
  const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y))
  const utilityArea = (e.utilities ?? []).reduce((sum, u) => sum + Math.max(0, area(u.rect) - outer.reduce((s, z) => s + overlap(u.rect, z.rect), 0)), 0)
  const clearedArea = outer.reduce((sum, z) => sum + area(z.rect), 0) + utilityArea
  return (e.parcel.size ** 2 - clearedArea) / SQ_IN_PER_ACRE
}

function nearestRoad(e: Estate, b: Building) {
  let best = Infinity
  for (const road of e.roads) for (const pt of samplePath(road.points, ft(25))) best = Math.min(best, pointToRect(pt, b.rect))
  return best
}

export function validateEstate(e: Estate): Check[] {
  const checks: Check[] = []
  const acres = e.parcel.size ** 2 / SQ_IN_PER_ACRE
  checks.push(check('parcel-size', 'Parcel is at least 1,000 acres', acres >= 999.9, `${n(acres)} acres`))

  const outside = e.buildings.filter(b => b.rect.x < 0 || b.rect.y < 0 || b.rect.x + b.rect.w > e.parcel.size || b.rect.y + b.rect.d > e.parcel.size)
  checks.push(check('inside-parcel', 'All buildings are inside the parcel', outside.length === 0, outside.length ? outside.map(b => b.name).join(', ') : `${e.buildings.length} buildings placed`, 'fail', outside.map(b => b.id)))

  const collisions: string[] = [], colliding: string[] = []
  e.buildings.forEach((a, i) => e.buildings.slice(i + 1).forEach(c => {
    if (footprintOf(a).some(x => footprintOf(c).some(y => overlaps(x, y)))) { collisions.push(`${a.name} and ${c.name}`); colliding.push(a.id, c.id) }
  }))
  checks.push(check('no-collisions', 'Buildings do not overlap', collisions.length === 0, collisions.join('; ') || 'No overlaps', 'fail', colliding))

  const privateBuildings = e.buildings.filter(b => b.access === 'private')
  const workBuildings = e.buildings.filter(b => b.access !== 'private')
  let gap = Infinity, pair = '', pairIds: string[] = []
  for (const a of privateBuildings) for (const c of workBuildings) {
    const d = rectDistance(a.rect, c.rect)
    if (d < gap) { gap = d; pair = `${a.name} to ${c.name}`; pairIds = [a.id, c.id] }
  }
  const training = e.zones.find(z => z.kind === 'training')
  if (training) for (const a of privateBuildings) {
    const d = rectDistance(a.rect, training.rect)
    if (d < gap) { gap = d; pair = `${a.name} to ${training.name}`; pairIds = [a.id, training.id] }
  }
  checks.push(check('separation', 'Estate is at least 1/4 mile from work areas', gap >= QUARTER_MILE, `${n(toFt(gap))} ft closest, ${pair}`, 'fail', pairIds))

  const gates = e.roads.filter(r => r.gate)
  checks.push(check('entrances', 'Separate estate and work entrances', gates.length === 2, gates.map(r => r.gate).join(', ')))

  const stranded = e.buildings.map(b => ({ b, d: nearestRoad(e, b) })).filter(x => x.d > ROAD_REACH)
  checks.push(check('road-access', 'Every building is within 350 ft of a road', stranded.length === 0, stranded.map(x => `${x.b.name}: ${n(toFt(x.d))} ft`).join('; ') || 'All reachable', 'fail', stranded.map(x => x.b.id)))

  const perimeter = e.roads.find(r => r.kind === 'perimeter')
  checks.push(check('perimeter', 'Full perimeter road', !!perimeter, perimeter ? `${(toFt(pathLength(perimeter.points)) / 5280).toFixed(1)} miles` : 'Missing'))

  const forest = forestAcres(e)
  checks.push(check('forest', 'At least 700 acres stay working forest', forest >= 700, `${forest.toFixed(1)} acres uncleared`, 'warn'))

  const runwayLength = Math.max(e.runway.rect.w, e.runway.rect.d)
  checks.push(check('runway', 'Airstrip meets the 3,500 ft planning length', runwayLength >= PLANNED_RUNWAY, `${n(toFt(runwayLength))} ft, not checked against aircraft or FAA guidance`))

  const house = e.buildings.find(b => b.id === e.house.buildingId)
  const pool = e.buildings.find(b => b.id === 'outdoor-pool')
  if (house && pool) {
    const d = Math.min(...partsOf(house).map(part => rectDistance(part, pool.rect)))
    checks.push(check('pool-link', 'Outdoor pool is next to the house', d <= OUTDOOR_POOL_GAP, `${n(toFt(d))} ft apart`, 'fail', [house.id, pool.id]))
  }

  const room = (id: string) => e.house.levels.flatMap(l => l.rooms).find(r => r.id === id)
  const foyer = room('foyer'), garage = room('garage'), primary = room('primary'), kitchen = room('kitchen'), terrace = room('terrace')
  const allRooms = e.house.levels.flatMap(l => l.rooms)
  const midX = (Math.min(...allRooms.filter(r => r.type !== 'garage').map(r => r.rect.x)) + Math.max(...allRooms.map(r => r.rect.x + r.rect.w))) / 2
  const north = Math.max(...allRooms.map(r => r.rect.y + r.rect.d))
  const placement: [boolean | undefined, string, string[]][] = [
    [foyer && foyer.rect.y + foyer.rect.d === north, 'Formal door is not on the north side', ['foyer']],
    [garage && center(garage.rect).x < midX, 'Garage is not on the west side', ['garage']],
    [primary && center(primary.rect).x > midX, 'Primary suite is not on the east side', ['primary']],
    [kitchen && terrace && rectDistance(kitchen.rect, terrace.rect) === 0, 'Kitchen does not reach the terrace', ['kitchen', 'terrace']],
  ]
  const misplaced = placement.filter(([ok]) => !ok)
  checks.push(check('house-placement', 'North door, west garage, east primary, kitchen to terrace', misplaced.length === 0,
    misplaced.map(([, text]) => text).join('; ') || 'Rooms match the brief', 'fail', misplaced.flatMap(([, , ids]) => ids)))

  const longWalks = e.walkways.filter(w => pathLength(w.points) > MAX_WALKWAY)
  checks.push(check('walkways', 'Covered walkways are 300 ft or shorter', longWalks.length === 0,
    e.walkways.map(w => `${n(toFt(pathLength(w.points)))} ft`).join(', '), 'fail', longWalks.map(w => w.id)))

  const overlapsInHouse: string[] = [], overlappingRooms: string[] = []
  for (const level of allHouses(e).flatMap(h => h.levels)) level.rooms.forEach((a, i) => level.rooms.slice(i + 1).forEach(c => {
    if (overlaps(a.rect, c.rect)) { overlapsInHouse.push(`${level.name}: ${a.name} and ${c.name}`); overlappingRooms.push(a.id, c.id) }
  }))
  checks.push(check('house-rooms', 'House rooms do not overlap', overlapsInHouse.length === 0, overlapsInHouse.join('; ') || 'No overlaps', 'fail', overlappingRooms))

  const rooms = e.house.levels.flatMap(l => l.rooms)
  const finished = rooms.filter(r => r.type !== 'garage' && r.type !== 'outdoor').reduce((sum, r) => sum + area(r.rect), 0) / 144
  checks.push(check('house-size', 'House is over 10,000 sq ft', finished > 10000, `${n(finished)} sq ft placeholder massing`))

  const kids = rooms.filter(r => r.id.startsWith('kid-') && r.type === 'bedroom')
  checks.push(check('kids', 'Seven kids’ bedrooms', kids.length === 7, `${kids.length} on the kids floor`))

  const everyRoom = allHouses(e).flatMap(h => h.levels.flatMap(l => l.rooms))
  const bedrooms = everyRoom.filter(r => r.type === 'bedroom')
  const noBath = bedrooms.filter(r => !everyRoom.some(o => o.id === r.bathId && o.type === 'bath'))
  checks.push(check('baths', 'Every bedroom has its own bathroom', noBath.length === 0, noBath.map(r => r.name).join(', ') || `${bedrooms.length} bedrooms matched`, 'fail', noBath.map(r => r.id)))

  checks.push(...checksForEachHouse(e, wallChecks))
  checks.push(...checksForEachHouse(e, programChecks))
  checks.push(...checksForEachHouse(e, roofChecks))
  checks.push(...fireChecks(e))
  checks.push(...utilityChecks(e))
  checks.push(...securityChecks(e))
  return checks
}

export interface CheckChange { id: string; label: string; from: CheckStatus | 'missing'; to: CheckStatus | 'missing'; detail: string }

/** Checks whose status differs between two runs, with the newest detail. */
export function diffChecks(before: Check[], after: Check[]): CheckChange[] {
  const ids = [...new Set([...before, ...after].map(c => c.id))]
  return ids.flatMap(id => {
    const a = before.find(c => c.id === id), b = after.find(c => c.id === id)
    const from = a?.status ?? 'missing', to = b?.status ?? 'missing'
    return from === to ? [] : [{ id, label: (b ?? a)!.label, from, to, detail: (b ?? a)!.detail }]
  })
}
