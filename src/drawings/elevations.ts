import type { Estate, HouseModel } from '../model/types'
import { existingGrade } from '../model/terrain'
import { levelWalls, outwardSide, placeOpenings } from '../model/walls'
import { eaveHeight, ridgeHeight, roofPolygons } from '../model/roofs'
import type { P3 } from '../model/roofs'
import { houseBounds } from '../model/derive'
import { ARCH_D, PT_PER_IN, ftIn } from './sheet'
import type { Mark, Sheet } from './sheet'
import { MARGIN, SCALE, TITLE_W, drawTitleBlock } from './floorPlanSheet'
import type { SetPosition, SheetInfo } from './floorPlanSheet'

export type ElevationView = 'north' | 'south' | 'east' | 'west'
const FACING = { north: 'n', south: 's', east: 'e', west: 'w' } as const

/**
 * Looking at the house from one side: h runs left to right as the viewer sees it, z is up, depth grows away from
 * the viewer. All in house-local inches.
 */
export function project(view: ElevationView, [x, y, z]: P3) {
  switch (view) {
    case 'south': return { h: x, z, depth: y }
    case 'north': return { h: -x, z, depth: -y }
    case 'east': return { h: y, z, depth: -x }
    case 'west': return { h: -y, z, depth: x }
  }
}

import { gradeAt } from '../model/designGrade'
export { gradeAt }

/** Extent of the walkout level east to west, where the courtyard sits at walkout grade. */
function walkoutSpan(house: HouseModel) {
  const walkout = house.levels.find(l => l.elevation < 0)
  const rooms = walkout?.rooms.filter(r => r.type !== 'outdoor') ?? []
  return rooms.length ? [Math.min(...rooms.map(r => r.rect.x)), Math.max(...rooms.map(r => r.rect.x + r.rect.w))] : [0, 0]
}

interface Item { depth: number; marks: Mark[] }

