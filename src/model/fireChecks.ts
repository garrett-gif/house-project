import type { Building, Check, Estate, FireRules, Pt, Rect, Road } from './types'
import { ft, partsOf, pathLength, pointToRect, samplePath, toFt } from './geometry'
import { clearedRects } from './utilities'

/**
 * Planning values for wildfire and fire access, from common wildland-urban interface guidance: defensible-space
 * zones at 5, 30, and 100 ft, 20 ft apparatus roads, a 150 ft hose pull, turnarounds on dead ends over 150 ft, and
 * a 30,000 gallon source within 1,000 ft. The owner's or fire authority's standards should replace them.
 */
export const DEFAULT_FIRE_RULES: FireRules = {
  zones: [5, 30, 100], minRoadWidthFt: 20, maxHosePullFt: 150, maxDeadEndFt: 150, maxWaterDistanceFt: 1000, minWaterGallons: 30000,
}
const BASIS = 'Advisory planning values; replace them with your standards or the fire authority’s.'

const DEFAULT_ROAD_WIDTH_FT: Record<Road['kind'], number> = { estate: 22, work: 26, perimeter: 20, 'gated-link': 20 }
export const roadWidth = (r: Road) => r.width ?? ft(DEFAULT_ROAD_WIDTH_FT[r.kind])
export const fireRules = (e: Estate) => e.fireRules ?? DEFAULT_FIRE_RULES

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const inside = (p: Pt, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.d
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, d: r.d + 2 * by })

/** Points every `step` inches around the outside of a rectangle. */
export function ring(r: Rect, step = ft(10)): Pt[] {
  return samplePath([{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.d }, { x: r.x, y: r.y + r.d }, { x: r.x, y: r.y }], step)
}

/** What a building presents to fire: its above-grade masses. */
const outline = (b: Building) => partsOf(b)

const warn = (id: string, label: string, bad: { text: string; ids: string[] }[], okDetail: string): Check =>
  bad.length
    ? { id, label, status: 'warn', detail: `${bad.slice(0, 4).map(b => b.text).join('; ')}${bad.length > 4 ? `; and ${bad.length - 4} more` : ''}. ${BASIS}`, elements: [...new Set(bad.flatMap(b => b.ids))] }
    : { id, label, status: 'pass', detail: `${okDetail}. ${BASIS}` }

