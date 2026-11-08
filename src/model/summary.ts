import type { Estate, Rect } from './types'
import { pathLength, toFt } from './geometry'
import { validateEstate } from './validate'

const f = (inches: number) => String(Math.round(toFt(inches) * 10) / 10)
const box = (r: Rect) => `at ${f(r.x)},${f(r.y)} size ${f(r.w)}x${f(r.d)}`

/** Plain-text description of the estate for the chat editor, in feet. */
export function summarizeEstate(e: Estate): string {
  const lines: string[] = []
  lines.push(`Estate "${e.name}", site layout ${e.layoutVersion}. All numbers are feet.`)
  lines.push(`Site coordinates: x east, y north, origin at the southwest parcel corner. Parcel is ${f(e.parcel.size)} x ${f(e.parcel.size)} ft. Rectangles give the southwest corner, then east-west width x north-south depth.`)

  lines.push('', 'Buildings (id: name, use, access, position, height):')
  for (const b of e.buildings) lines.push(`- ${b.id}: ${b.name}, ${b.use}, ${b.access}, ${box(b.rect)}, ${f(b.height)} ft tall`)

  lines.push('', 'Covered walkways (id: name, from building to building, length):')
  for (const w of e.walkways) lines.push(`- ${w.id}: ${w.name}, ${w.from ?? 'unlinked'} to ${w.to ?? 'unlinked'}, ${f(pathLength(w.points))} ft`)

  lines.push('', 'Zones (not editable yet):')
  for (const z of e.zones) lines.push(`- ${z.id}: ${z.name}, ${z.kind}, ${box(z.rect)}`)
  lines.push(`Roads (not editable yet): ${e.roads.map(r => r.name).join('; ')}. Airstrip ${box(e.runway.rect)}.`)

  const { origin } = e.house
  lines.push('', `Main house (building ${e.house.buildingId}). Placeholder massing. Its house origin is at site ${f(origin.x)},${f(origin.y)}.`)
  lines.push('Room positions are house-local: 0,0 is the house origin, x east, y north. The formal entry faces north.')
  for (const level of e.house.levels) {
    lines.push('', `Level ${level.id}: ${level.name}, floor at ${f(level.elevation)} ft, ${f(level.floorHeight)} ft floor to floor. Rooms (id: name, type, position, bath):`)
    for (const r of level.rooms) lines.push(`- ${r.id}: ${r.name}, ${r.type}, ${box(r.rect)}${r.bathId ? `, bath ${r.bathId}` : ''}`)
  }

  lines.push('', "This app's planning checks right now (these are planning aids, not code compliance):")
  for (const c of validateEstate(e)) lines.push(`- ${c.status.toUpperCase()} ${c.label}: ${c.detail}`)
  return lines.join('\n')
}
