import type { Estate, Rect } from './types'
import { pathLength, toFt } from './geometry'
import { validateEstate } from './validate'
import { allHouses, houseName } from './houses'
import { beamSize } from './beams'
import { furnitureLine } from './furniture'
import { placeOpenings } from './walls'
import { ridgeHeight } from './roofs'
import { fireRules, roadWidth } from './fireChecks'
import { UTILITY_UNIT, demand, occupancy, utilityRules } from './utilities'
import { earthwork, groundAt, roadGrade, siteSlope } from './terrain'
import { bounds, center, footprintOf } from './geometry'

const f = (inches: number) => String(Math.round(toFt(inches) * 10) / 10)
const box = (r: Rect) => `at ${f(r.x)},${f(r.y)} size ${f(r.w)}x${f(r.d)}`

/** Plain-text description of the estate for the chat editor, in feet. */
export function summarizeEstate(e: Estate): string {
  const lines: string[] = []
  lines.push(`Estate "${e.name}", site layout ${e.layoutVersion}. All numbers are feet.`)
  lines.push(`Site coordinates: x east, y north, origin at the southwest parcel corner. Parcel is ${f(e.parcel.size)} x ${f(e.parcel.size)} ft. Rectangles give the southwest corner, then east-west width x north-south depth.`)

  lines.push('', 'Buildings (id: name, use, access, position, height, people at peak, estimated peak power):')
  for (const b of e.buildings) {
    const o = occupancy(e, b)
    const people = [o.beds ? `sleeps ${o.beds}` : '', o.staff ? `${o.staff} by day` : ''].filter(Boolean).join(', ') || 'no one stays'
    lines.push(`- ${b.id}: ${b.name}, ${b.use}, ${b.access}, ${box(b.rect)}, ${f(b.height)} ft tall, ${people}, ${Math.round(demand(e, b).kw)} kW${b.backupPower ? ', on backup power' : ''}${b.fuelStorage ? ', stores fuel' : ''}, ground ${f(groundAt(e, center(bounds(footprintOf(b)))))} ft above sea level sloping ${Math.round(siteSlope(e, bounds(footprintOf(b))).pct * 10) / 10}%${b.swale ? ', drainage swale' : ''}`)
  }

  lines.push('', 'Covered walkways (id: name, from building to building, length):')
  for (const w of e.walkways) lines.push(`- ${w.id}: ${w.name}, ${w.from ?? 'unlinked'} to ${w.to ?? 'unlinked'}, ${f(pathLength(w.points))} ft`)

  lines.push('', 'Zones (not editable yet; cleared means cleared or developed land):')
  for (const z of e.zones) lines.push(`- ${z.id}: ${z.name}, ${z.kind}, ${box(z.rect)}${z.cleared ? ', cleared' : ''}${z.hardstand ? ', hardstand' : ''}`)
  lines.push('', 'Roads (id: name, kind, width, points in site feet, turnaround at last point):')
  for (const r of e.roads) lines.push(`- ${r.id}: ${r.name}, ${r.kind}, ${f(roadWidth(r))} ft wide, ${r.points.length > 6 ? `${r.points.length} points from ${f(r.points[0].x)},${f(r.points[0].y)} to ${f(r.points.at(-1)!.x)},${f(r.points.at(-1)!.y)}` : r.points.map(p => `${f(p.x)},${f(p.y)}`).join(' to ')}${r.gate ? `, ${r.gate}` : ''}${r.turnaround ? ', turnaround' : ''}, steepest ${Math.round(roadGrade(e, r).pct * 10) / 10}%`)
  lines.push('Terrain: generated sample land (not a survey). It rises toward the northwest; the estate grounds fall east about 4 to 5%. Ground elevations above are feet above sea level at each building.')
  lines.push(`Airstrip ${box(e.runway.rect)}. Hardstand an engine can drive on: ${e.zones.filter(z => z.hardstand).map(z => z.id).join(', ') || 'none'}.`)
  lines.push('', 'Fire water (id: name, kind, at site feet, gallons):')
  for (const w of e.waterSources ?? []) lines.push(`- ${w.id}: ${w.name}, ${w.kind}, at ${f(w.at.x)},${f(w.at.y)}, ${w.gallons.toLocaleString('en-US')} gallons`)
  const fr = fireRules(e)
  lines.push(`Fire rules (planning values): zones ${fr.zones.join(', ')} ft; roads ${fr.minRoadWidthFt} ft wide; hose pull ${fr.maxHosePullFt} ft; dead ends over ${fr.maxDeadEndFt} ft need a turnaround; ${fr.minWaterGallons.toLocaleString('en-US')} gallons within ${fr.maxWaterDistanceFt.toLocaleString('en-US')} ft.`)

  lines.push('', 'Utilities (id: name, kind, rectangle in site feet, capacity, buildings served). Septic rectangles are drainfields with a reserve:')
  for (const u of e.utilities ?? []) lines.push(`- ${u.id}: ${u.name}, ${u.kind}, ${box(u.rect)}, ${u.capacity.toLocaleString('en-US')} ${UTILITY_UNIT[u.kind]}, serves ${u.serves.join(', ') || 'none (feeds the grid service)'}${u.pumped ? ', pumped' : ''}`)
  const devices = e.security ?? []
  lines.push('', `Security: ${devices.filter(d => d.kind === 'camera').length} cameras and ${devices.filter(d => d.kind === 'light').length} lights (id: kind, at site feet, facing and view for cameras, range, power, mounted on):`)
  for (const d of devices) lines.push(`- ${d.id}: ${d.kind} at ${f(d.at.x)},${f(d.at.y)}${d.kind === 'camera' ? `, facing ${Math.round(d.facing ?? 0)} deg, ${d.fov ?? 360} deg view` : ''}, ${f(d.range)} ft, ${d.power}${d.on ? `, on ${d.on}` : ''}`)
  const ur = utilityRules(e)
  lines.push(`Utility rules (planning values): ${Object.entries(ur).map(([k, v]) => `${k} ${v}`).join(', ')}.`)

  for (const house of allHouses(e)) {
  const { origin } = house
  lines.push('', `${houseName(e, house)} (building ${house.buildingId}). Concept layout. Its house origin is at site ${f(origin.x)},${f(origin.y)}.${house.excavated ? ` Its site is excavated to the walkout by design, about ${Math.round(earthwork(e, house).cutCy / 100) * 100} cubic yards of cut.` : ''}`)
  lines.push('Room positions are house-local to this building: 0,0 is its house origin, x east, y north. The entry faces north. Level ids say which building a new room goes in.')
  if (house.wings?.length) lines.push(`Wings (id: name, turned counterclockwise about a house-local pivot): ${house.wings.map(w => `${w.id}: ${w.name}, ${w.angle} degrees about ${f(w.pivot.x)},${f(w.pivot.y)} ft`).join('; ')}. A room marked with a wing has its position in that wing's own coordinates, before the turn; walls only join rooms in the same wing, and a joint opening names the room beyond.`)
  const t = house.wallThickness
  lines.push(`Walls are derived from room edges, which are wall centerlines: exterior ${t.exterior} in, interior ${t.interior} in, foundation ${t.foundation} in. Rooms that share an edge share a wall. Outdoor rooms have no walls.`)
  lines.push('Furniture is listed under its room as id, catalog kind, center in house-local feet, and rotation (0 faces north, 90 west, 180 south, 270 east).')
  lines.push('Openings are listed under their host room as id: kind, side, offset from that side\'s west or south end to the center, width x height, sill, and what is on the other side.')
  const placed = placeOpenings(house)
  const ft1 = (inches: number) => String(Math.round(inches / 12 * 100) / 100)
  for (const level of house.levels) {
    lines.push('', `Level ${level.id}: ${level.name}, floor at ${f(level.elevation)} ft, ${f(level.floorHeight)} ft floor to floor. Rooms (id: name, type, position, bath):`)
    for (const r of level.rooms) {
      lines.push(`- ${r.id}: ${r.name}, ${r.type}, ${box(r.rect)}${r.bathId ? `, bath ${r.bathId}` : ''}${r.safeRoom ? ', safe room' : ''}${r.wingId ? `, in wing ${r.wingId}` : ''}`)
      const furniture = furnitureLine(house, r)
      if (furniture) lines.push(furniture)
      // Rows of overhead doors in a shop's bays read as one line.
      const overhead = placed.filter(o => o.roomId === r.id && o.kind === 'garage-door')
      if (overhead.length > 6) lines.push(`    ${overhead.length} overhead doors, ${ft1(overhead[0].width)}x${ft1(overhead[0].height)} or smaller, one at each end of every lane on the n and s sides (ids ${overhead[0].id} to ${overhead[overhead.length - 1].id})`)
      for (const o of placed.filter(o => o.roomId === r.id && !(overhead.length > 6 && o.kind === 'garage-door'))) {
        lines.push(`    ${o.id}: ${o.kind}${o.operation ? ` (${o.operation})` : ''}, side ${o.side}, offset ${ft1(o.offset)}, ${ft1(o.width)}x${ft1(o.height)}${o.sill ? `, sill ${ft1(o.sill)}` : ''}, to ${o.leadsTo ?? '?'}${o.problem ? ` (does not fit: ${o.problem})` : ''}`)
      }
    }
  }

  if (house.roofs.length) lines.push('', `Roofs (id: name, over, form, pitch, ridge or low side, overhang; heights above the main floor): ${house.roofs.map(r => `${r.id}: ${r.name}, over ${box(r.rect)} on ${r.levelId}, ${r.form} ${r.pitch}:12, ${r.form === 'shed' ? `low side ${r.low}` : `ridge ${r.ridge}`}, ${f(r.overhang)} ft overhang, top at ${f(ridgeHeight(house, r))} ft`).join('; ')}.`)
  if (house.beams?.length) lines.push('', `Beams (id: carries walls of level, line, from, to, material, posts, planning size; house-local feet): ${house.beams.map(b => `${b.id}: ${b.levelId}, ${b.orientation === 'h' ? 'east-west at y' : 'north-south at x'} ${f(b.at)}, ${f(b.from)} to ${f(b.to)}, ${b.material}${b.posts?.length ? `, posts at ${b.posts.map(f).join(' and ')}` : ''}, ${beamSize(b)}`).join('; ')}.`)
  if (house.stairs.length) lines.push('', `Stairs: ${house.stairs.map(s => `${s.id} from ${s.roomId} up to ${s.toRoomId}, ${s.shape}, ${f(s.width)} ft wide`).join('; ')}.`)
  }
  lines.push('', "This app's planning checks right now (these are planning aids, not code compliance):")
  for (const c of validateEstate(e)) lines.push(`- ${c.status.toUpperCase()} ${c.label}: ${c.detail}`)
  return lines.join('\n')
}
