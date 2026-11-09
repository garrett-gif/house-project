import type { Estate, Rect } from './types'
import { footprintOf, overlaps } from './geometry'
import { sampleEstate } from './sampleEstate'

/**
 * Projects saved before fire planning existed have no water sources, turnarounds, hardstand, or ignition details.
 * They all started from the sample estate, so fill those in from it, matching by id, and leave everything else alone.
 */
export function withFireDefaults(e: Estate): Estate {
  if (e.waterSources !== undefined) return e
  const road = new Map(sampleEstate.roads.map(r => [r.id, r]))
  const zone = new Map(sampleEstate.zones.map(z => [z.id, z]))
  const building = new Map(sampleEstate.buildings.map(b => [b.id, b]))
  return {
    ...e,
    waterSources: structuredClone(sampleEstate.waterSources ?? []),
    roads: e.roads.map(r => r.turnaround === undefined && road.get(r.id)?.turnaround ? { ...r, turnaround: true } : r),
    zones: e.zones.map(z => z.hardstand === undefined && zone.get(z.id)?.hardstand ? { ...z, hardstand: true } : z),
    buildings: e.buildings.map(b => b.ignition === undefined && building.get(b.id)?.ignition ? { ...b, ignition: { ...building.get(b.id)!.ignition! } } : b),
  }
}

/**
 * Projects saved before utilities and security existed get the sample's utilities, cameras, lights, occupancy, and
 * parking, matched by id. Utilities that would land on one of their buildings, and devices on buildings they no
 * longer have, are left out, so the checks show what still needs placing.
 */
export function withUtilityDefaults(e: Estate): Estate {
  if (e.utilities !== undefined) return e
  const building = new Map(sampleEstate.buildings.map(b => [b.id, b]))
  const zone = new Map(sampleEstate.zones.map(z => [z.id, z]))
  const ids = new Set(e.buildings.map(b => b.id))
  const buildings = e.buildings.map(b => {
    const s = building.get(b.id)
    return s ? { ...b, beds: b.beds ?? s.beds, staff: b.staff ?? s.staff, backupPower: b.backupPower ?? s.backupPower, fuelStorage: b.fuelStorage ?? s.fuelStorage, loadKw: b.loadKw ?? s.loadKw } : b
  })
  const clear = (r: Rect) => !e.buildings.some(b => footprintOf(b).some(p => overlaps(p, r)))
  return {
    ...e,
    buildings,
    zones: e.zones.map(z => z.parking === undefined && zone.get(z.id)?.parking ? { ...z, parking: true } : z),
    utilities: structuredClone(sampleEstate.utilities ?? []).filter(u => clear(u.rect)).map(u => ({ ...u, serves: u.serves.filter(id => ids.has(id)) })),
    security: structuredClone(sampleEstate.security ?? []).filter(d => !d.on || ids.has(d.on)),
  }
}

/**
 * Projects saved before the guest house had rooms keep its old placeholder box. Give it the guest house layout,
 * with its southwest corner where the box's was. Its outline is derived from the rooms afterward.
 */
export function withGuestHouseDefaults(e: Estate): Estate {
  if (e.houses !== undefined) return e
  const box = e.buildings.find(b => b.id === 'guest-house')
  const design = sampleEstate.houses?.find(h => h.buildingId === 'guest-house')
  if (!box || !design) return { ...e, houses: [] }
  const sample = sampleEstate.buildings.find(b => b.id === 'guest-house')!
  return {
    ...e,
    houses: [{ ...structuredClone(design), origin: { x: box.rect.x, y: box.rect.y } }],
    // The old box slept four; the layout sleeps as many as the sample says.
    buildings: e.buildings.map(b => b.id === 'guest-house' && (b.beds === undefined || b.beds === 4) ? { ...b, beds: sample.beds } : b),
  }
}
