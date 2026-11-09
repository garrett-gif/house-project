import type { Check, Estate, Pt } from './types'
import { bounds, center, footprintOf, ft, partsOf, toFt } from './geometry'
import { ring } from './fireChecks'
import { UTILITY_BASIS, demand, utilityRules } from './utilities'
import { allHouses, houseByBuilding, houseName } from './houses'
import { earthwork, existingGrade, groundAt, lowestFloor, roadGrade, siteSlope } from './terrain'

type Bad = { text: string; ids: string[] }
const BASIS = `Measured on the sample parcel's generated terrain, not a survey. ${UTILITY_BASIS}`
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US')
const n = (v: number) => Math.round(v).toLocaleString('en-US')
const warn = (id: string, label: string, bad: Bad[], okDetail: string): Check =>
  bad.length
    ? { id, label, status: 'warn', detail: `${bad.slice(0, 4).map(b => b.text).join('; ')}${bad.length > 4 ? `; and ${bad.length - 4} more` : ''}. ${BASIS}`, elements: [...new Set(bad.flatMap(b => b.ids))] }
    : { id, label, status: 'pass', detail: `${okDetail}. ${BASIS}` }

export function terrainChecks(e: Estate): Check[] {
  const rules = utilityRules(e)
  const checks: Check[] = []

  // Roads: steepest 50 ft stretch.
  const grades = e.roads.map(r => ({ r, ...roadGrade(e, r) }))
  const steep = grades.filter(g => g.pct > rules.maxRoadGradePct).map(g => ({ text: `${g.r.name}: ${n1(g.pct)}%`, ids: [g.r.id] }))
  const steepest = grades.reduce((a, b) => b.pct > a.pct ? b : a, grades[0])
  checks.push(warn('road-grade', `Roads are no steeper than ${rules.maxRoadGradePct}%`, steep, steepest ? `Steepest: ${steepest.r.name} at ${n1(steepest.pct)}%` : 'No roads'))

  // Building sites: how much the ground falls across each footprint before grading.
  const sloped = e.buildings.flatMap(b => {
    const s = siteSlope(e, bounds(footprintOf(b)))
    return s.pct > rules.maxBuildingSlopePct ? [{ text: `${b.name}: ${n1(s.pct)}%, ${n1(toFt(s.fall))} ft of fall`, ids: [b.id] }] : []
  })
  const worst = e.buildings.map(b => ({ b, s: siteSlope(e, bounds(footprintOf(b))) })).reduce((a, c) => c.s.pct > a.s.pct ? c : a)
  checks.push(warn('building-slope', `Building sites slope ${rules.maxBuildingSlopePct}% or less`, sloped, `Steepest: ${worst.b.name} at ${n1(worst.s.pct)}%, ${n1(toFt(worst.s.fall))} ft of fall`))

  // Walkouts: the ground should fall from the buried side to the open side by about one floor.
  const walkouts: Bad[] = []
  const fits: string[] = []
  for (const house of allHouses(e)) for (const level of house.levels.filter(l => l.elevation < 0 && l.exposed?.length)) {
    const rooms = level.rooms.filter(r => r.type !== 'outdoor')
    if (!rooms.length) continue
    const box = bounds(rooms.map(r => r.rect))
    const along = (side: 'n' | 's' | 'e' | 'w') => {
      const pts: Pt[] = []
      for (let i = 0; i <= 8; i++) {
        const f = i / 8
        pts.push(side === 'n' ? { x: box.x + f * box.w, y: box.y + box.d } : side === 's' ? { x: box.x + f * box.w, y: box.y }
          : side === 'e' ? { x: box.x + box.w, y: box.y + f * box.d } : { x: box.x, y: box.y + f * box.d })
      }
      return pts.reduce((s, p) => s + existingGrade(e, house, p.x, p.y), 0) / pts.length
    }
    const OPP = { n: 's', s: 'n', e: 'w', w: 'e' } as const
    for (const side of level.exposed!) {
      const fall = along(OPP[side]) - along(side), need = -level.elevation
      const word = { n: 'north', s: 'south', e: 'east', w: 'west' }[side]
      const best = (['n', 's', 'e', 'w'] as const).map(s => ({ s, fall: along(OPP[s]) - along(s) })).reduce((a, b) => b.fall > a.fall ? b : a)
      if (fall < need - ft(2) && house.excavated) {
        const w = earthwork(e, house)
        fits.push(`${houseName(e, house)}: excavated by design, about ${n1(toFt(need - fall))} ft of cut along the ${word} face with retaining walls, roughly ${n(Math.round(w.cutCy / 100) * 100)} cubic yards of cut and ${n(Math.round(w.fillCy / 100) * 100)} of fill`)
      } else if (fall < need - ft(2)) {
        walkouts.push({
          text: `${houseName(e, house)}: the ground ${fall < 0 ? 'rises' : 'falls'} ${n1(toFt(Math.abs(fall)))} ft toward the ${word} side, and the ${level.name.toLowerCase()} needs about ${n1(toFt(need))} ft, so about ${n1(toFt(need - fall))} ft of cut along the ${word} face. The land falls most toward the ${{ n: 'north', s: 'south', e: 'east', w: 'west' }[best.s]}, ${n1(toFt(best.fall))} ft across the house`,
          ids: [house.buildingId],
        })
      } else fits.push(`${houseName(e, house)} falls ${n1(toFt(fall))} ft to the ${word}`)
    }
  }
  checks.push(warn('walkout-grade', 'Walkout levels match the fall of the land', walkouts, fits.length ? fits.join('; ') : 'No walkout levels'))

  // Septic by gravity: the drainfield sits below the lowest floor drain of each building it serves, unless pumped.
  const uphill: Bad[] = []
  for (const u of (e.utilities ?? []).filter(u => u.kind === 'septic' && !u.pumped)) {
    const top = siteSlope(e, u.rect).high
    for (const id of u.serves) {
      const b = e.buildings.find(x => x.id === id)
      if (!b || demand(e, b).sewageGpd <= 0) continue
      const floor = lowestFloor(e, b, houseByBuilding(e, b.id))
      if (top > floor - ft(rules.septicFallFt)) uphill.push({ text: `${u.name} is ${n1(toFt(top - floor))} ft above the lowest floor of ${b.name}; it needs to be ${rules.septicFallFt} ft below, or pumped`, ids: [u.id, b.id] })
    }
  }
  const pumped = (e.utilities ?? []).filter(u => u.kind === 'septic' && u.pumped).length
  checks.push(warn('septic-gravity', 'Sewage drains downhill to the drainfields, or is pumped', uphill, `Gravity where the land allows${pumped ? `; ${pumped} pumped system${pumped === 1 ? '' : 's'}` : ''}`))

  // Drainfields on gentle ground, and wells uphill of nearby drainfields.
  const fields: Bad[] = []
  for (const u of (e.utilities ?? []).filter(u => u.kind === 'septic')) {
    const s = siteSlope(e, u.rect)
    if (s.pct > rules.maxDrainfieldSlopePct) fields.push({ text: `${u.name} is on a ${n1(s.pct)}% slope`, ids: [u.id] })
  }
  for (const w of (e.utilities ?? []).filter(u => u.kind === 'well')) for (const s of (e.utilities ?? []).filter(u => u.kind === 'septic')) {
    const d = Math.hypot(center(w.rect).x - center(s.rect).x, center(w.rect).y - center(s.rect).y)
    const rise = groundAt(e, center(w.rect)) - groundAt(e, center(s.rect))
    if (d <= ft(rules.wellUpgradientFt) && rise < 0) fields.push({ text: `${w.name} is ${n1(toFt(-rise))} ft below ${s.name}, ${n(toFt(d))} ft away`, ids: [w.id, s.id] })
  }
  checks.push(warn('drainfield-ground', 'Drainfields on gentle ground, below nearby wells', fields, `Drainfields under ${rules.maxDrainfieldSlopePct}% slope; wells within ${n(rules.wellUpgradientFt)} ft of a drainfield sit above it`))

  // Drainage: a building in a hollow collects runoff.
  const hollow = e.buildings.filter(b => !b.swale).flatMap(b => {
    const floor = groundAt(e, center(bounds(partsOf(b))))
    const around = partsOf(b).flatMap(r => ring({ x: r.x - ft(50), y: r.y - ft(50), w: r.w + ft(100), d: r.d + ft(100) }, ft(25)))
    const higher = around.filter(p => groundAt(e, p) > floor + 12).length / around.length
    return higher >= 0.75 ? [{ text: `${b.name}: the ground rises on ${Math.round(higher * 100)}% of the ring 50 ft out`, ids: [b.id] }] : []
  })
  const swales = e.buildings.filter(b => b.swale).map(b => b.name)
  checks.push(warn('site-drainage', 'Buildings are not in hollows that collect runoff', hollow, `Ground falls away from every building${swales.length ? `; a swale carries runoff around ${swales.join(', ')}` : ''}`))
  return checks
}
