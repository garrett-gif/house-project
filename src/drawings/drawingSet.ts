import type { Estate } from '../model/types'
import { placeOpenings, roomById, SIDE_WORD } from '../model/walls'
import { clearOpening, PLANNING_VALUES } from '../model/wallChecks'
import { validateEstate } from '../model/validate'
import { ARCH_D, PT_PER_IN, ftIn } from './sheet'
import type { Mark, Sheet } from './sheet'
import { MARGIN, TITLE_W, drawTitleBlock, floorPlanSheets, levelsInOrder } from './floorPlanSheet'
import type { SetPosition, SheetInfo } from './floorPlanSheet'
import { openingMarks } from './marks'
import { elevationSheet, roofPlanSheet } from './elevations'

/** The full draft set: cover and index, one plan per level, elevations, roof plan, then door and window schedules. */
export function drawingSet(e: Estate, info: SheetInfo): Sheet[] {
  const levels = e.house.levels.length
  const count = levels + 5
  const plans = floorPlanSheets(e, info, 2, count)
  let n = levels + 2
  const ns = elevationSheet(e, ['north', 'south'], 'A-201', 'North and south elevations', info, { index: n++, count })
  const ew = elevationSheet(e, ['east', 'west'], 'A-202', 'East and west elevations', info, { index: n++, count })
  const roof = roofPlanSheet(e, info, { index: n++, count })
  const schedules = scheduleSheet(e, info, { index: n, count })
  const rest = [...plans, ns, ew, roof, schedules]
  const index = [{ number: 'G-001', title: 'Cover and sheet index' }, ...rest].map(s => ({ number: s.number, title: s.title }))
  return [coverSheet(e, info, index, { index: 1, count }), ...rest]
}

interface Column { label: string; w: number; align?: 'start' | 'middle' }

/** A simple ruled table. Returns the y below it. */
function table(marks: Mark[], x: number, y: number, title: string, columns: Column[], rows: string[][], rowH = 13) {
  const width = columns.reduce((s, c) => s + c.w, 0)
  marks.push({ t: 'text', x, y, text: title, size: 11, bold: true })
  let top = y + 8
  const line = (yy: number, w = 0.4) => marks.push({ t: 'line', x1: x, y1: yy, x2: x + width, y2: yy, w })
  line(top, 1)
  const cells = (values: string[], yy: number, bold: boolean) => {
    let cx = x
    columns.forEach((c, i) => {
      const tx = c.align === 'middle' ? cx + c.w / 2 : cx + 4
      marks.push({ t: 'text', x: tx, y: yy + rowH - 4, text: values[i] ?? '', size: bold ? 6.5 : 6.5, bold, anchor: c.align === 'middle' ? 'middle' : 'start' })
      cx += c.w
    })
  }
  cells(columns.map(c => c.label), top, true)
  top += rowH
  line(top, 0.8)
  for (const r of rows) { cells(r, top, false); top += rowH; line(top) }
  let cx = x
  for (const c of [...columns, null]) { marks.push({ t: 'line', x1: cx, y1: y + 8, x2: cx, y2: top, w: 0.4 }); if (c) cx += c.w }
  return top
}

function frame(marks: Mark[]) {
  marks.push({ t: 'rect', x: MARGIN / 2, y: MARGIN / 2, w: ARCH_D.width - MARGIN, h: ARCH_D.height - MARGIN, stroke: '#000', sw: 1.5 })
}