export function fireChecks(e: Estate): Check[] {
  const rules = fireRules(e)
  const [, near, far] = rules.zones
  const checks: Check[] = []
  const parcel: Rect = { x: 0, y: 0, w: e.parcel.size, d: e.parcel.size }
  const cleared = clearedRects(e)
  const treated = [...cleared, ...e.zones.filter(z => z.kind === 'fuelbreak').map(z => z.rect)]

  // Defensible space: cleared ground within the near zone, cleared or thinned out to the far zone.
  const space: { text: string; ids: string[] }[] = []
  for (const b of e.buildings) {
    const share = (dist: number, ok: Rect[]) => {
      const pts = outline(b).flatMap(r => ring(grow(r, ft(dist)))).filter(p => inside(p, parcel))
      return pts.length ? pts.filter(p => ok.some(r => inside(p, r))).length / pts.length : 1
    }
    const nearOk = Math.min(share(near / 2, cleared), share(near, cleared))
    const farOk = Math.min(share((near + far) / 2, treated), share(far, treated))
    if (nearOk < 0.999) space.push({ text: `${b.name}: ${Math.round((1 - nearOk) * 100)}% of the ground within ${near} ft is uncleared forest`, ids: [b.id] })
    else if (farOk < 0.999) space.push({ text: `${b.name}: ${Math.round((1 - farOk) * 100)}% of the ground ${near}–${far} ft out is untreated forest`, ids: [b.id] })
  }
  checks.push(warn('defensible-space', `Defensible space to ${far} ft around buildings`, space, `${e.buildings.length} buildings have cleared ground within ${near} ft and cleared or thinned ground to ${far} ft`))

  // Construction that resists embers and flame.
  const weak = e.buildings.flatMap(b => {
    const i = b.ignition
    if (!i) return [{ text: `${b.name}: not specified`, ids: [b.id] }]
    const gaps = [i.roofClass !== 'A' ? `class ${i.roofClass} roof` : '', i.emberVents ? '' : 'standard vents', i.enclosedEaves ? '' : 'open eaves', i.decks === 'combustible' ? 'combustible decks' : ''].filter(Boolean)
    return gaps.length ? [{ text: `${b.name}: ${gaps.join(', ')}`, ids: [b.id] }] : []
  })
  checks.push(warn('ignition', 'Buildings resist embers and flame', weak, 'Class A roofs, ember-resistant vents, boxed eaves, and no combustible decks on every building'))

  // Apparatus roads.
  const minW = ft(rules.minRoadWidthFt)
  const narrow = e.roads.filter(r => roadWidth(r) < minW).map(r => ({ text: `${r.name}: ${n(toFt(roadWidth(r)))} ft`, ids: [r.id] }))
  checks.push(warn('road-width', `Fire apparatus roads at least ${rules.minRoadWidthFt} ft wide`, narrow, `${e.roads.length} roads`))

  const samples = new Map(e.roads.map(r => [r.id, samplePath(r.points, ft(10))]))
  const joins = (p: Pt, except: string) => [...samples].some(([id, pts]) => id !== except && pts.some(q => Math.hypot(q.x - p.x, q.y - p.y) <= ft(30)))
  const onEdge = (p: Pt) => p.x <= ft(1) || p.y <= ft(1) || p.x >= e.parcel.size - ft(1) || p.y >= e.parcel.size - ft(1)
  const deadEnds = e.roads.flatMap(r => {
    const first = r.points[0], last = r.points[r.points.length - 1]
    if (Math.hypot(first.x - last.x, first.y - last.y) < ft(1)) return []
    const freeEnds = [first, last].filter(p => !onEdge(p) && !joins(p, r.id))
    const needs = freeEnds.filter(p => !(p === last && r.turnaround))
    return needs.length && pathLength(r.points) > ft(rules.maxDeadEndFt) ? [{ text: `${r.name}: ${n(toFt(pathLength(r.points)))} ft with no turnaround`, ids: [r.id] }] : []
  })
  checks.push(warn('dead-ends', `Dead ends over ${rules.maxDeadEndFt} ft have a turnaround`, deadEnds, 'Every long dead end has a turnaround'))

  // Two ways out: from the road that serves the main house, reach at least two different gates.
  const house = e.buildings.find(b => b.id === e.house.buildingId)
  if (house) {
    const nearest = (b: Building) => [...samples].map(([id, pts]) => ({ id, d: Math.min(...pts.map(p => pointToRect(p, b.rect))) })).sort((a, c) => a.d - c.d)[0]?.id
    const start = nearest(house)
    const linked = (a: string, c: string) => samples.get(a)!.some(p => samples.get(c)!.some(q => Math.hypot(q.x - p.x, q.y - p.y) <= ft(30)))
    const seen = new Set(start ? [start] : []), queue = [...seen]
    while (queue.length) { const id = queue.shift()!; for (const r of e.roads) if (!seen.has(r.id) && linked(id, r.id)) { seen.add(r.id); queue.push(r.id) } }
    const gates = e.roads.filter(r => r.gate && seen.has(r.id)).map(r => r.gate!)
    checks.push(warn('two-ways-out', 'Two ways out of the estate', gates.length >= 2 ? [] : [{ text: `Only ${gates.length ? gates.join(', ') : 'no gate'} can be reached from the house`, ids: start ? [start] : [] }], `${gates.join(' and ')} both reach the house`))
  }

  // Hose pull: every outside wall within reach of a road or hardstand an engine can use.
  const apparatus = e.roads.filter(r => roadWidth(r) >= minW).flatMap(r => samples.get(r.id)!)
  const hardstand = e.zones.filter(z => z.hardstand).map(z => z.rect)
  const far2 = e.buildings.flatMap(b => {
    // Only road points and paved areas near this building can be the closest; skip the rest of the property.
    const box = grow(b.rect, ft(rules.maxHosePullFt) * 2)
    const near = apparatus.filter(q => inside(q, box))
    const pads = hardstand.filter(r => r.x < box.x + box.w && box.x < r.x + r.w && r.y < box.y + box.d && box.y < r.y + r.d)
    const reach = (p: Pt) => Math.min(Infinity, ...near.map(q => Math.hypot(q.x - p.x, q.y - p.y)), ...pads.map(r => pointToRect(p, r)))
    const worst = Math.max(...outline(b).flatMap(r => ring(r)).map(reach))
    return worst > ft(rules.maxHosePullFt) ? [{ text: `${b.name}: ${Number.isFinite(worst) ? `${n(toFt(worst))} ft` : `no apparatus road or apron within ${n(rules.maxHosePullFt * 2)} ft`}`, ids: [b.id] }] : []
  })
  checks.push(warn('hose-pull', `Every outside wall within ${rules.maxHosePullFt} ft of an apparatus road or hardstand`, far2, `${e.buildings.length} buildings`))

  // Water.
  const sources = (e.waterSources ?? []).filter(s => s.gallons >= rules.minWaterGallons)
  const dry = e.buildings.flatMap(b => {
    const d = Math.min(Infinity, ...sources.map(s => Math.min(...outline(b).map(r => pointToRect(s.at, r)))))
    return d > ft(rules.maxWaterDistanceFt) ? [{ text: `${b.name}: ${Number.isFinite(d) ? `${n(toFt(d))} ft to the nearest source` : 'no source large enough'}`, ids: [b.id] }] : []
  })
  const total = (e.waterSources ?? []).reduce((s, w) => s + w.gallons, 0)
  checks.push(warn('fire-water', `Fire water of ${n(rules.minWaterGallons)} gallons within ${n(rules.maxWaterDistanceFt)} ft of every building`, dry, `${(e.waterSources ?? []).length} sources, ${n(total)} gallons in all`))
  return checks
}