/** One elevation as marks, placed so that h = hLeft lands at sheet x = sx and z = zTop lands at sheet y = sy. */
export function elevationMarks(e: Estate, view: ElevationView, sx: number, sy: number) {
  const house = e.house, k = SCALE.ptPerInch
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const items: Item[] = []
  const all: { h: number; z: number }[] = []
  const P = (p: P3) => { const q = project(view, p); all.push(q); return q }

  // Walls facing the viewer, rising through two-story rooms to the roof.
  const placed = placeOpenings(house)
  const faces: { pts: P3[]; depth: number; openings: P3[][]; kinds: string[] }[] = []
  levels.forEach((level, i) => {
    for (const s of levelWalls(house, level)) {
      if (outwardSide(s) !== FACING[view]) continue
      const room = house.levels.flatMap(l => l.rooms).find(r => r.id === (s.sides[0] ?? s.sides[1]))
      const top = eaveHeight(level) + (room?.twoStory && levels[i + 1] ? levels[i + 1].floorHeight : 0)
      const bottom = level.elevation
      const pt = (a: number, z: number): P3 => s.orientation === 'h' ? [a, s.at, z] : [s.at, a, z]
      const ops = placed.filter(o => o.wall?.id === s.id && !o.problem)
      faces.push({
        pts: [pt(s.from, bottom), pt(s.to, bottom), pt(s.to, top), pt(s.from, top)],
        depth: Math.min(...[pt(s.from, 0), pt(s.to, 0)].map(p => project(view, p).depth)),
        openings: ops.map(o => [pt(o.from, bottom + o.sill), pt(o.to, bottom + o.sill), pt(o.to, bottom + o.sill + o.height), pt(o.from, bottom + o.sill + o.height)]),
        kinds: ops.map(o => o.kind),
      })
    }
  })

  const poly = (pts: { h: number; z: number }[]) => pts.map(p => [p.h, p.z] as const)

  for (const f of faces) {
    const marks: Mark[] = []
    const q = f.pts.map(P)
    marks.push({ t: 'path', d: pathOf(poly(q)), fill: '#fff', stroke: '#000', sw: 0.8 })
    f.openings.forEach((o, j) => {
      const r = o.map(P)
      const kind = f.kinds[j]
      marks.push({ t: 'path', d: pathOf(poly(r)), fill: kind === 'window' ? '#eef3f6' : '#fff', stroke: '#000', sw: 0.6 })
      const hs = r.map(p => p.h), zs = r.map(p => p.z)
      const h0 = Math.min(...hs), h1 = Math.max(...hs), z0 = Math.min(...zs), z1 = Math.max(...zs)
      if (kind === 'window') {
        marks.push({ t: 'line', ...seg([(h0 + h1) / 2, z0], [(h0 + h1) / 2, z1]), w: 0.4 })
        marks.push({ t: 'line', ...seg([h0 - 3, z0], [h1 + 3, z0]), w: 1 })
      } else if (kind === 'garage-door') {
        for (let z = z0 + 12; z < z1; z += 12) marks.push({ t: 'line', ...seg([h0, z], [h1, z]), w: 0.3 })
      } else if (kind === 'door') {
        if (h1 - h0 > 48) marks.push({ t: 'line', ...seg([(h0 + h1) / 2, z0], [(h0 + h1) / 2, z1]), w: 0.4 })
      }
    })
    items.push({ depth: f.depth, marks })
  }

  // Roof planes and gable walls.
  for (const roof of house.roofs) {
    for (const p of roofPolygons(house, roof)) {
      const q = p.pts.map(P)
      const depth = Math.min(...p.pts.map(pt => project(view, pt).depth))
      const area = Math.abs(q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]; return s + a.h * b.z - b.h * a.z }, 0)) / 2
      const marks: Mark[] = []
      if (area < 1) {
        // Seen edge-on: the rake or eave line.
        const hs = q.map(v => v.h), zs = q.map(v => v.z)
        const lo = q[zs.indexOf(Math.min(...zs))], hi = q[zs.indexOf(Math.max(...zs))]
        if (Math.max(...hs) - Math.min(...hs) > 1 || Math.max(...zs) - Math.min(...zs) > 1) marks.push({ t: 'line', ...seg([lo.h, lo.z], [hi.h, hi.z]), w: 1.2 })
      } else {
        marks.push({ t: 'path', d: pathOf(poly(q)), fill: p.kind === 'roof' ? '#d9d9d9' : '#fff', stroke: '#000', sw: p.kind === 'roof' ? 1 : 0.8 })
        // Standing seams on roofing seen at an angle, 18 in apart, running down the slope.
        if (p.kind === 'roof') for (const [a, b] of seams(q)) marks.push({ t: 'line', ...seg(a, b), w: 0.2 })
      }
      if (marks.length) items.push({ depth: depth - (p.kind === 'roof' ? 0.5 : 0), marks })
    }
  }

  items.sort((a, b) => b.depth - a.depth)
  const raw = items.flatMap(i => i.marks)

  // Bounds, then place on the sheet.
  const hMin = Math.min(...all.map(p => p.h)) - 48, hMax = Math.max(...all.map(p => p.h)) + 48
  const zTop = Math.max(...all.map(p => p.z))
  const zBottom = Math.min(...levels.map(l => l.elevation)) - 48
  const tx = (h: number) => sx + (h - hMin) * k, tz = (z: number) => sy + (zTop - z) * k
  const placedMarks = raw.map(m => place(m, tx, tz))

  // Grade: earth in front of everything, then the grade line.
  const [spanW, spanE] = walkoutSpan(house)
  const walkoutFloor = Math.min(0, ...house.levels.map(l => l.elevation))
  const groundAt = (h: number) => {
    // From the south the courtyard and the wing ends sit at walkout grade; everything else, and the whole north side, at the main floor.
    if (view === 'south') return h >= spanW && h <= spanE ? walkoutFloor : 0
    if (view === 'north') return 0
    // From the east or west, the ground beside the wings slopes up from the walkout to the main floor.
    return gradeAt(house, view === 'east' ? 1e9 : -1e9, view === 'east' ? h : -h)
  }
  const steps: [number, number][] = []
  for (let h = hMin; h <= hMax; h += 6) steps.push([h, groundAt(h)])
  const earth = `M ${tx(hMin)} ${tz(zBottom)} ` + steps.map(([h, z]) => `L ${tx(h)} ${tz(z)}`).join(' ') + ` L ${tx(hMax)} ${tz(zBottom)} Z`
  placedMarks.push({ t: 'path', d: earth, fill: '#fff' })
  placedMarks.push({ t: 'path', d: 'M ' + steps.map(([h, z]) => `${tx(h)} ${tz(z)}`).join(' L '), stroke: '#000', sw: 2.2 })
  const solid = house.levels.flatMap(l => l.rooms).filter(r => r.type !== 'outdoor').map(r => r.rect)
  const face = { s: Math.min(...solid.map(r => r.y)), n: Math.max(...solid.map(r => r.y + r.d)), w: Math.min(...solid.map(r => r.x)), e: Math.max(...solid.map(r => r.x + r.w)) }
  const existingAt = (h: number) => view === 'south' ? existingGrade(e, house, h, face.s) : view === 'north' ? existingGrade(e, house, -h, face.n)
    : view === 'east' ? existingGrade(e, house, face.e, h) : existingGrade(e, house, face.w, -h)

  // Existing ground from the terrain, dashed, so the cut and fill the design asks for is visible.
  {
    const clamp = (z: number) => Math.max(zBottom, Math.min(zTop, z))
    const existing: [number, number][] = []
    for (let h = hMin; h <= hMax; h += 12) existing.push([h, clamp(existingAt(h))])
    placedMarks.push({ t: 'path', d: 'M ' + existing.map(([h, z]) => `${tx(h)} ${tz(z)}`).join(' L '), stroke: '#000', sw: 0.8, dash: [6, 3] })
    placedMarks.push({ t: 'text', x: tx(hMin) + 2, y: tz(existing[0][1]) - 3, text: 'EXISTING GRADE, SAMPLE TERRAIN', size: 5.5 })
  }

  // Level lines and heights at the right.
  const labelX = tx(hMax) + 6
  const lines: [string, number][] = [
    ...levels.map(l => [`${l.name.toUpperCase()} ${ftIn(l.elevation)}`, l.elevation] as [string, number]),
    ['TOP OF HIGHEST RIDGE ' + ftIn(Math.max(...house.roofs.map(r => ridgeHeight(house, r)))), Math.max(...house.roofs.map(r => ridgeHeight(house, r)))],
  ]
  for (const [label, z] of lines) {
    placedMarks.push({ t: 'line', x1: tx(hMin) + 20, y1: tz(z), x2: labelX, y2: tz(z), w: 0.3, dash: [8, 4] })
    placedMarks.push({ t: 'text', x: labelX + 4, y: tz(z) + 2.5, text: label, size: 6.5 })
  }
  return { marks: placedMarks, width: (hMax - hMin) * k + 150, height: (zTop - zBottom) * k }
}