export function coverSheet(e: Estate, info: SheetInfo, index: { number: string; title: string }[], position: SetPosition): Sheet {
  const marks: Mark[] = []
  frame(marks)
  const x = MARGIN + 0.75 * PT_PER_IN
  let y = MARGIN + 1.5 * PT_PER_IN
  marks.push({ t: 'text', x, y, text: info.projectName.toUpperCase(), size: 40, bold: true })
  y += 34
  marks.push({ t: 'text', x, y, text: 'MAIN HOUSE · DRAFT DRAWING SET', size: 18, bold: true })
  y += 24
  marks.push({ t: 'text', x, y, text: 'Concept stage. Placeholder massing used to test the model, not a finished design.', size: 11 })

  // A plain statement of what these drawings are, in the place everyone reads first.
  y += 30
  marks.push({ t: 'rect', x: x - 8, y, w: 9 * PT_PER_IN, h: 78, stroke: '#000', sw: 2 })
  marks.push({ t: 'text', x, y: y + 26, text: 'DRAFT. NOT FOR CONSTRUCTION UNTIL REVIEWED BY A QUALIFIED PERSON.', size: 13, bold: true })
  marks.push({ t: 'text', x, y: y + 46, text: "These drawings come from a planning model. Passing this app's checks does not mean the design meets code.", size: 9 })
  marks.push({ t: 'text', x, y: y + 62, text: 'Structural, foundation, mechanical, electrical, plumbing, septic, well, and site work are by others.', size: 9 })
  y += 120

  const left = y
  y = table(marks, x, y, 'SHEET INDEX', [{ label: 'SHEET', w: 70 }, { label: 'TITLE', w: 260 }], index.map(s => [s.number, s.title]), 16)

  // Floor areas, to wall centerlines, so they match the plans.
  const levels = levelsInOrder(e)
  const area = (id: string) => (levels.find(l => l.id === id)?.rooms ?? []).filter(r => r.type !== 'outdoor' && r.type !== 'garage').reduce((s, r) => s + r.rect.w * r.rect.d, 0) / 144
  const rows = levels.map(l => [l.name, ftIn(l.elevation), ftIn(l.floorHeight), Math.round(area(l.id)).toLocaleString('en-US')])
  rows.push(['Total, excluding garage and outdoor rooms', '', '', Math.round(levels.reduce((s, l) => s + area(l.id), 0)).toLocaleString('en-US')])
  table(marks, x + 6 * PT_PER_IN, left, 'FLOOR AREAS (SQ FT, TO WALL CENTERLINES)', [{ label: 'LEVEL', w: 210 }, { label: 'FLOOR AT', w: 70, align: 'middle' }, { label: 'FLOOR TO FLOOR', w: 90, align: 'middle' }, { label: 'AREA', w: 70, align: 'middle' }], rows, 16)

  // A snapshot of this app's checks when the set was drawn.
  y += 40
  const checks = validateEstate(e)
  const notPassing = checks.filter(c => c.status !== 'pass')
  marks.push({ t: 'text', x, y, text: "THIS APP'S PLANNING CHECKS WHEN DRAWN", size: 11, bold: true })
  y += 16
  marks.push({ t: 'text', x, y, text: `${checks.length - notPassing.length} of ${checks.length} pass. These are planning aids, not a code review.`, size: 9 })
  for (const c of notPassing.slice(0, 12)) {
    y += 14
    marks.push({ t: 'text', x, y, text: `${c.status === 'fail' ? 'FAILS' : 'WARNS'}: ${c.label}. ${c.detail.length > 150 ? c.detail.slice(0, 147) + '…' : c.detail}`, size: 7.5 })
  }

  drawTitleBlock(marks, e, { title: 'COVER AND SHEET INDEX', scale: 'None', number: 'G-001' }, info, position)
  return { number: 'G-001', title: 'Cover and sheet index', width: ARCH_D.width, height: ARCH_D.height, marks }
}

