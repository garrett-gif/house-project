import type { Estate, Level, Side, HouseModel } from '../model/types'
import { houseBounds } from '../model/derive'
import { levelWalls, placeOpenings } from '../model/walls'
import type { PlacedOpening, WallSegment } from '../model/walls'
import { ARCH_D, PT_PER_IN, ftIn } from './sheet'
import { openingMarks } from './marks'
import { sectionCuts } from './sectionCuts'
import { beamMarks, beamsAbove } from '../model/beams'
import { CATALOG, parts as furnitureParts } from '../model/furniture'
import type { Mark, Sheet } from './sheet'

/** 1/8 inch on paper per foot: 9 points per foot, 0.75 points per model inch. */
export const SCALE = { label: '1/8" = 1\'-0"', ptPerInch: (PT_PER_IN / 8) / 12 }

export const MARGIN = 0.5 * PT_PER_IN
export const TITLE_W = 3.5 * PT_PER_IN

/**
 * The drawing scale for a building: 1/8" = 1'-0" when it fits the sheet, as the houses do, then 1/16", 1/32", or
 * 1/64" for the long shops.
 */
export function scaleFor(house: HouseModel) {
  const b = houseBounds(house)
  const areaW = ARCH_D.width - 2 * MARGIN - TITLE_W - PT_PER_IN, areaH = ARCH_D.height - 4.5 * PT_PER_IN
  for (const den of [8, 16, 32]) {
    const ptPerInch = (PT_PER_IN / den) / 12
    if (b.w * ptPerInch <= areaW && b.d * ptPerInch <= areaH) return { label: `1/${den}" = 1'-0"`, ptPerInch }
  }
  return { label: `1/64" = 1'-0"`, ptPerInch: (PT_PER_IN / 64) / 12 }
}
const INWARD: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [-1, 0], w: [1, 0] }

export interface SheetInfo {
  /** Model revision the sheet was drawn from. */
  revision: number
  /** Date printed on the sheet, YYYY-MM-DD. */
  date: string
  projectName: string
}

/** Where a sheet sits in its set, for "Sheet 2 of 5". */
export interface SetPosition { index: number; count: number }

export const levelsInOrder = (e: Estate) => [...e.house.levels].sort((a, b) => a.elevation - b.elevation)

/** Sheet numbers follow level order from the lowest: A-101, A-102, ... */
export function floorPlanSheets(e: Estate, info: SheetInfo, firstIndex = 1, count = e.house.levels.length): Sheet[] {
  return levelsInOrder(e).map((level, i) => floorPlanSheet(e, level, `A-${101 + i}`, info, { index: firstIndex + i, count }))
}