function seg(a: readonly [number, number], b: readonly [number, number]) { return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] } }
function pathOf(pts: readonly (readonly [number, number])[]) { return 'M ' + pts.map(p => `${p[0]} ${p[1]}`).join(' L ') + ' Z' }

/** Vertical seam lines across a projected convex roof polygon. */
function seams(q: { h: number; z: number }[]): [[number, number], [number, number]][] {
  const hs = q.map(p => p.h)
  const out: [[number, number], [number, number]][] = []
  for (let h = Math.min(...hs) + 18; h < Math.max(...hs) - 2; h += 18) {
    const zs: number[] = []
    q.forEach((a, i) => {
      const b = q[(i + 1) % q.length]
      if ((a.h - h) * (b.h - h) <= 0 && a.h !== b.h) zs.push(a.z + (b.z - a.z) * (h - a.h) / (b.h - a.h))
    })
    if (zs.length >= 2) out.push([[h, Math.min(...zs)], [h, Math.max(...zs)]])
  }
  return out
}

/** Moves a mark from elevation coordinates (h, z in inches) onto the sheet. */
function place(m: Mark, tx: (h: number) => number, tz: (z: number) => number): Mark {
  switch (m.t) {
    case 'line': return { ...m, x1: tx(m.x1), y1: tz(m.y1), x2: tx(m.x2), y2: tz(m.y2) }
    case 'path': return { ...m, d: m.d.replace(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g, (_, a, b) => `${tx(Number(a))} ${tz(Number(b))}`) }
    case 'rect': return { ...m, x: tx(m.x), y: tz(m.y + m.h), w: m.w * SCALE.ptPerInch, h: m.h * SCALE.ptPerInch }
    case 'text': return { ...m, x: tx(m.x), y: tz(m.y) }
  }
}

