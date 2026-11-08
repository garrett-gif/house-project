import type { Estate, HouseModel, Rect } from './types'
import { bounds, mergeRects, translate } from './geometry'

const rooms = (house: HouseModel) => house.levels.flatMap(l => l.rooms)

/** Overall extent of every room on every level, in house-local inches. */
export const houseBounds = (house: HouseModel): Rect => bounds(rooms(house).map(r => r.rect))

/** Enclosed footprint of the house in house-local inches. Outdoor rooms such as terraces are left out. */
export const houseFootprint = (house: HouseModel): Rect[] =>
  mergeRects(rooms(house).filter(r => r.type !== 'outdoor').map(r => r.rect))

/**
 * Recomputes geometry that is stored for convenience but owned elsewhere.
 * The main house building's outline comes from its rooms and `house.origin`, so it can never drift from the floor plan.
 */
export function withDerivedGeometry(e: Estate): Estate {
  const { origin } = e.house
  const parts = houseFootprint(e.house).map(r => translate(r, origin.x, origin.y))
  return {
    ...e,
    buildings: e.buildings.map(b => b.id === e.house.buildingId ? { ...b, rect: bounds(parts), parts } : b),
  }
}
