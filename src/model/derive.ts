import type { Estate, HouseModel, Rect } from './types'
import { bounds, mergeRects, translate } from './geometry'

const rooms = (house: HouseModel) => house.levels.flatMap(l => l.rooms)

/** Overall extent of every room on every level, in house-local inches. */
export const houseBounds = (house: HouseModel): Rect => bounds(rooms(house).map(r => r.rect))

/**
 * Enclosed footprint of the house in house-local inches. Outdoor rooms such as terraces are left out.
 * With `aboveGradeOnly`, rooms on levels below ground (elevation under 0) are left out too.
 */
export const houseFootprint = (house: HouseModel, aboveGradeOnly = false): Rect[] =>
  mergeRects(house.levels
    .filter(l => !aboveGradeOnly || l.elevation >= 0)
    .flatMap(l => l.rooms)
    .filter(r => r.type !== 'outdoor')
    .map(r => r.rect))

/**
 * Recomputes geometry that is stored for convenience but owned elsewhere.
 * The main house building's outline comes from its rooms and `house.origin`, so it can never drift from the floor plan.
 */
export function withDerivedGeometry(e: Estate): Estate {
  const { origin } = e.house
  const place = (rects: Rect[]) => rects.map(r => translate(r, origin.x, origin.y))
  // Above-grade masses are what you see and what 3D extrudes. The full footprint adds rooms that are only below grade.
  const parts = place(houseFootprint(e.house, true))
  const footprint = place(houseFootprint(e.house))
  return {
    ...e,
    buildings: e.buildings.map(b => b.id === e.house.buildingId ? { ...b, rect: bounds(footprint), parts, footprint } : b),
  }
}