function frame(marks: Mark[]) {
  marks.push({ t: 'rect', x: MARGIN / 2, y: MARGIN / 2, w: ARCH_D.width - MARGIN, h: ARCH_D.height - MARGIN, stroke: '#000', sw: 1.5 })
}

function title(marks: Mark[], x: number, y: number, text: string) {
  marks.push({ t: 'text', x, y, text, size: 14, bold: true })
  marks.push({ t: 'line', x1: x, y1: y + 5, x2: x + 3 * PT_PER_IN, y2: y + 5, w: 1.2 })
  marks.push({ t: 'text', x, y: y + 17, text: `SCALE: ${SCALE.label}    GRADE ASSUMED, FALLING SOUTH. CONFIRM WITH A SURVEY.`, size: 7.5 })
}

/** Two elevations on one sheet: stacked when long (north and south), side by side when short (east and west). */
export function elevationSheet(e: Estate, views: [ElevationView, ElevationView], number: string, sheetTitle: string, info: SheetInfo, position: SetPosition): Sheet {
  const marks: Mark[] = []
  frame(marks)
  const left = MARGIN + 0.5 * PT_PER_IN, top = MARGIN + 0.8 * PT_PER_IN
  const areaW = ARCH_D.width - 2 * MARGIN - TITLE_W - 0.5 * PT_PER_IN
  const first = elevationMarks(e, views[0], 0, 0)
  const stacked = first.width * 2 > areaW
  if (stacked) {
    const a = elevationMarks(e, views[0], left, top)
    marks.push(...a.marks)
    title(marks, left, top + a.height + 30, `${views[0].toUpperCase()} ELEVATION`)
    const y2 = top + a.height + 1.2 * PT_PER_IN
    const b = elevationMarks(e, views[1], left, y2)
    marks.push(...b.marks)
    title(marks, left, y2 + b.height + 30, `${views[1].toUpperCase()} ELEVATION`)
  } else {
    const a = elevationMarks(e, views[0], left, top + 1.5 * PT_PER_IN)
    marks.push(...a.marks)
    title(marks, left, top + 1.5 * PT_PER_IN + a.height + 30, `${views[0].toUpperCase()} ELEVATION`)
    const x2 = left + a.width + 0.6 * PT_PER_IN
    const b = elevationMarks(e, views[1], x2, top + 1.5 * PT_PER_IN)
    marks.push(...b.marks)
    title(marks, x2, top + 1.5 * PT_PER_IN + b.height + 30, `${views[1].toUpperCase()} ELEVATION`)
  }
  drawTitleBlock(marks, e, { title: sheetTitle.toUpperCase(), scale: SCALE.label, number }, info, position)
  return { number, title: sheetTitle, width: ARCH_D.width, height: ARCH_D.height, marks }
}

