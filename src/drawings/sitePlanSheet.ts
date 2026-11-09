import type { Estate, Pt, Rect } from '../model/types'
import { center, partsOf, toFt } from '../model/geometry'
import { roadWidth } from '../model/fireChecks'
import { UTILITY_UNIT, demand, occupancy } from '../model/utilities'
import { ARCH_D, PT_PER_IN } from './sheet'
import type { Mark, Sheet } from './sheet'
import { MARGIN, TITLE_W, drawTitleBlock } from './floorPlanSheet'
import type { SetPosition, SheetInfo } from './floorPlanSheet'

/** Site plan at 1" = 300'-0": a 6,600 ft parcel fits in 22 inches with room for the schedules beside it. */
export const SITE_SCALE = { label: '1" = 300\'-0"', ptPerInch: PT_PER_IN / (300 * 12) }

const UTILITY_TAG = { well: 'W', storage: 'T', septic: 'S', service: 'E', solar: 'PV', generator: 'G', propane: 'LP' } as const

/** Building and utility keys used on the plan and in the schedules: B1, B2… and W1, S1, PV1… */
export function siteKeys(e: Estate) {
  const keys = new Map<string, string>()
  e.buildings.forEach((b, i) => keys.set(b.id, `B${i + 1}`))
  const count = new Map<string, number>()
  for (const u of e.utilities ?? []) {
    const n = (count.get(u.kind) ?? 0) + 1
    count.set(u.kind, n)
    keys.set(u.id, `${UTILITY_TAG[u.kind]}${n}`)
  }
  return keys
}

/**
 * AS-101: the whole parcel with zones, roads at their drivable width, gates, buildings, utilities, and fire water,
 * keyed to building and utility schedules. Cameras and lights are left off on purpose: this sheet is the one most
 * likely to be handed to others.
 */