export function floorPlanSheet(e: Estate, level: Level, number: string, info: SheetInfo, position: SetPosition = { index: 1, count: 1 }): Sheet {
  const { width: W, height: H } = ARCH_D
  const marks: Mark[] = []
  const scale = scaleFor(e.house)
  const k = scale.ptPerInch
  const b = houseBounds(e.house)
  const areaW = W - 2 * MARGIN - TITLE_W
  const ox = MARGIN + (areaW - b.w * k) / 2
  const oy = MARGIN + 1.6 * PT_PER_IN
  /** Model inches (house-local, y north) to sheet points (y down). */
  const X = (x: number) => ox + (x - b.x) * k
  const Y = (y: number) => oy + (b.y + b.d - y) * k
  const walls = levelWalls(e.house, level)
  const openings = placeOpenings(e.house).filter(o => o.levelId === level.id && o.wall && !o.problem)

  // Border.
  marks.push({ t: 'rect', x: MARGIN / 2, y: MARGIN / 2, w: W - MARGIN, h: H - MARGIN, stroke: '#000', sw: 1.5 })

  // Outdoor rooms dashed, as they have no walls.
  for (const r of level.rooms.filter(r => r.type === 'outdoor')) {
    marks.push({ t: 'rect', x: X(r.rect.x), y: Y(r.rect.y + r.rect.d), w: r.rect.w * k, h: r.rect.d * k, stroke: '#000', sw: 0.5, dash: [4, 3] })
  }

  // Walls, solid at their real thickness.
  const wallBox = (s: WallSegment) => {
    const half = s.thickness / 2
    return s.orientation === 'h'
      ? { x: X(s.from - half), y: Y(s.at + half), w: (s.to - s.from + s.thickness) * k, h: s.thickness * k }
      : { x: X(s.at - half), y: Y(s.to + half), w: s.thickness * k, h: (s.to - s.from + s.thickness) * k }
  }
  for (const s of walls) marks.push({ t: 'rect', ...wallBox(s), fill: s.kind === 'foundation' ? '#555' : s.kind === 'exterior' ? '#000' : '#333' })

  // Openings cut through the walls, then their symbols and the marks that key them to the schedule.
  const tags = openingMarks(e.house)
  for (const o of openings) drawOpening(marks, o, X, Y, k)
  for (const o of openings) drawTag(marks, o, tags.get(o.id), X, Y)

  // Furniture and fixtures in thin outline, as plans show them.
  const here = new Set(level.rooms.map(r => r.id))
  for (const item of (e.house.furniture ?? []).filter(i => here.has(i.roomId) && CATALOG[i.kind])) {
    for (const q of furnitureParts(item)) marks.push({ t: 'rect', x: X(q.x), y: Y(q.y + q.d), w: q.w * k, h: q.d * k, stroke: '#6b6b6b', sw: 0.35 })
  }

  // Beams in this level's ceiling, dashed as "above", with posts as small squares and a schedule mark.
  const beamTags = beamMarks(e.house)
  for (const bm of beamsAbove(e.house, level.id)) {
    const [x1, y1, x2, y2] = bm.orientation === 'h' ? [X(bm.from), Y(bm.at), X(bm.to), Y(bm.at)] : [X(bm.at), Y(bm.from), X(bm.at), Y(bm.to)]
    marks.push({ t: 'line', x1, y1, x2, y2, w: 1.6, dash: [9, 3, 2, 3] })
    for (const p of bm.posts ?? []) { const [px, py] = bm.orientation === 'h' ? [X(p), Y(bm.at)] : [X(bm.at), Y(p)]; marks.push({ t: 'rect', x: px - 3, y: py - 3, w: 6, h: 6, fill: '#000' }) }
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    // Only the mark goes on the plan; the size and span are on the A-602 schedule.
    marks.push({ t: 'text', x: mx + (bm.orientation === 'v' ? 3 : 0), y: my + (bm.orientation === 'h' ? -3 : 0), text: beamTags.get(bm.id)!, size: 4.5, anchor: bm.orientation === 'h' ? 'middle' : 'start', bold: true })
  }

  // Room names and centerline sizes.
  for (const r of level.rooms) {
    const cx = X(r.rect.x + r.rect.w / 2), cy = Y(r.rect.y + r.rect.d / 2)
    const small = r.rect.w < 14 * 12 || r.rect.d < 10 * 12
    marks.push({ t: 'text', x: cx, y: cy - (small ? 0 : 2), text: r.name.toUpperCase(), size: small ? 5 : 7, anchor: 'middle', bold: true })
    if (!small) marks.push({ t: 'text', x: cx, y: cy + 8, text: `${ftIn(r.rect.w)} × ${ftIn(r.rect.d)}`, size: 6, anchor: 'middle' })
  }

  // Section cut lines, keyed to sheet A-401, with the arrow showing which way the section looks.
  for (const cut of sectionCuts(e.house)) {
    const pad = 9 * 12
    const [x1, y1, x2, y2] = cut.axis === 'x'
      ? [X(cut.at), Y(b.y - pad), X(cut.at), Y(b.y + b.d + pad)]
      : [X(b.x - pad), Y(cut.at), X(b.x + b.w + pad), Y(cut.at)]
    marks.push({ t: 'line', x1, y1, x2, y2, w: 0.7, dash: [14, 4, 3, 4] })
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      // Looking west for a north-south cut, north for an east-west cut.
      const [ax, ay] = cut.axis === 'x' ? [px - 14, py] : [px, py - 14]
      marks.push({ t: 'path', d: `M ${px - 9} ${py} A 9 9 0 1 0 ${px + 9} ${py} A 9 9 0 1 0 ${px - 9} ${py} Z`, fill: '#fff', stroke: '#000', sw: 0.8 })
      marks.push({ t: 'path', d: cut.axis === 'x' ? `M ${px - 9} ${py - 5} L ${ax} ${ay} L ${px - 9} ${py + 5} Z` : `M ${px - 5} ${py - 9} L ${ax} ${ay} L ${px + 5} ${py - 9} Z`, fill: '#000' })
      marks.push({ t: 'text', x: px, y: py - 1, text: cut.id, size: 7, anchor: 'middle', bold: true })
      marks.push({ t: 'text', x: px, y: py + 6, text: 'A-401', size: 3.8, anchor: 'middle' })
    }
  }

  // Dimension strings: a chain and an overall dimension on the north and west sides.
  drawDimensions(marks, walls, 'n', X, Y)
  drawDimensions(marks, walls, 'w', X, Y)

  // Drawing title, north arrow, scale bar.
  const titleY = Y(b.y) + 1.1 * PT_PER_IN
  const titleX = MARGIN + 0.6 * PT_PER_IN
  marks.push({ t: 'text', x: titleX, y: titleY, text: `${level.name.toUpperCase()} PLAN`, size: 16, bold: true })
  marks.push({ t: 'line', x1: titleX, y1: titleY + 5, x2: titleX + 3.2 * PT_PER_IN, y2: titleY + 5, w: 1.2 })
  marks.push({ t: 'text', x: titleX, y: titleY + 18, text: `SCALE: ${scale.label}    DIMENSIONS TO WALL CENTERLINES`, size: 8 })
  drawNorthArrow(marks, titleX + 4.4 * PT_PER_IN, titleY - 6)
  drawScaleBar(marks, titleX + 5.4 * PT_PER_IN, titleY + 2, k)

  drawTitleBlock(marks, e, { title: `${level.name.toUpperCase()} PLAN`, scale: scale.label, number }, info, position)
  return { number, title: `${level.name} plan`, width: W, height: H, marks }
}