/** The roofs from above: planes, ridges and hips, pitch and the way each plane drains. */
export function roofPlanSheet(e: Estate, info: SheetInfo, position: SetPosition): Sheet {
  const marks: Mark[] = []
  frame(marks)
  const house = e.house, k = SCALE.ptPerInch
  const b = houseBounds(house)
  const areaW = ARCH_D.width - 2 * MARGIN - TITLE_W
  const ox = MARGIN + (areaW - b.w * k) / 2, oy = MARGIN + 1.8 * PT_PER_IN
  const X = (x: number) => ox + (x - b.x) * k, Y = (y: number) => oy + (b.y + b.d - y) * k

  // Outside walls of every level, dashed, for reference under the roofs.
  for (const level of house.levels) for (const s of levelWalls(house, level).filter(s => s.kind !== 'interior')) {
    const [x1, y1, x2, y2] = s.orientation === 'h' ? [X(s.from), Y(s.at), X(s.to), Y(s.at)] : [X(s.at), Y(s.from), X(s.at), Y(s.to)]
    marks.push({ t: 'line', x1, y1, x2, y2, w: 0.4, dash: [6, 4] })
  }
  // Lower roofs first, so higher ones overlap them where they meet.
  const planes = house.roofs.flatMap(r => roofPolygons(house, r).filter(p => p.kind === 'roof').map(p => ({ p, r })))
  planes.sort((a, b) => Math.max(...a.p.pts.map(v => v[2])) - Math.max(...b.p.pts.map(v => v[2])))
  for (const { p, r } of planes) {
    marks.push({ t: 'path', d: 'M ' + p.pts.map(v => `${X(v[0])} ${Y(v[1])}`).join(' L ') + ' Z', fill: '#fff', stroke: '#000', sw: 1 })
    // Pitch label and an arrow pointing downslope, from the plane's high edge toward its low edge.
    const zs = p.pts.map(v => v[2]), zMax = Math.max(...zs), zMin = Math.min(...zs)
    const avg = (vs: P3[]) => [vs.reduce((s, v) => s + v[0], 0) / vs.length, vs.reduce((s, v) => s + v[1], 0) / vs.length]
    const hi = avg(p.pts.filter(v => zMax - v[2] < 1)), lo = avg(p.pts.filter(v => v[2] - zMin < 1))
    const c = avg(p.pts)
    const dx = lo[0] - hi[0], dy = lo[1] - hi[1], len = Math.hypot(dx, dy) || 1
    const ax = X(c[0]), ay = Y(c[1]), ex = ax + (dx / len) * 28, ey = ay - (dy / len) * 28
    marks.push({ t: 'line', x1: ax, y1: ay, x2: ex, y2: ey, w: 0.7 })
    const back = Math.atan2(ey - ay, ex - ax)
    for (const turn of [2.6, -2.6]) marks.push({ t: 'line', x1: ex, y1: ey, x2: ex + 6 * Math.cos(back + turn), y2: ey + 6 * Math.sin(back + turn), w: 0.7 })
    marks.push({ t: 'text', x: ax, y: ay - 6, text: `${r.pitch}:12`, size: 7, anchor: 'middle', bold: true })
  }
  for (const r of house.roofs) {
    marks.push({ t: 'text', x: X(r.rect.x + r.rect.w / 2), y: Y(r.rect.y + r.rect.d / 2) + 16, text: `${r.name.toUpperCase()}, ${r.form.toUpperCase()}, TOP ${ftIn(ridgeHeight(house, r))}`, size: 6, anchor: 'middle' })
  }
  const ty = Y(b.y) + 1.1 * PT_PER_IN
  marks.push({ t: 'text', x: MARGIN + 0.6 * PT_PER_IN, y: ty, text: 'ROOF PLAN', size: 16, bold: true })
  marks.push({ t: 'line', x1: MARGIN + 0.6 * PT_PER_IN, y1: ty + 5, x2: MARGIN + 3.4 * PT_PER_IN, y2: ty + 5, w: 1.2 })
  marks.push({ t: 'text', x: MARGIN + 0.6 * PT_PER_IN, y: ty + 18, text: `SCALE: ${SCALE.label}    ARROWS POINT DOWNSLOPE. HEIGHTS ABOVE THE MAIN FLOOR. DASHED: OUTSIDE WALLS BELOW.`, size: 8 })
  marks.push({ t: 'text', x: MARGIN + 0.6 * PT_PER_IN, y: ty + 30, text: 'Roofing, structure, snow load, and drainage to be designed and confirmed by others.', size: 8 })
  drawTitleBlock(marks, e, { title: 'ROOF PLAN', scale: SCALE.label, number: 'A-301' }, info, position)
  return { number: 'A-301', title: 'Roof plan', width: ARCH_D.width, height: ARCH_D.height, marks }
}
