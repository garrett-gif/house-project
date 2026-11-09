import type { Estate, Side } from '../model/types'
import { levelWalls, placeOpenings } from '../model/walls'
import { angleOf, toHouse } from '../model/wings'
import { houseBounds } from '../model/derive'
import { openingMarks } from './marks'

/**
 * The floor plans as an ASCII DXF for CAD, in inches, house-local coordinates with y north. Each level sits to the
 * right of the one below it, with its own layers, so a designer can freeze or move levels independently.
 * Kept to LINE, ARC, and TEXT entities so old and new CAD programs read it the same way.
 */
export function floorPlansDxf(e: Estate): string {
  const house = e.house
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const b = houseBounds(house)
  const gap = 40 * 12
  const out: string[] = []
  const pair = (code: number, value: string | number) => out.push(String(code), typeof value === 'number' ? fmt(value) : value)
  const layers = new Map<string, number>()
  const layer = (name: string, color: number) => { layers.set(name, color); return name }

  const entities: string[] = []
  const ent = (fn: () => void) => { const start = out.length; fn(); entities.push(...out.splice(start)) }
  // Things in a wing are written in its frame and turned into place: `wing` is the frame being written, `off` the sheet shift.
  let wing: string | undefined, off = { x: 0, y: 0 }
  const tp = (x: number, y: number): [number, number] => { if (!wing) return [x, y]; const q = toHouse(house, wing, { x: x - off.x, y: y - off.y }); return [q.x + off.x, q.y + off.y] }
  const line = (l: string, ax: number, ay: number, bx: number, by: number) => ent(() => {
    const [x1, y1] = tp(ax, ay), [x2, y2] = tp(bx, by)
    pair(0, 'LINE'); pair(8, l); pair(10, x1); pair(20, y1); pair(30, 0); pair(11, x2); pair(21, y2); pair(31, 0)
  })
  const arc = (l: string, ax: number, ay: number, r: number, a0: number, a1: number) => ent(() => {
    const [cx, cy] = tp(ax, ay), turn = angleOf(house, wing), start = a0 + turn, end = a1 + turn
    pair(0, 'ARC'); pair(8, l); pair(10, cx); pair(20, cy); pair(30, 0); pair(40, r); pair(50, start); pair(51, end)
  })
  const text = (l: string, ax: number, ay: number, h: number, s: string) => ent(() => {
    const [x, y] = tp(ax, ay)
    pair(0, 'TEXT'); pair(8, l); pair(10, x); pair(20, y); pair(30, 0); pair(40, h); pair(1, clean(s)); pair(72, 1); pair(11, x); pair(21, y); pair(31, 0)
  })
  const rect = (l: string, x0: number, y0: number, x1: number, y1: number) => {
    line(l, x0, y0, x1, y0); line(l, x1, y0, x1, y1); line(l, x1, y1, x0, y1); line(l, x0, y1, x0, y0)
  }

  const tags = openingMarks(house)
  const placed = placeOpenings(house).filter(o => !o.problem && o.wall)
  const INWARD: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [-1, 0], w: [1, 0] }

  levels.forEach((level, i) => {
    const dx = i * (b.w + gap) - b.x, dy = -b.y
    const tag = level.id.toUpperCase()
    off = { x: dx, y: dy }
    const L = {
      wall: layer(`A-WALL-${tag}`, 7), door: layer(`A-DOOR-${tag}`, 3), glaz: layer(`A-GLAZ-${tag}`, 4),
      room: layer(`A-AREA-IDEN-${tag}`, 2), anno: layer(`A-ANNO-${tag}`, 1),
    }
    wing = undefined
    text(L.anno, dx + b.x + b.w / 2, dy + b.y - 10 * 12, 24, `${level.name.toUpperCase()} PLAN, DRAFT, NOT FOR CONSTRUCTION`)
    for (const s of levelWalls(house, level)) {
      wing = s.wingId
      const h = s.thickness / 2
      const holes = placed.filter(o => o.wall!.id === s.id).sort((a, c) => a.from - c.from)
      // Each wall face as a line broken at openings, with the ends closed.
      const faces = (from: number, to: number) => {
        if (to - from < 0.5) return
        if (s.orientation === 'h') { line(L.wall, dx + from, dy + s.at - h, dx + to, dy + s.at - h); line(L.wall, dx + from, dy + s.at + h, dx + to, dy + s.at + h) }
        else { line(L.wall, dx + s.at - h, dy + from, dx + s.at - h, dy + to); line(L.wall, dx + s.at + h, dy + from, dx + s.at + h, dy + to) }
      }
      const jamb = (p: number) => s.orientation === 'h'
        ? line(L.wall, dx + p, dy + s.at - h, dx + p, dy + s.at + h)
        : line(L.wall, dx + s.at - h, dy + p, dx + s.at + h, dy + p)
      let cursor = s.from
      for (const o of holes) { faces(cursor, o.from); jamb(o.from); jamb(o.to); cursor = o.to }
      faces(cursor, s.to)
    }
    for (const o of placed.filter(o => o.levelId === level.id)) {
      wing = o.wall!.wingId
      const at = (p: number, off = 0): [number, number] => o.orientation === 'h' ? [dx + p, dy + o.at + off] : [dx + o.at + off, dy + p]
      const t = o.wall!.thickness / 2
      if (o.kind === 'window') {
        for (const off of [-t / 3, t / 3]) { const [x1, y1] = at(o.from, off), [x2, y2] = at(o.to, off); line(L.glaz, x1, y1, x2, y2) }
      } else if (o.kind === 'door') {
        const [ix, iy] = INWARD[o.side], dir = o.swing === 'out' ? -1 : 1
        const [hx, hy] = at(o.from), [cx, cy] = at(o.to)
        const ox = hx + ix * dir * o.width, oy = hy + iy * dir * o.width
        line(L.door, hx, hy, ox, oy)
        const a1 = deg(cx - hx, cy - hy), a2 = deg(ox - hx, oy - hy)
        const ccw = (cx - hx) * (oy - hy) - (cy - hy) * (ox - hx) > 0
        arc(L.door, hx, hy, o.width, ccw ? a1 : a2, ccw ? a2 : a1)
      } else if (o.kind === 'garage-door') {
        const [x1, y1] = at(o.from), [x2, y2] = at(o.to); line(L.door, x1, y1, x2, y2)
      }
      const mark = tags.get(o.id)
      if (mark) { const [mx, my] = at((o.from + o.to) / 2, (o.kind === 'window' ? -1 : 1) * (t + 14) * (o.side === 'n' || o.side === 'e' ? 1 : -1)); text(L.anno, mx, my, 6, mark) }
    }
    for (const r of level.rooms) {
      wing = r.wingId
      const cx = dx + r.rect.x + r.rect.w / 2, cy = dy + r.rect.y + r.rect.d / 2
      text(L.room, cx, cy + 6, 9, r.name.toUpperCase())
      text(L.room, cx, cy - 8, 6, `${Math.round(r.rect.w / 12)}' x ${Math.round(r.rect.d / 12)}'`)
      if (r.type === 'outdoor') rect(L.room, dx + r.rect.x, dy + r.rect.y, dx + r.rect.x + r.rect.w, dy + r.rect.y + r.rect.d)
    }
  })

  wing = undefined

  // Header, layer table, entities.
  const doc: string[] = []
  const put = (code: number, value: string | number) => doc.push(String(code), typeof value === 'number' ? fmt(value) : value)
  put(0, 'SECTION'); put(2, 'HEADER'); put(9, '$ACADVER'); put(1, 'AC1009'); put(9, '$INSUNITS'); put(70, 1); put(0, 'ENDSEC')
  put(0, 'SECTION'); put(2, 'TABLES'); put(0, 'TABLE'); put(2, 'LAYER'); put(70, layers.size)
  for (const [name, color] of layers) { put(0, 'LAYER'); put(2, name); put(70, 0); put(62, color); put(6, 'CONTINUOUS') }
  put(0, 'ENDTAB'); put(0, 'ENDSEC')
  put(0, 'SECTION'); put(2, 'ENTITIES')
  doc.push(...entities)
  put(0, 'ENDSEC'); put(0, 'EOF')
  return doc.join('\r\n') + '\r\n'
}

const fmt = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
const deg = (x: number, y: number) => ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
/** DXF text is plain ASCII on one line. */
const clean = (s: string) => s.replace(/[\r\n]/g, ' ').replace(/[^\x20-\x7e]/g, '-')
