import type { Estate } from '../model/types'
import { levelWalls } from '../model/walls'
import { ceilingOf, plateHeight } from '../model/ceilings'
import { eaveHeight, roofPolygons } from '../model/roofs'
import type { P3 } from '../model/roofs'
import { gradeAt } from './elevations'
import { existingGrade } from '../model/terrain'
import { ARCH_D, PT_PER_IN, ftIn } from './sheet'
import type { Mark, Sheet } from './sheet'
import { MARGIN, drawTitleBlock, scaleFor } from './floorPlanSheet'
import type { SetPosition, SheetInfo } from './floorPlanSheet'

import { sectionCuts } from './sectionCuts'
import type { SectionCut } from './sectionCuts'
export { sectionCuts }
export type { SectionCut }

/** Where a planar polygon crosses the cut plane, as a segment in (h, z), if it does. */
function crossing(pts: P3[], cut: SectionCut): [number, number][] | null {
  const along = (p: P3) => cut.axis === 'x' ? p[0] : p[1]
  const h = (p: P3) => cut.axis === 'x' ? p[1] : p[0]
  const hits: [number, number][] = []
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]
    const da = along(a) - cut.at, db = along(b) - cut.at
    if (da === 0 && db === 0) { hits.push([h(a), a[2]], [h(b), b[2]]); return }
    if ((da <= 0 && db > 0) || (da > 0 && db <= 0)) {
      const t = da / (da - db)
      hits.push([h(a) + (h(b) - h(a)) * t, a[2] + (b[2] - a[2]) * t])
    }
  })
  if (hits.length < 2) return null
  hits.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  return [hits[0], hits[hits.length - 1]]
}