export function sitePlanSheet(e: Estate, info: SheetInfo, position: SetPosition): Sheet {
  const marks: Mark[] = []
  const { width: W, height: H } = ARCH_D
  marks.push({ t: 'rect', x: MARGIN / 2, y: MARGIN / 2, w: W - MARGIN, h: H - MARGIN, stroke: '#000', sw: 1.5 })
  const s = SITE_SCALE.ptPerInch
  const size = e.parcel.size
  const left = MARGIN + 0.4 * PT_PER_IN, top = MARGIN + 0.5 * PT_PER_IN
  const X = (x: number) => left + x * s, Y = (y: number) => top + (size - y) * s
  const rect = (r: Rect, style: Omit<Extract<Mark, { t: 'rect' }>, 't' | 'x' | 'y' | 'w' | 'h'>) => marks.push({ t: 'rect', x: X(r.x), y: Y(r.y + r.d), w: r.w * s, h: r.d * s, ...style })
  const poly = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'} ${X(p.x).toFixed(2)} ${Y(p.y).toFixed(2)}`).join(' ')
  const circle = (p: Pt, r: number) => `M ${X(p.x) - r} ${Y(p.y)} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`
  const keys = siteKeys(e)

  marks.push({ t: 'text', x: left, y: top - 12, text: 'SITE PLAN', size: 14, bold: true })
  marks.push({ t: 'text', x: left + 90, y: top - 12, text: `Scale ${SITE_SCALE.label}. Parcel ${Math.round(toFt(size)).toLocaleString('en-US')} ft square, ${Math.round(size * size / 144 / 43560).toLocaleString('en-US')} acres. Sample parcel, not a survey.`, size: 8 })

  // Zones: cleared land shaded, thinned or forested land outlined only.
  for (const z of e.zones) {
    if (z.round) marks.push({ t: 'path', d: `M ${X(z.rect.x)} ${Y(z.rect.y + z.rect.d / 2)} a ${z.rect.w * s / 2} ${z.rect.d * s / 2} 0 1 0 ${z.rect.w * s} 0 a ${z.rect.w * s / 2} ${z.rect.d * s / 2} 0 1 0 ${-z.rect.w * s} 0 Z`, fill: z.kind === 'water' ? '#d6e6ef' : '#ededed', stroke: '#777', sw: 0.4 })
    else rect(z.rect, z.cleared ? { fill: z.hardstand ? '#dcdcdc' : '#f0f0f0', stroke: '#777', sw: 0.4 } : { stroke: '#555', sw: 0.6, dash: z.kind === 'fuelbreak' ? [6, 3] : [2, 2] })
  }
  for (const z of e.zones.filter(z => ['estate-core', 'operations', 'lodging', 'training', 'incident-camp', 'pond', 'estate-fuelbreak'].includes(z.id))) {
    marks.push({ t: 'text', x: X(z.rect.x) + 3, y: Y(z.rect.y + z.rect.d) + 9, text: z.name.toUpperCase(), size: 5.5, bold: true })
  }
  rect({ x: 0, y: 0, w: size, d: size }, { stroke: '#000', sw: 2 })

  // Roads at their drivable width, then a thin centerline.
  for (const r of e.roads) {
    marks.push({ t: 'path', d: poly(r.points), stroke: '#9a9a9a', sw: Math.max(1, roadWidth(r) * s) })
    marks.push({ t: 'path', d: poly(r.points), stroke: '#333', sw: 0.3, dash: r.kind === 'perimeter' ? [4, 2] : undefined })
    if (r.turnaround) { const end = r.points[r.points.length - 1]; marks.push({ t: 'path', d: circle(end, 3), stroke: '#333', sw: 0.6 }) }
    if (r.gate) {
      const g = r.points[0]
      marks.push({ t: 'line', x1: X(g.x) - 6, y1: Y(g.y) - 2, x2: X(g.x) + 6, y2: Y(g.y) - 2, w: 2.5 })
      marks.push({ t: 'text', x: X(g.x), y: Y(g.y) + 11, text: r.gate.toUpperCase(), size: 6.5, bold: true, anchor: 'middle' })
    }
  }
  rect(e.runway.rect, { fill: '#555' })
  marks.push({ t: 'text', x: X(e.runway.rect.x + e.runway.rect.w) + 4, y: Y(e.runway.rect.y + e.runway.rect.d / 2), text: e.runway.name.toUpperCase(), size: 6, bold: true })

  // Utilities: outlined with their key; drainfields hatched by a dashed outline.
  for (const u of e.utilities ?? []) {
    rect(u.rect, u.kind === 'septic' ? { stroke: '#000', sw: 0.6, dash: [2, 1.5] } : { fill: u.kind === 'solar' ? '#9aa5b8' : '#fff', stroke: '#000', sw: 0.6 })
    const c = center(u.rect)
    marks.push({ t: 'text', x: X(c.x), y: Y(c.y) - Math.max(u.rect.d * s / 2, 2) - 2, text: keys.get(u.id)!, size: 5, anchor: 'middle', bold: true })
  }
  for (const w of e.waterSources ?? []) marks.push({ t: 'path', d: circle(w.at, 2.2), fill: '#000' })

  // Buildings, solid, keyed to the schedule.
  for (const b of e.buildings) {
    for (const p of partsOf(b)) rect(p, { fill: '#000' })
    const c = center(b.rect)
    marks.push({ t: 'text', x: X(c.x), y: Y(b.rect.y + b.rect.d) - 3, text: keys.get(b.id)!, size: 6, anchor: 'middle', bold: true })
  }

  // North arrow and scale bar, below the parcel's southeast corner.
  const nx = X(size) - 30, ny = Y(0) + 20
  marks.push({ t: 'path', d: `M ${nx} ${ny - 4} L ${nx + 7} ${ny + 16} L ${nx} ${ny + 11} L ${nx - 7} ${ny + 16} Z`, fill: '#000' })
  marks.push({ t: 'text', x: nx, y: ny - 8, text: 'N', size: 9, bold: true, anchor: 'middle' })
  const bx = left, by = Y(0) + 24, step = 500 * 12 * s
  for (let i = 0; i < 4; i++) marks.push({ t: 'rect', x: bx + i * step, y: by, w: step, h: 4, fill: i % 2 ? '#fff' : '#000', stroke: '#000', sw: 0.5 })
  for (let i = 0; i <= 4; i++) marks.push({ t: 'text', x: bx + i * step, y: by + 13, text: `${i * 500}'`, size: 6, anchor: 'middle' })

  // Schedules to the right of the plan.
  const tx = X(size) + 0.35 * PT_PER_IN
  const tw = W - MARGIN / 2 - TITLE_W - tx - 0.2 * PT_PER_IN
  let y = top
  const row = (cells: [string, number, ('start' | 'end')?][], bold = false, size = 6) => {
    for (const [text, at, anchor] of cells) marks.push({ t: 'text', x: tx + at * tw, y, text, size, bold, anchor: anchor ?? 'start' })
    y += size + 3.2
  }
  const rule = () => { marks.push({ t: 'line', x1: tx, y1: y - 6, x2: tx + tw, y2: y - 6, w: 0.5 }); y += 1 }
  const cut = (t: string, n: number) => t.length > n ? t.slice(0, n - 1) + '…' : t

  row([['BUILDINGS', 0]], true, 10); y += 2
  row([['KEY', 0], ['NAME', 0.08], ['SLEEPS', 0.66, 'end'], ['BY DAY', 0.78, 'end'], ['PEAK kW', 0.9, 'end'], ['BACKUP', 1, 'end']], true)
  rule()
  for (const b of e.buildings) {
    const o = occupancy(e, b)
    row([[keys.get(b.id)!, 0], [cut(b.name, 40), 0.08], [o.beds ? String(o.beds) : '', 0.66, 'end'], [o.staff ? String(o.staff) : '', 0.78, 'end'], [String(Math.round(demand(e, b).kw)), 0.9, 'end'], [b.backupPower ? 'Yes' : '', 1, 'end']])
  }
  y += 12
  row([['UTILITIES', 0]], true, 10); y += 2
  row([['KEY', 0], ['NAME', 0.08], ['CAPACITY', 0.6, 'end'], ['SERVES', 0.63]], true)
  rule()
  for (const u of e.utilities ?? []) {
    const serves = u.serves.map(id => keys.get(id) ?? id)
    row([[keys.get(u.id)!, 0], [cut(u.name, 34), 0.08], [`${u.capacity.toLocaleString('en-US')} ${UTILITY_UNIT[u.kind]}`, 0.6, 'end'], [serves.length > 6 ? `${serves.slice(0, 5).join(', ')} +${serves.length - 5}` : serves.join(', ') || 'Grid', 0.63]])
  }
  y += 12
  row([['LEGEND AND NOTES', 0]], true, 10); y += 2
  for (const note of [
    'Black: buildings. Gray bands: roads at drivable width, circle at a turnaround. Heavy bar: gate.',
    'Shaded: cleared or developed land; darker shading is hardstand. Dashed outline: forest or fuel break.',
    'Dashed box: septic drainfield, primary and reserve. Dots: fire water. Coordinates are from the SW parcel corner.',
    'Utility sizes come from this app\'s demand estimates and need soil, percolation, well, and utility tests.',
    'Cameras and lights are kept in the model but left off this sheet.',
    "Passing this app's planning checks does not mean the design meets code or county rules.",
  ]) row([[note, 0]], false, 6)

  drawTitleBlock(marks, e, { title: 'SITE PLAN', scale: SITE_SCALE.label, number: 'AS-101', subject: 'ESTATE AND COMPOUND' }, info, position)
  return { number: 'AS-101', title: 'Site plan', width: W, height: H, marks }
}
