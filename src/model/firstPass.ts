import type { HouseModel, Inches, Opening, Room, Side, Stair } from './types'
import { ft } from './geometry'
import { DEFAULT_WALL_THICKNESS, doorGraph, enclosedRooms, levelWalls, mustAvoidBedrooms, outwardSide, reachableFromOutside, sideLine } from './walls'
import type { WallSegment } from './walls'
import { firstPassRoofs } from './roofs'

/**
 * A rule-based starting set of doors, windows, and stairs, so circulation and escape checks have something to work
 * on. It is a placeholder to edit, not a design: rooms connect to the nearest hall, suites connect through their
 * bedroom, and habitable rooms get a window on each outside wall.
 */
export function firstPassOpenings(house: HouseModel): Opening[] {
  const openings: Opening[] = []
  /** Rooms that already have a door or opening, to anywhere. */
  const connected = new Set<string>()
  const has = (roomId: string) => connected.has(roomId)

  for (const level of house.levels) {
    const walls = levelWalls(house, level)
    const rooms = enclosedRooms(level)
    const byId = new Map(rooms.map(r => [r.id, r]))
    const len = (s: WallSegment) => s.to - s.from
    const between = (a: string, b: string) => walls.filter(s => s.sides.includes(a) && s.sides.includes(b)).sort((x, y) => len(y) - len(x))[0]
    const neighbors = (id: string) => [...new Set(walls.filter(s => s.sides.includes(id) && s.sides[0] && s.sides[1]).map(s => s.sides[0] === id ? s.sides[1]! : s.sides[0]!))]
    const add = (kind: Opening['kind'], wall: WallSegment, width: Inches, height: Inches, extra: Partial<Opening> = {}, center = (wall.from + wall.to) / 2, hostId?: string) => {
      const host = byId.get(hostId ?? wall.sides[0] ?? wall.sides[1]!)!
      const side = sideOf(host, wall)
      const line = sideLine(host, side)
      const id = `${host.id}-${kind === 'window' ? 'win' : kind === 'garage-door' ? 'gd' : 'door'}-${openings.filter(o => o.roomId === host.id).length + 1}`
      openings.push({ id, kind, roomId: host.id, side, offset: center - line.from, width, height, sill: 0, ...extra })
      const other = wall.sides[0] === host.id ? wall.sides[1] : wall.sides[0]
      if (kind !== 'window') { connected.add(host.id); if (other) connected.add(other) }
    }
    const doorWidth = (r: Room) => r.type === 'bath' || r.type === 'service' ? 32 : 36
    const isCirc = (r?: Room) => r?.type === 'circulation'

    // 1. Halls, galleries, landings, and stairs open into each other.
    for (const s of walls) {
      const [a, b] = s.sides.map(id => id && byId.get(id))
      if (isCirc(a || undefined) && isCirc(b || undefined) && len(s) >= ft(3)) add('opening', s, Math.min(len(s) - 12, ft(6)), ft(8))
    }
    // 2. A bedroom's own bath opens only to that bedroom.
    const owned = new Set(rooms.filter(r => r.type === 'bedroom' && r.bathId).map(r => r.bathId!))
    for (const bed of rooms.filter(r => r.type === 'bedroom' && r.bathId && byId.has(r.bathId))) {
      const s = between(bed.id, bed.bathId!)
      if (s && len(s) >= ft(3)) add('door', s, 32, 80, {}, undefined, bed.bathId)
    }
    // 3. Other rooms get a door to the hall they share the longest wall with.
    for (const r of rooms) {
      if (isCirc(r) || owned.has(r.id)) continue
      const s = walls.filter(w => w.sides.includes(r.id) && w.sides.some(id => id && id !== r.id && isCirc(byId.get(id))) && len(w) >= ft(3)).sort((x, y) => len(y) - len(x))[0]
      if (s) add('door', s, doorWidth(r), 80, {}, undefined, r.id)
    }
    // 4. Rooms still without a door connect to a neighbor that has one: baths and closets prefer their bedroom.
    for (let changed = true; changed;) {
      changed = false
      for (const r of rooms) {
        if (has(r.id)) continue
        const rank = (n: Room) => n.type === 'bedroom' ? (r.type === 'bath' || r.type === 'service' ? 0 : 4)
          : isCirc(n) ? 1 : n.type === r.type ? 2 : 3
        const options = neighbors(r.id).map(id => byId.get(id)!).filter(n => has(n.id))
          .map(n => ({ n, s: between(r.id, n.id) })).filter(x => x.s && len(x.s) >= ft(3))
          .sort((a, b) => rank(a.n) - rank(b.n) || len(b.s) - len(a.s))
        if (options[0]) { add('door', options[0].s, doorWidth(r), 80, {}, undefined, r.id); changed = true }
      }
    }
    // 5. Ways out: the grade-level entry, garage doors, doors onto terraces, and walkout doors.
    const outside = walls.filter(s => outwardSide(s) && s.kind !== 'foundation')
    if (level.elevation === 0) {
      const entry = outside.filter(s => outwardSide(s) === 'n' && isCirc(byId.get((s.sides[0] ?? s.sides[1])!))).sort((x, y) => len(y) - len(x))[0]
      if (entry) add('door', entry, 42, 96)
    }
    for (const g of rooms.filter(r => r.type === 'garage')) {
      const s = outside.filter(w => w.sides.includes(g.id)).sort((x, y) => len(y) - len(x))[0]
      if (s && len(s) >= ft(30)) { add('garage-door', s, ft(16), ft(8), {}, s.from + ft(10)); add('garage-door', s, ft(9), ft(8), {}, s.from + ft(25)) }
      else if (s && len(s) >= ft(12)) add('garage-door', s, Math.min(ft(16), len(s) - ft(2)), ft(8))
    }
    const terraces = level.rooms.filter(r => r.type === 'outdoor')
    const onTerrace = (s: WallSegment) => terraces.some(t => {
      const line = sideLine(t, s.orientation === 'h' ? (outwardSide(s) === 'n' ? 's' : 'n') : (outwardSide(s) === 'e' ? 'w' : 'e'))
      return Math.abs(line.at - s.at) < 0.01 && line.from < s.to && s.from < line.to
    })
    for (const r of rooms.filter(r => r.type === 'living' || r.type === 'pool' || r.type === 'wellness')) {
      const s = outside.filter(w => w.sides.includes(r.id) && len(w) >= ft(8) && (onTerrace(w) || (level.elevation < 0 && r.type !== 'living'))).sort((x, y) => len(y) - len(x))[0]
      if (s) add('door', s, 72, 96, {}, undefined, r.id)
    }
    // 6. Windows on each outside wall of bedrooms and living spaces, skipping walls that already have a door.
    for (const r of rooms.filter(r => ['bedroom', 'living', 'wellness', 'pool'].includes(r.type))) {
      if (level.elevation < 0 && r.type === 'living' && r.name.toLowerCase().includes('theater')) continue
      const seen = new Set<Side>()
      for (const s of outside.filter(w => w.sides.includes(r.id) && len(w) >= ft(4)).sort((x, y) => len(y) - len(x))) {
        const side = sideOf(r, s)
        if (seen.has(side) || openings.some(o => o.roomId === r.id && o.side === side && o.kind !== 'window')) continue
        seen.add(side)
        const width = Math.min(ft(6), Math.floor((len(s) - ft(2)) / 6) * 6)
        add('window', s, width, ft(5), { sill: r.type === 'bedroom' ? 24 : 30, operation: 'casement' }, undefined, r.id)
      }
    }
  }

  // 7. Join rooms that cannot be reached from outside, or that must avoid bedrooms but cannot, to a neighbor that can.
  const isBedroom = (id: string) => house.levels.some(l => l.rooms.some(r => r.id === id && r.type === 'bedroom'))
  for (let guard = 0; guard < 100; guard++) {
    const graph = doorGraph({ ...house, openings })
    const reachedAll = reachableFromOutside(graph)
    const reachedFree = reachableFromOutside(graph, id => !isBedroom(id))
    let added = false
    for (const level of house.levels) {
      const walls = levelWalls(house, level)
      for (const r of enclosedRooms(level)) {
        const strict = mustAvoidBedrooms(r)
        if (reachedAll.has(r.id) && (!strict || reachedFree.has(r.id))) continue
        const ok = (id: string) => strict ? reachedFree.has(id) && !isBedroom(id) : reachedAll.has(id)
        const s = walls.filter(w => w.sides.includes(r.id) && w.sides.every(id => id && (id === r.id || ok(id))) && w.to - w.from >= ft(3))
          .sort((a, b) => Number(isBedroom(otherSide(b, r.id))) - Number(isBedroom(otherSide(a, r.id))) || (b.to - b.from) - (a.to - a.from))[0]
        if (!s) continue
        const side = sideOf(r, s), line = sideLine(r, side)
        openings.push({ id: `${r.id}-door-${openings.filter(o => o.roomId === r.id).length + 1}`, kind: 'door', roomId: r.id, side, offset: (s.from + s.to) / 2 - line.from, width: r.type === 'bath' || r.type === 'service' ? 32 : 36, height: 80, sill: 0 })
        added = true
        break
      }
      if (added) break
    }
    if (!added) break
  }
  return openings
}

