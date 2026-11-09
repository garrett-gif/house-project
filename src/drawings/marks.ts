import type { HouseModel } from '../model/types'
import { placeOpenings } from '../model/walls'

/**
 * Short marks that key openings on the plans to the schedules: D01, D02, ... for doors, cased openings, and garage
 * doors, W01, W02, ... for windows. Numbered by level from the lowest, then west to east and south to north, so
 * the same model always gets the same marks. Openings that do not fit a wall get no mark.
 */
export function openingMarks(house: HouseModel): Map<string, string> {
  const levelOrder = new Map([...house.levels].sort((a, b) => a.elevation - b.elevation).map((l, i) => [l.id, i]))
  const placed = placeOpenings(house).filter(o => !o.problem)
  const key = (o: (typeof placed)[number]) => {
    const x = o.orientation === 'h' ? (o.from + o.to) / 2 : o.at
    const y = o.orientation === 'h' ? o.at : (o.from + o.to) / 2
    return [levelOrder.get(o.levelId) ?? 0, Math.round(y), Math.round(x)] as const
  }
  const sorted = [...placed].sort((a, b) => {
    const ka = key(a), kb = key(b)
    return ka[0] - kb[0] || kb[1] - ka[1] || ka[2] - kb[2] || a.id.localeCompare(b.id)
  })
  const marks = new Map<string, string>()
  let d = 0, w = 0
  for (const o of sorted) {
    marks.set(o.id, o.kind === 'window' ? `W${String(++w).padStart(2, '0')}` : `D${String(++d).padStart(2, '0')}`)
  }
  return marks
}
