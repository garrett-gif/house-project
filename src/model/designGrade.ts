import type { HouseModel } from './types'
import { levelWalls, outwardSide } from './walls'

/**
 * Designed (finished) grade around a house, relative to its main floor. For a walkout facing south: North of the house is at the main floor; the courtyard
 * and the ground south of the wings are at the walkout floor; the sides of the wings slope between the two.
 */
export function gradeAt(house: HouseModel, x: number, y: number) {
  const walkout = [...house.levels].sort((a, b) => a.elevation - b.elevation).find(l => l.elevation < 0)
  if (!walkout) return 0
  // Measured in the house's own frame; turned wings sit on the slopes beside the courtyard.
  const exposed = levelWalls(house, walkout).filter(s => !s.wingId && s.kind === 'exterior' && outwardSide(s) === 's')
  if (!exposed.length) return 0
  const rooms = walkout.rooms.filter(r => r.type !== 'outdoor' && !r.wingId)
  const west = Math.min(...rooms.map(r => r.rect.x)), east = Math.max(...rooms.map(r => r.rect.x + r.rect.w))
  const south = Math.min(...rooms.map(r => r.rect.y))
  // The highest exposed south face is where the ground steps up to the main floor: the north bar's courtyard wall.
  const step = Math.max(...exposed.map(s => s.at))
  if (y >= step) return 0
  if (x > west && x < east) return walkout.elevation
  return walkout.elevation * (1 - Math.max(0, Math.min(1, (y - south) / Math.max(1, step - south))))
}

