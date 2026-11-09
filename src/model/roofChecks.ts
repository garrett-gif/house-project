import type { Check, Estate, Rect } from './types'
import { samplePoints } from './roofs'

/** On or inside: a point on a wall between two rooms bears on that wall. */
const onOrIn = ([x, y]: [number, number], r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d
const sqft = (n: number) => Math.round(n * 4).toLocaleString('en-US')

/** Every room open to the sky has a roof over it, and every roof sits on rooms. */
export function roofChecks(e: Estate): Check[] {
  const house = e.house
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const roofs = house.roofs ?? []
  const uncovered = new Map<string, number>()
  levels.forEach((level, i) => {
    const above = levels.slice(i + 1).flatMap(l => l.rooms.filter(r => r.type !== 'outdoor').map(r => r.rect))
    for (const room of level.rooms.filter(r => r.type !== 'outdoor')) {
      for (const p of samplePoints(room.rect)) {
        if (above.some(a => onOrIn(p, a))) continue
        if (!roofs.some(r => onOrIn(p, r.rect))) uncovered.set(room.id, (uncovered.get(room.id) ?? 0) + 1)
      }
    }
  })
  const names = [...uncovered].map(([id, n]) => `${house.levels.flatMap(l => l.rooms).find(r => r.id === id)?.name ?? id} (about ${sqft(n)} sq ft)`)
  const checks: Check[] = []
  checks.push(uncovered.size
    ? { id: 'roof-coverage', label: 'Every room has a roof over it', status: 'fail', detail: `Open to the sky: ${names.slice(0, 4).join('; ')}${names.length > 4 ? `; and ${names.length - 4} more` : ''}`, elements: [...uncovered.keys()] }
    : { id: 'roof-coverage', label: 'Every room has a roof over it', status: 'pass', detail: `${roofs.length} roofs` })

  // A roof should bear on walls of its own level, on a two-story room rising from the level below, or on posts over
  // an outdoor room of its own level, as a covered porch does.
  const floating: string[] = []
  for (const roof of roofs) {
    const i = levels.findIndex(l => l.id === roof.levelId)
    const level = levels[i]
    const bearing = [...(level?.rooms ?? []), ...(i > 0 ? levels[i - 1].rooms.filter(r => r.twoStory) : [])].map(r => r.rect)
    const pts = samplePoints(roof.rect)
    const unsupported = pts.filter(p => !bearing.some(b => onOrIn(p, b))).length
    if (!level || unsupported > pts.length * 0.05) floating.push(roof.id)
  }
  checks.push(floating.length
    ? { id: 'roof-support', label: 'Roofs sit on the rooms below them', status: 'warn', detail: `Over open space or the wrong level: ${floating.join(', ')}`, elements: floating }
    : { id: 'roof-support', label: 'Roofs sit on the rooms below them', status: 'pass', detail: 'Every roof bears on walls of its level, or on porch posts' })

  const steep = roofs.filter(r => r.pitch < 3 || r.pitch > 14)
  checks.push(steep.length
    ? { id: 'roof-pitch', label: 'Roof pitches are between 3:12 and 14:12', status: 'warn', detail: `${steep.map(r => `${r.name} at ${r.pitch}:12`).join('; ')}. Low slopes hold snow and need special roofing; very steep ones are hard to build and maintain. Planning value only.`, elements: steep.map(r => r.id) }
    : { id: 'roof-pitch', label: 'Roof pitches are between 3:12 and 14:12', status: 'pass', detail: roofs.map(r => `${r.pitch}:12`).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'No roofs' })
  return checks
}
