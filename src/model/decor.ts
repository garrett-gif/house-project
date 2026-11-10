import type { FurnitureItem, HouseModel, Rect, Room, Side } from './types'
import { CATALOG, footprint, parts } from './furniture'
import { placeOpenings } from './walls'

/**
 * Room touches, derived from each room and its furniture so they always follow the layout: rugs under seating groups,
 * beds, and dining tables; floor lamps beside seating; lamps on nightstands; art on the longest open wall; a TV over a
 * TV console; plants in the corners of bigger living spaces. They are drawn, not stored, and the planning checks
 * ignore them. Rects are in the room's frame, z and h in inches above its floor.
 */
export type DecorKind = 'rug' | 'floor-lamp' | 'table-lamp' | 'art' | 'tv' | 'plant'
export interface Decor { kind: DecorKind; roomId: string; rect: Rect; z: number; h: number; color: number; wingId?: string }

const RUG_COLORS = [0x8b6f56, 0x6f7a6a, 0x9a8a72, 0x5f6b78, 0xa07b5c, 0x7d6b5a]
const ART_COLORS = [0x2f4858, 0x86603e, 0x4f6d4a, 0x7a3e3e, 0x3d4f6b]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

const SEATING = new Set(['living-group', 'sectional-group', 'armchair-pair'])
const TABLES = new Set(['dining-12', 'dining-8', 'kitchen-table-6', 'conference-16', 'conference-8'])
const isBed = (kind: string) => /bed-set|twin-bed|bunk-bed|bunk-nook/.test(kind)

const grow = (r: Rect, by: number, inside: Rect): Rect => {
  const x0 = Math.max(inside.x, r.x - by), y0 = Math.max(inside.y, r.y - by)
  const x1 = Math.min(inside.x + inside.w, r.x + r.w + by), y1 = Math.min(inside.y + inside.d, r.y + r.d + by)
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), d: Math.max(0, y1 - y0) }
}
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d

export function roomDecor(house: HouseModel): Decor[] {
  const out: Decor[] = []
  const furniture = house.furniture ?? []
  const placed = placeOpenings(house)
  for (const room of house.levels.flatMap(l => l.rooms)) {
    if (!['living', 'bedroom'].includes(room.type) && !/lounge|lobby|reception|foyer/i.test(room.name)) continue
    const items = furniture.filter(i => i.roomId === room.id && CATALOG[i.kind])
    const inner = { x: room.rect.x + 18, y: room.rect.y + 18, w: room.rect.w - 36, d: room.rect.d - 36 }
    if (inner.w <= 0 || inner.d <= 0) continue
    const seed = hash(room.id)
    const add = (kind: DecorKind, rect: Rect, z: number, h: number, color: number) => out.push({ kind, roomId: room.id, rect, z, h, color, ...(room.wingId ? { wingId: room.wingId } : {}) })
    const solids = items.flatMap(i => parts(i))
    // Rugs: under each seating group, bed, and dining table.
    items.forEach((i, n) => {
      const f = footprint(i)
      if (SEATING.has(i.kind) || TABLES.has(i.kind)) add('rug', grow(f, SEATING.has(i.kind) ? 6 : 24, inner), 0, 0.6, RUG_COLORS[(seed + n) % RUG_COLORS.length])
      else if (isBed(i.kind) && room.type === 'bedroom') add('rug', grow(f, 24, inner), 0, 0.6, RUG_COLORS[(seed + n) % RUG_COLORS.length])
    })
    // Lamps: a floor lamp at the back corner of each seating group, a table lamp on every nightstand.
    for (const i of items.filter(x => SEATING.has(x.kind))) {
      const f = footprint(i), s = 16
      const back = backCorner(i, f, s)
      if (!solids.some(q => hits(q, back))) add('floor-lamp', back, 0, 62, 0x2b2b2b)
    }
    for (const q of solids.filter(x => /nightstand/i.test(x.name))) add('table-lamp', { x: q.x + q.w / 2 - 6, y: q.y + q.d / 2 - 6, w: 12, d: 12 }, q.h, 22, 0xe9e1cf)
    // A TV over each TV console, at seated eye height.
    for (const i of items.filter(x => x.kind === 'tv-console')) {
      const f = footprint(i), along = f.w >= f.d
      add('tv', along ? { x: f.x + f.w / 2 - 32, y: f.y + f.d / 2 - 1.5, w: 64, d: 3 } : { x: f.x + f.w / 2 - 1.5, y: f.y + f.d / 2 - 32, w: 3, d: 64 }, 36, 36, 0x111111)
    }
    // Art on the longest wall with no door or window and no tall piece against it.
    const art = artSpot(room, placed.filter(o => o.roomId === room.id || o.leadsTo === room.id), solids)
    if (art) add('art', art, 54, 30, ART_COLORS[seed % ART_COLORS.length])
    // Plants in the free corners of living spaces of 300 sq ft or more.
    if (room.type === 'living' && room.rect.w * room.rect.d >= 300 * 144) {
      for (const [cx, cy] of [[inner.x, inner.y], [inner.x + inner.w - 18, inner.y + inner.d - 18]]) {
        const spot = { x: cx, y: cy, w: 18, d: 18 }
        if (!solids.some(q => hits(q, spot)) && !out.some(d => d.roomId === room.id && d.kind !== 'rug' && hits(d.rect, spot))) add('plant', spot, 0, 48, 0x4f7a3a)
      }
    }
  }
  return out
}

/** The back corner of a piece, just outside its footprint, where a floor lamp stands. */
function backCorner(i: FurnitureItem, f: Rect, s: number): Rect {
  switch (i.rotation) {
    case 0: return { x: f.x - s, y: f.y, w: s, d: s }
    case 180: return { x: f.x + f.w, y: f.y + f.d - s, w: s, d: s }
    case 90: return { x: f.x + f.w - s, y: f.y - s, w: s, d: s }
    default: return { x: f.x, y: f.y + f.d, w: s, d: s }
  }
}

/** A 4 ft frame centered on the room's longest side free of openings and tall pieces. */
function artSpot(room: Room, openings: { side: Side; roomId: string; leadsTo?: string; from: number; to: number; orientation: 'h' | 'v'; at: number }[], solids: (Rect & { h: number })[]): Rect | null {
  const { x, y, w, d } = room.rect
  const sides: { side: Side; len: number; rect: Rect; line: number; orient: 'h' | 'v' }[] = [
    { side: 'n', len: w, rect: { x: x + w / 2 - 24, y: y + d - 6, w: 48, d: 2 }, line: y + d, orient: 'h' },
    { side: 's', len: w, rect: { x: x + w / 2 - 24, y: y + 4, w: 48, d: 2 }, line: y, orient: 'h' },
    { side: 'e', len: d, rect: { x: x + w - 6, y: y + d / 2 - 24, w: 2, d: 48 }, line: x + w, orient: 'v' },
    { side: 'w', len: d, rect: { x: x + 4, y: y + d / 2 - 24, w: 2, d: 48 }, line: x, orient: 'v' },
  ]
  const free = sides.filter(s => s.len >= 72
    && !openings.some(o => o.orientation === s.orient && Math.abs(o.at - s.line) < 1 && o.from < (s.orient === 'h' ? s.rect.x + 48 : s.rect.y + 48) && (s.orient === 'h' ? s.rect.x : s.rect.y) < o.to)
    && !solids.some(q => q.h > 40 && hits(q, { ...s.rect, x: s.rect.x - 6, y: s.rect.y - 6, w: s.rect.w + 12, d: s.rect.d + 12 })))
  return free.sort((a, b) => b.len - a.len)[0]?.rect ?? null
}