/** A small tag beside each opening, inside its room: a circle for doors, a box for windows. */
function drawTag(marks: Mark[], o: PlacedOpening, tag: string | undefined, X: (x: number) => number, Y: (y: number) => number) {
  if (!tag) return
  const [ix, iy] = INWARD[o.side]
  const mid = (o.from + o.to) / 2, off = o.wall!.thickness / 2 + (o.kind === 'window' ? 14 : 8)
  const px = o.orientation === 'h' ? mid : o.at + ix * off
  const py = o.orientation === 'h' ? o.at + iy * off : mid
  // Doors put their tag past the swing, so it does not sit on the arc.
  const push = o.kind === 'door' ? o.width * 0.15 : 0
  const x = X(px + (o.orientation === 'v' ? ix * push : 0)), y = Y(py + (o.orientation === 'h' ? iy * push : 0))
  if (o.kind === 'window') marks.push({ t: 'rect', x: x - 7, y: y - 4.5, w: 14, h: 9, fill: '#fff', stroke: '#000', sw: 0.4 })
  else marks.push({ t: 'path', d: `M ${x - 6} ${y} A 6 6 0 1 0 ${x + 6} ${y} A 6 6 0 1 0 ${x - 6} ${y} Z`, fill: '#fff', stroke: '#000', sw: 0.4 })
  marks.push({ t: 'text', x, y: y + 1.8, text: tag, size: 4.6, anchor: 'middle', bold: true })
}

function drawOpening(marks: Mark[], o: PlacedOpening, X: (x: number) => number, Y: (y: number) => number, k: number) {
  const t = o.wall!.thickness
  const P = (a: number, c: number): [number, number] => o.orientation === 'h' ? [X(a), Y(c)] : [X(c), Y(a)]
  const [gx0, gy0] = P(o.from, o.at + (o.orientation === 'h' ? t / 2 + 0.5 : -t / 2 - 0.5))
  const [gx1, gy1] = P(o.to, o.at + (o.orientation === 'h' ? -t / 2 - 0.5 : t / 2 + 0.5))
  marks.push({ t: 'rect', x: Math.min(gx0, gx1), y: Math.min(gy0, gy1), w: Math.abs(gx1 - gx0), h: Math.abs(gy1 - gy0), fill: '#fff' })
  const along = (p: number, off = 0) => P(p, o.at + off)
  if (o.kind === 'window') {
    for (const off of [-t / 2, 0, t / 2]) {
      const [x1, y1] = along(o.from, off), [x2, y2] = along(o.to, off)
      marks.push({ t: 'line', x1, y1, x2, y2, w: off === 0 ? 0.35 : 0.6 })
    }
    for (const end of [o.from, o.to]) {
      const [x1, y1] = along(end, -t / 2), [x2, y2] = along(end, t / 2)
      marks.push({ t: 'line', x1, y1, x2, y2, w: 0.6 })
    }
    return
  }
  if (o.kind === 'garage-door') {
    const [x1, y1] = along(o.from), [x2, y2] = along(o.to)
    marks.push({ t: 'line', x1, y1, x2, y2, w: 0.8, dash: [6, 3] })
    return
  }
  if (o.kind === 'opening') return
  // Door leaf open at 90 degrees, with a quarter-circle swing, hinged at the west or south end.
  const [ix, iy] = INWARD[o.side]
  const dir = o.swing === 'out' ? -1 : 1
  const hinge = { x: o.orientation === 'h' ? o.from : o.at, y: o.orientation === 'h' ? o.at : o.from }
  const closed = { x: o.orientation === 'h' ? o.to : o.at, y: o.orientation === 'h' ? o.at : o.to }
  const open = { x: hinge.x + ix * dir * o.width, y: hinge.y + iy * dir * o.width }
  const [hx, hy] = [X(hinge.x), Y(hinge.y)], [cx, cy] = [X(closed.x), Y(closed.y)], [qx, qy] = [X(open.x), Y(open.y)]
  const sweep = (cx - hx) * (qy - hy) - (cy - hy) * (qx - hx) > 0 ? 1 : 0
  const r = o.width * k
  marks.push({ t: 'line', x1: hx, y1: hy, x2: qx, y2: qy, w: 0.8 })
  marks.push({ t: 'path', d: `M ${cx} ${cy} A ${r} ${r} 0 0 ${sweep} ${qx} ${qy}`, stroke: '#000', sw: 0.35 })
}

