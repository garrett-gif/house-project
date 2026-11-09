import type { HouseModel } from '../model/types'
import { houseBounds } from '../model/derive'

/**
 * A building section: a vertical cut through the house. Axis 'x' cuts north-south at x = at and is seen looking
 * west, so south is on the left. Axis 'y' cuts east-west at y = at and is seen looking north, so west is on the left.
 */
export interface SectionCut { id: string; axis: 'x' | 'y'; at: number }

/**
 * Two cuts through the first two-story room, or through the middle of the house if there is none. Each cut moves
 * to the nearest spot at least 2 ft from any wall line on any floor, so it passes through rooms rather than along a wall.
 */
export function sectionCuts(house: HouseModel): SectionCut[] {
  const tall = house.levels.flatMap(l => l.rooms).find(r => r.twoStory)
  const b = houseBounds(house)
  const cx = tall ? tall.rect.x + tall.rect.w / 2 : b.x + b.w / 2
  const cy = tall ? tall.rect.y + tall.rect.d / 2 : b.y + b.d / 2
  const rooms = house.levels.flatMap(l => l.rooms)
  const clear = (axis: 'x' | 'y', start: number) => {
    const lines = rooms.flatMap(r => axis === 'x' ? [r.rect.x, r.rect.x + r.rect.w] : [r.rect.y, r.rect.y + r.rect.d])
    for (let step = 0; step <= 20 * 12; step += 12) {
      for (const at of [start + step, start - step]) if (lines.every(l => Math.abs(l - at) >= 24)) return at
    }
    return start
  }
  return [{ id: 'A', axis: 'x', at: clear('x', cx) }, { id: 'B', axis: 'y', at: clear('y', cy) }]
}