export function scheduleSheet(e: Estate, info: SheetInfo, position: SetPosition): Sheet {
  const marks: Mark[] = []
  frame(marks)
  const tags = openingMarks(e.house)
  const placed = placeOpenings(e.house).filter(o => tags.has(o.id)).sort((a, b) => tags.get(a.id)!.localeCompare(tags.get(b.id)!))
  const name = (id?: string) => !id ? '' : id === 'outside' ? 'Outside' : roomById(e.house, id)?.name ?? id
  const level = (id: string) => e.house.levels.find(l => l.id === id)?.name ?? id
  const x = MARGIN + 0.5 * PT_PER_IN, y = MARGIN + 0.9 * PT_PER_IN

  const doors = placed.filter(o => o.kind !== 'window')
  const kind = { door: 'Door', opening: 'Cased opening', 'garage-door': 'Overhead garage door', window: 'Window' }
  table(marks, x, y, 'DOOR SCHEDULE', [
    { label: 'MARK', w: 38, align: 'middle' }, { label: 'LEVEL', w: 80 }, { label: 'FROM', w: 150 }, { label: 'TO', w: 150 },
    { label: 'TYPE', w: 104 }, { label: 'WIDTH', w: 52, align: 'middle' }, { label: 'HEIGHT', w: 52, align: 'middle' }, { label: 'SWING', w: 70 }, { label: 'MODEL ID', w: 120 },
  ], doors.map(o => [tags.get(o.id)!, level(o.levelId), name(o.roomId), name(o.leadsTo), kind[o.kind], ftIn(o.width), ftIn(o.height),
    o.kind === 'door' ? `${o.swing === 'out' ? 'Out of' : 'Into'} ${name(o.roomId).split(' ')[0].toLowerCase()}` : '', o.id]), 11.5)

  const windows = placed.filter(o => o.kind === 'window')
  const ew = PLANNING_VALUES.escapeWindow
  table(marks, x + 11.75 * PT_PER_IN, y, 'WINDOW SCHEDULE', [
    { label: 'MARK', w: 38, align: 'middle' }, { label: 'LEVEL', w: 80 }, { label: 'ROOM', w: 150 }, { label: 'WALL', w: 44, align: 'middle' },
    { label: 'WIDTH', w: 52, align: 'middle' }, { label: 'HEIGHT', w: 52, align: 'middle' }, { label: 'SILL', w: 52, align: 'middle' },
    { label: 'OPERATION', w: 70 }, { label: 'CLEAR SQ FT*', w: 64, align: 'middle' }, { label: 'ESCAPE*', w: 50, align: 'middle' },
  ], windows.map(o => {
    const c = clearOpening(o), sq = (c.w * c.h) / 144
    const bedroom = roomById(e.house, o.roomId)?.type === 'bedroom'
    const escape = c.w >= ew.width && c.h >= ew.height && o.sill <= ew.maxSill && sq >= ew.areaAtGrade
    return [tags.get(o.id)!, level(o.levelId), name(o.roomId), SIDE_WORD[o.side][0].toUpperCase(), ftIn(o.width), ftIn(o.height), ftIn(o.sill),
      o.operation ?? 'casement', sq.toFixed(1), bedroom ? (escape ? 'Yes' : 'NO') : '']
  }), 11.5)
  const noteY = y + 30 + (windows.length + 2) * 11.5
  marks.push({ t: 'text', x: x + 11.75 * PT_PER_IN, y: noteY, text: '* Clear opening is estimated from the rough opening and how the window opens. Escape uses 2006 IRC planning values', size: 7 })
  marks.push({ t: 'text', x: x + 11.75 * PT_PER_IN, y: noteY + 10, text: `  (${ew.area} sq ft, ${ew.areaAtGrade} at grade, ${ew.height}" high, ${ew.width}" wide, sill ${ew.maxSill}" max). Confirm with the window maker and local official.`, size: 7 })
  marks.push({ t: 'text', x: x + 11.75 * PT_PER_IN, y: noteY + 24, text: 'Sizes are nominal rough openings. Hardware, glazing, and fire ratings are not specified at this stage.', size: 7 })

  drawTitleBlock(marks, e, { title: 'DOOR AND WINDOW SCHEDULES', scale: 'None', number: 'A-601' }, info, position)
  return { number: 'A-601', title: 'Door and window schedules', width: ARCH_D.width, height: ARCH_D.height, marks }
}

export { TITLE_W }