/**
 * Chain dimensions along the north or west face: every place an outside wall turns or an inside wall meets it,
 * then the overall length outside that.
 */
function drawDimensions(marks: Mark[], walls: WallSegment[], face: 'n' | 'w', X: (x: number) => number, Y: (y: number) => number) {
  const facing = walls.filter(s => s.kind !== 'interior' && (face === 'n'
    ? s.orientation === 'h' && !s.sides[1]
    : s.orientation === 'v' && !s.sides[0]))
  if (!facing.length) return
  const cross = walls.filter(s => s.orientation !== facing[0].orientation)
  const points = new Set<number>()
  for (const s of facing) {
    points.add(s.from); points.add(s.to)
    for (const c of cross) {
      const touches = face === 'n' ? Math.abs(c.to - s.at) < 0.5 : Math.abs(c.from - s.at) < 0.5
      if (touches && c.at > s.from + 0.5 && c.at < s.to - 0.5) points.add(c.at)
    }
  }
  const stops = [...points].sort((a, b) => a - b)
  const edge = face === 'n' ? Math.max(...facing.map(s => s.at)) : Math.min(...facing.map(s => s.at))
  const tiers = [4 * 12, 8 * 12]
  const at = (tier: number) => face === 'n' ? Y(edge + tiers[tier]) : X(edge - tiers[tier])
  const pos = (v: number) => face === 'n' ? X(v) : Y(v)
  const dimLine = (from: number, to: number, tier: number) => {
    const a = pos(from), c = pos(to), d = at(tier)
    const [x1, y1, x2, y2] = face === 'n' ? [a, d, c, d] : [d, a, d, c]
    marks.push({ t: 'line', x1, y1, x2, y2, w: 0.4 })
    for (const p of [a, c]) {
      const [tx, ty] = face === 'n' ? [p, d] : [d, p]
      marks.push({ t: 'line', x1: tx - 2.5, y1: ty + 2.5, x2: tx + 2.5, y2: ty - 2.5, w: 0.9 })
      const ext = face === 'n' ? { x1: tx, y1: ty - 3, x2: tx, y2: Y(edge) - 3 } : { x1: tx - 3, y1: ty, x2: X(edge) - 3, y2: ty }
      if (tier === 0) marks.push({ t: 'line', ...ext, w: 0.25 })
    }
    const len = Math.abs(to - from)
    const label = ftIn(len), mid = (a + c) / 2
    const size = Math.abs(c - a) < 24 ? 4.5 : 6
    if (face === 'n') marks.push({ t: 'text', x: mid, y: d - 2.5, text: label, size, anchor: 'middle' })
    else marks.push({ t: 'text', x: d - 3, y: mid + 2, text: label, size, anchor: 'end' })
  }
  for (let i = 0; i < stops.length - 1; i++) dimLine(stops[i], stops[i + 1], 0)
  dimLine(stops[0], stops[stops.length - 1], 1)
}

function drawNorthArrow(marks: Mark[], x: number, y: number) {
  marks.push({ t: 'path', d: `M ${x} ${y - 22} L ${x + 8} ${y + 6} L ${x} ${y} L ${x - 8} ${y + 6} Z`, fill: '#000' })
  marks.push({ t: 'text', x, y: y - 26, text: 'N', size: 10, anchor: 'middle', bold: true })
}

