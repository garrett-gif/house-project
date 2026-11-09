import type { Estate, Rect } from './types'
import { pathLength, toFt } from './geometry'
import { validateEstate } from './validate'
import { placeOpenings } from './walls'
import { ridgeHeight } from './roofs'
import { fireRules, roadWidth } from './fireChecks'

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

  lines.push('', 'Zones (not editable yet; cleared means cleared or developed land):')
  for (const z of e.zones) lines.push(`- ${z.id}: ${z.name}, ${z.kind}, ${box(z.rect)}${z.cleared ? ', cleared' : ''}${z.hardstand ? ', hardstand' : ''}`)
  lines.push('', 'Roads (id: name, kind, width, points in site feet, turnaround at last point):')
  for (const r of e.roads) lines.push(`- ${r.id}: ${r.name}, ${r.kind}, ${f(roadWidth(r))} ft wide, ${r.points.length > 6 ? `${r.points.length} points from ${f(r.points[0].x)},${f(r.points[0].y)} to ${f(r.points.at(-1)!.x)},${f(r.points.at(-1)!.y)}` : r.points.map(p => `${f(p.x)},${f(p.y)}`).join(' to ')}${r.gate ? `, ${r.gate}` : ''}${r.turnaround ? ', turnaround' : ''}`)
  lines.push(`Airstrip ${box(e.runway.rect)}. Hardstand an engine can drive on: ${e.zones.filter(z => z.hardstand).map(z => z.id).join(', ') || 'none'}.`)
  lines.push('', 'Fire water (id: name, kind, at site feet, gallons):')
  for (const w of e.waterSources ?? []) lines.push(`- ${w.id}: ${w.name}, ${w.kind}, at ${f(w.at.x)},${f(w.at.y)}, ${w.gallons.toLocaleString('en-US')} gallons`)
  const fr = fireRules(e)
  lines.push(`Fire rules (planning values): zones ${fr.zones.join(', ')} ft; roads ${fr.minRoadWidthFt} ft wide; hose pull ${fr.maxHosePullFt} ft; dead ends over ${fr.maxDeadEndFt} ft need a turnaround; ${fr.minWaterGallons.toLocaleString('en-US')} gallons within ${fr.maxWaterDistanceFt.toLocaleString('en-US')} ft.`)

  const { origin } = e.house
  lines.push('', `Main house (building ${e.house.buildingId}). Placeholder massing. Its house origin is at site ${f(origin.x)},${f(origin.y)}.`)
  lines.push('Room positions are house-local: 0,0 is the house origin, x east, y north. The formal entry faces north.')
  const t = e.house.wallThickness
  lines.push(`Walls are derived from room edges, which are wall centerlines: exterior ${t.exterior} in, interior ${t.interior} in, foundation ${t.foundation} in. Rooms that share an edge share a wall. Outdoor rooms have no walls.`)
  lines.push('Openings are listed under their host room as id: kind, side, offset from that side\'s west or south end to the center, width x height, sill, and what is on the other side.')
  const placed = placeOpenings(e.house)
  const ft1 = (inches: number) => String(Math.round(inches / 12 * 100) / 100)
  for (const level of e.house.levels) {
    lines.push('', `Level ${level.id}: ${level.name}, floor at ${f(level.elevation)} ft, ${f(level.floorHeight)} ft floor to floor. Rooms (id: name, type, position, bath):`)
    for (const r of level.rooms) {
      lines.push(`- ${r.id}: ${r.name}, ${r.type}, ${box(r.rect)}${r.bathId ? `, bath ${r.bathId}` : ''}`)
      for (const o of placed.filter(o => o.roomId === r.id)) {
        lines.push(`    ${o.id}: ${o.kind}${o.operation ? ` (${o.operation})` : ''}, side ${o.side}, offset ${ft1(o.offset)}, ${ft1(o.width)}x${ft1(o.height)}${o.sill ? `, sill ${ft1(o.sill)}` : ''}, to ${o.leadsTo ?? '?'}${o.problem ? ` (does not fit: ${o.problem})` : ''}`)
      }
    }
  }

  if (e.house.roofs.length) lines.push('', `Roofs (id: name, over, form, pitch, ridge or low side, overhang; heights above the main floor): ${e.house.roofs.map(r => `${r.id}: ${r.name}, over ${box(r.rect)} on ${r.levelId}, ${r.form} ${r.pitch}:12, ${r.form === 'shed' ? `low side ${r.low}` : `ridge ${r.ridge}`}, ${f(r.overhang)} ft overhang, top at ${f(ridgeHeight(e.house, r))} ft`).join('; ')}.`)
  if (e.house.stairs.length) lines.push('', `Stairs: ${e.house.stairs.map(s => `${s.id} from ${s.roomId} up to ${s.toRoomId}, ${s.shape}, ${f(s.width)} ft wide`).join('; ')}.`)
  lines.push('', "This app's planning checks right now (these are planning aids, not code compliance):")
  for (const c of validateEstate(e)) lines.push(`- ${c.status.toUpperCase()} ${c.label}: ${c.detail}`)
  return lines.join('\n')
}