/** One section's marks, placed with h = hMin at sheet x = sx and the top at sheet y = sy. */
export function sectionMarks(e: Estate, cut: SectionCut, sx: number, sy: number) {
  const house = e.house, k = scaleFor(e.house).ptPerInch
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const inSpan = (r: { rect: { x: number; y: number; w: number; d: number } }) =>
    cut.axis === 'x' ? r.rect.x < cut.at && cut.at < r.rect.x + r.rect.w : r.rect.y < cut.at && cut.at < r.rect.y + r.rect.d
  const span = (r: { rect: { x: number; y: number; w: number; d: number } }) =>
    cut.axis === 'x' ? [r.rect.y, r.rect.y + r.rect.d] : [r.rect.x, r.rect.x + r.rect.w]

  const raw: Mark[] = []
  const hs: number[] = [], zs: number[] = []
  const box = (h0: number, h1: number, z0: number, z1: number, fill: string, stroke?: string) => {
    hs.push(h0, h1); zs.push(z0, z1)
    raw.push({ t: 'path', d: `M ${h0} ${z0} L ${h1} ${z0} L ${h1} ${z1} L ${h0} ${z1} Z`, fill, stroke, sw: stroke ? 0.5 : undefined })
  }

  levels.forEach((level, i) => {
    // Cuts run in the house's frame; turned wings are left off the sections for now.
    const rooms = level.rooms.filter(r => !r.wingId && inSpan(r))
    for (const r of rooms) {
      const [a, b] = span(r)
      // Floor structure: a 12 in slab or framed floor under each room on the cut.
      box(a, b, level.elevation - 12, level.elevation, r.type === 'outdoor' ? '#bbb' : '#8c8c8c')
      // The ceiling as cut: flat, a tray's step, or a vault's profile (a peak across the span, a level line along it).
      if (r.type !== 'outdoor') {
        const c = ceilingOf(house, r), z0 = level.elevation, plate = z0 + plateHeight(house, r), top = z0 + c.height
        const line = (x1: number, y1: number, x2: number, y2: number) => raw.push({ t: 'line', x1, y1, x2, y2, w: 0.6 })
        if (c.form === 'vaulted' && top > plate) {
          const across = (cut.axis === 'x') === (c.ridge === 'ew'), m = (a + b) / 2
          if (across) { line(a, plate, m, top); line(m, top, b, plate); hs.push(m); zs.push(top) }
          else {
            const pos = cut.axis === 'x' ? cut.at - r.rect.x : cut.at - r.rect.y, len = cut.axis === 'x' ? r.rect.w : r.rect.d
            const z = plate + (top - plate) * (1 - Math.abs(pos - len / 2) / (len / 2))
            line(a, z, b, z); zs.push(z)
          }
        } else if (c.form === 'tray' && top > plate && b - a > 48) {
          line(a, plate, a + 24, plate); line(a + 24, plate, a + 24, top); line(a + 24, top, b - 24, top); line(b - 24, top, b - 24, plate); line(b - 24, plate, b, plate); zs.push(top)
        } else {
          // Rooms without a set ceiling keep the line at the top of the walls, as before.
          const z = r.ceiling ? top : eaveHeight(level) + (r.twoStory && levels[i + 1] ? levels[i + 1].floorHeight : 0)
          line(a, z, b, z)
        }
      }
      if (r.type !== 'outdoor' && b - a > 8 * 12) {
        raw.push({ t: 'text', x: (a + b) / 2, y: level.elevation + 48, text: r.name.split(/[,(]/)[0].trim().toUpperCase(), size: 5.5, anchor: 'middle' })
      }
    }
    // Walls the cut passes through, drawn solid at their thickness.
    for (const s of levelWalls(house, level)) {
      const perpendicular = cut.axis === 'x' ? s.orientation === 'h' : s.orientation === 'v'
      if (s.wingId || !perpendicular || !(s.from < cut.at && cut.at < s.to)) continue
      const room = level.rooms.find(r => s.sides.includes(r.id) && r.twoStory)
      const top = eaveHeight(level) + (room && levels[i + 1] ? levels[i + 1].floorHeight : 0)
      box(s.at - s.thickness / 2, s.at + s.thickness / 2, level.elevation, top, '#000')
    }
  })

  // Roof profile and gable walls where the cut crosses them.
  for (const roof of house.roofs) for (const p of roofPolygons(house, roof)) {
    const seg = crossing(p.pts, cut)
    if (!seg) continue
    const [[h0, z0], [h1, z1]] = seg
    hs.push(h0, h1); zs.push(z0, z1)
    if (p.kind === 'roof') raw.push({ t: 'line', x1: h0, y1: z0, x2: h1, y2: z1, w: 3 })
    else if (Math.abs(h1 - h0) < 1) box(h0 - 4, h0 + 4, Math.min(z0, z1), Math.max(z0, z1), '#000')
  }
  if (!hs.length) return { marks: [] as Mark[], width: 0, height: 0 }

  const hMin = Math.min(...hs) - 48, hMax = Math.max(...hs) + 48
  const zTop = Math.max(...zs), zBottom = Math.min(...levels.map(l => l.elevation)) - 60
  const tx = (h: number) => sx + (h - hMin) * k, tz = (z: number) => sy + (zTop - z) * k
  const marks: Mark[] = raw.map(m => {
    switch (m.t) {
      case 'line': return { ...m, x1: tx(m.x1), y1: tz(m.y1), x2: tx(m.x2), y2: tz(m.y2) }
      case 'text': return { ...m, x: tx(m.x), y: tz(m.y) }
      case 'path': return { ...m, d: m.d.replace(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g, (_, a, b) => `${tx(Number(a))} ${tz(Number(b))}`) }
      default: return m
    }
  })

  // Grade along the cut, with earth hatched lightly beneath it.
  const ground: [number, number][] = []
  for (let h = hMin; h <= hMax; h += 12) ground.push([h, cut.axis === 'x' ? gradeAt(house, cut.at, h) : gradeAt(house, h, cut.at)])
  marks.unshift({ t: 'path', d: `M ${tx(hMin)} ${tz(zBottom)} ` + ground.map(([h, z]) => `L ${tx(h)} ${tz(z)}`).join(' ') + ` L ${tx(hMax)} ${tz(zBottom)} Z`, fill: '#efefef' })
  marks.push({ t: 'path', d: 'M ' + ground.map(([h, z]) => `${tx(h)} ${tz(z)}`).join(' L '), stroke: '#000', sw: 1.8 })

  // Existing ground from the terrain, dashed, so the cut and fill the design asks for is visible.
  {
    const clamp = (z: number) => Math.max(zBottom, Math.min(zTop, z))
    const existing: [number, number][] = []
    for (let h = hMin; h <= hMax; h += 12) existing.push([h, clamp(cut.axis === 'x' ? existingGrade(e, house, cut.at, h) : existingGrade(e, house, h, cut.at))])
    marks.push({ t: 'path', d: 'M ' + existing.map(([h, z]) => `${tx(h)} ${tz(z)}`).join(' L '), stroke: '#000', sw: 0.8, dash: [6, 3] })
    marks.push({ t: 'text', x: tx(hMin) + 2, y: tz(existing[0][1]) - 3, text: 'EXISTING GRADE, SAMPLE TERRAIN', size: 5.5 })
  }

  // Level lines and heights.
  const labelX = tx(hMax) + 6
  for (const l of levels) {
    marks.push({ t: 'line', x1: tx(hMin) + 20, y1: tz(l.elevation), x2: labelX, y2: tz(l.elevation), w: 0.3, dash: [8, 4] })
    marks.push({ t: 'text', x: labelX + 4, y: tz(l.elevation) + 2.5, text: `${l.name.toUpperCase()} ${ftIn(l.elevation)}`, size: 6.5 })
  }
  return { marks, width: (hMax - hMin) * k + 140, height: (zTop - zBottom) * k }
}

function frame(marks: Mark[]) {
  marks.push({ t: 'rect', x: MARGIN / 2, y: MARGIN / 2, w: ARCH_D.width - MARGIN, h: ARCH_D.height - MARGIN, stroke: '#000', sw: 1.5 })
}

export function sectionSheet(e: Estate, info: SheetInfo, position: SetPosition): Sheet {
  const marks: Mark[] = []
  frame(marks)
  const left = MARGIN + 0.5 * PT_PER_IN
  let y = MARGIN + 0.8 * PT_PER_IN
  for (const cut of sectionCuts(e.house)) {
    const s = sectionMarks(e, cut, left, y)
    marks.push(...s.marks)
    const ty = y + s.height + 28
    const dir = cut.axis === 'x' ? 'NORTH-SOUTH, LOOKING WEST' : 'EAST-WEST, LOOKING NORTH'
    marks.push({ t: 'text', x: left, y: ty, text: `SECTION ${cut.id}`, size: 14, bold: true })
    marks.push({ t: 'line', x1: left, y1: ty + 5, x2: left + 2.4 * PT_PER_IN, y2: ty + 5, w: 1.2 })
    marks.push({ t: 'text', x: left, y: ty + 17, text: `SCALE: ${scaleFor(e.house).label}    ${dir}. CUT ELEMENTS ONLY; WALLS BEYOND NOT SHOWN. GRADE ASSUMED.`, size: 7.5 })
    y = ty + 0.9 * PT_PER_IN
  }
  marks.push({ t: 'text', x: left, y: ARCH_D.height - MARGIN - 18, text: 'Floor and roof structure are shown as simple bands for planning. Structure, insulation, and assemblies are by others.', size: 7.5 })
  drawTitleBlock(marks, e, { title: 'BUILDING SECTIONS', scale: scaleFor(e.house).label, number: 'A-401' }, info, position)
  return { number: 'A-401', title: 'Building sections', width: ARCH_D.width, height: ARCH_D.height, marks }
}