function drawScaleBar(marks: Mark[], x: number, y: number, k: number) {
  const ft = 12 * k
  for (const [i, from, to] of [[0, 0, 4], [1, 4, 8], [2, 8, 16]] as const) {
    marks.push({ t: 'rect', x: x + from * ft, y: y - 4, w: (to - from) * ft, h: 4, fill: i % 2 ? '#fff' : '#000', stroke: '#000', sw: 0.5 })
  }
  for (const v of [0, 4, 8, 16]) marks.push({ t: 'text', x: x + v * ft, y: y + 9, text: String(v), size: 6, anchor: 'middle' })
  marks.push({ t: 'text', x: x + 16 * ft + 6, y: y + 9, text: 'FEET', size: 6 })
}

/** The title block every sheet shares, down the right edge. */
export function drawTitleBlock(marks: Mark[], e: Estate, sheet: { title: string; scale: string; number: string; subject?: string }, info: SheetInfo, position: SetPosition) {
  const { width: W, height: H } = ARCH_D
  const x = W - MARGIN / 2 - TITLE_W, top = MARGIN / 2, bottom = H - MARGIN / 2, pad = 10
  const textW = TITLE_W - 2 * pad
  marks.push({ t: 'line', x1: x, y1: top, x2: x, y2: bottom, w: 1.5 })
  let y = top + pad
  const box = (h: number) => { marks.push({ t: 'line', x1: x, y1: y + h, x2: x + TITLE_W, y2: y + h, w: 0.75 }); const start = y; y += h; return start }
  const text = (tx: string, at: number, size: number, bold = false) => marks.push({ t: 'text', x: x + pad, y: at, text: tx, size, bold })
  /** Rough wrap by character count. Helvetica averages about half the font size per character. */
  const wrap = (tx: string, size: number) => {
    const per = Math.floor(textW / (size * 0.6)), lines: string[] = []
    let line = ''
    for (const word of tx.split(' ')) { if ((line + ' ' + word).trim().length > per) { lines.push(line); line = word } else line = (line + ' ' + word).trim() }
    if (line) lines.push(line)
    return lines
  }
  const para = (tx: string, size: number, start: number, bold = false) => { wrap(tx, size).forEach((l, i) => text(l, start + i * (size + 2.5), size, bold)); return wrap(tx, size).length * (size + 2.5) }

  // The draft stamp comes first and largest.
  let s = box(118)
  marks.push({ t: 'rect', x: x + pad - 4, y: s + 6, w: TITLE_W - 2 * pad + 8, h: 100, stroke: '#000', sw: 2 })
  text('DRAFT', s + 34, 22, true)
  para('NOT FOR CONSTRUCTION UNTIL REVIEWED BY A QUALIFIED PERSON', 10, s + 54, true)
  text('Reviewed by: ______________________', s + 92, 8)
  text('Date: ____________', s + 104, 8)

  s = box(78)
  text(info.projectName.toUpperCase(), s + 20, 12, true)
  text(sheet.subject ?? (e.buildings.find(b => b.id === e.house.buildingId)?.name ?? 'Main house').toUpperCase(), s + 36, 10, true)
  para('Concept. Placeholder massing used to test the model, not a finished design.', 7.5, s + 52)

  s = box(170)
  text('GENERAL NOTES', s + 16, 8, true)
  let ny = s + 30
  for (const note of [
    'Dimensions are to wall centerlines unless noted.',
    `Walls: exterior ${e.house.wallThickness.exterior}" (2x6 frame, sheathing, siding, drywall); interior ${e.house.wallThickness.interior}"; foundation ${e.house.wallThickness.foundation}" concrete.`,
    "Passing this app's planning checks does not mean the design meets code. Confirm the adopted code edition with the local building official.",
    'Structural, foundation, mechanical, electrical, plumbing, and site work by others.',
  ]) ny += para(`• ${note}`, 7, ny) + 3

  s = box(64)
  text('SHEET', s + 14, 7)
  text(sheet.title, s + 32, 11, true)
  text(`Scale ${sheet.scale}`, s + 48, 8)

  s = box(54)
  text(`Drawn from model revision ${info.revision}`, s + 16, 8)
  text(`Date ${info.date}`, s + 30, 8)
  text('Drawn by House Project', s + 44, 8)

  // Sheet number sits at the bottom right, where people look for it.
  y = bottom - 96
  marks.push({ t: 'line', x1: x, y1: y, x2: x + TITLE_W, y2: y, w: 1.5 })
  marks.push({ t: 'text', x: x + TITLE_W / 2, y: y + 56, text: sheet.number, size: 40, anchor: 'middle', bold: true })
  marks.push({ t: 'text', x: x + TITLE_W / 2, y: y + 80, text: `Sheet ${position.index} of ${position.count}`, size: 8, anchor: 'middle' })
}
