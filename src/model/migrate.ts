import type { Estate } from './types'
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