const otherSide = (s: WallSegment, id: string) => (s.sides[0] === id ? s.sides[1] : s.sides[0]) ?? 'outside'

/** Which side of `r` a wall segment lies on. */
function sideOf(r: Room, s: WallSegment): Side {
  const { x, y, w, d } = r.rect
  if (s.orientation === 'h') return Math.abs(s.at - (y + d)) < 0.01 ? 'n' : 's'
  return Math.abs(s.at - (x + w)) < 0.01 ? 'e' : 'w'
}

/** Stairs between stacked stair rooms on consecutive levels. */
export function firstPassStairs(house: HouseModel): Stair[] {
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const stairs: Stair[] = []
  for (let i = 0; i < levels.length - 1; i++) {
    const isStair = (r: Room) => r.type === 'circulation' && /stair/i.test(r.name)
    for (const lower of levels[i].rooms.filter(isStair)) {
      const upper = levels[i + 1].rooms.filter(isStair).find(u => u.rect.x < lower.rect.x + lower.rect.w && lower.rect.x < u.rect.x + u.rect.w && u.rect.y < lower.rect.y + lower.rect.d && lower.rect.y < u.rect.y + u.rect.d)
      if (upper) stairs.push({ id: `stair-${lower.id}`, roomId: lower.id, toRoomId: upper.id, shape: 'u-shaped', width: 42, tread: 11 })
    }
  }
  return stairs
}

/** Fills in walls, openings, and stairs for a house saved before they existed. */
export function withHouseDefaults(house: Omit<HouseModel, 'wallThickness' | 'openings' | 'stairs' | 'roofs'> & Partial<HouseModel>): HouseModel {
  const base: HouseModel = { ...house, wallThickness: house.wallThickness ?? { ...DEFAULT_WALL_THICKNESS }, openings: [], stairs: [], roofs: [] }
  const stairs = house.stairs ?? firstPassStairs(base)
  const roofs = house.roofs ?? firstPassRoofs(base)
  return { ...base, stairs, roofs, openings: house.openings ?? firstPassOpenings({ ...base, stairs, roofs }) }
}
