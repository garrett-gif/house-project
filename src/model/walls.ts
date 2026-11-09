import type { HouseModel, Inches, Level, Opening, Room, Side, WallKind } from './types'

/**
 * Walls are derived from room rectangles: room edges are wall centerlines. A wall segment is a stretch of one line
 * where the rooms on both sides stay the same. Outdoor rooms such as terraces have no walls and count as outside.
 */
export interface WallSegment {
  id: string
  levelId: string
  /** 'h' runs east-west, 'v' runs north-south. */
  orientation: 'h' | 'v'
  /** The line's y for a horizontal wall, x for a vertical one, in house-local inches. */
  at: Inches
  from: Inches
  to: Inches
  /** Horizontal: [room to the south, room to the north]. Vertical: [room to the west, room to the east]. null is outside. */
  sides: [string | null, string | null]
  kind: WallKind
  thickness: Inches
}

export const DEFAULT_WALL_THICKNESS = { exterior: 8, interior: 4.5, foundation: 10 } as const
const EPS = 0.01

export const enclosedRooms = (level: Level) => level.rooms.filter(r => r.type !== 'outdoor')
export const levelOf = (house: HouseModel, roomId: string) => house.levels.find(l => l.rooms.some(r => r.id === roomId))
export const roomById = (house: HouseModel, roomId: string) => house.levels.flatMap(l => l.rooms).find(r => r.id === roomId)

/** The line a side of a room sits on, and the span it covers. */
export function sideLine(r: Room, side: Side) {
  const { x, y, w, d } = r.rect
  switch (side) {
    case 'n': return { orientation: 'h' as const, at: y + d, from: x, to: x + w }
    case 's': return { orientation: 'h' as const, at: y, from: x, to: x + w }
    case 'e': return { orientation: 'v' as const, at: x + w, from: y, to: y + d }
    case 'w': return { orientation: 'v' as const, at: x, from: y, to: y + d }
  }
}

/** Which way an exterior wall faces, from the side its room is on. */
export const outwardSide = (s: WallSegment): Side | null =>
  s.sides[0] && s.sides[1] ? null
  : s.orientation === 'h' ? (s.sides[1] ? 's' : 'n')
  : (s.sides[1] ? 'w' : 'e')

export function levelWalls(house: HouseModel, level: Level): WallSegment[] {
  const thickness = house.wallThickness ?? DEFAULT_WALL_THICKNESS
  const out: WallSegment[] = []
  for (const orientation of ['h', 'v'] as const) {
    const lines = new Map<number, { from: number; to: number; room: string; index: 0 | 1 }[]>()
    const add = (at: number, from: number, to: number, room: string, index: 0 | 1) => {
      const list = lines.get(at) ?? []
      list.push({ from, to, room, index })
      lines.set(at, list)
    }
    for (const r of enclosedRooms(level)) {
      const { x, y, w, d } = r.rect
      if (orientation === 'h') { add(y, x, x + w, r.id, 1); add(y + d, x, x + w, r.id, 0) }
      else { add(x, y, y + d, r.id, 1); add(x + w, y, y + d, r.id, 0) }
    }
    for (const [at, edges] of [...lines].sort((a, b) => a[0] - b[0])) {
      const cuts = [...new Set(edges.flatMap(e => [e.from, e.to]))].sort((a, b) => a - b)
      let current: WallSegment | null = null
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1], mid = (a + b) / 2
        const sides: [string | null, string | null] = [null, null]
        for (const e of edges) if (e.from < mid && mid < e.to && !sides[e.index]) sides[e.index] = e.room
        if (!sides[0] && !sides[1]) { current = null; continue }
        if (current && current.sides[0] === sides[0] && current.sides[1] === sides[1] && Math.abs(current.to - a) < EPS) { current.to = b; continue }
        current = { id: `${level.id}:${orientation}${Math.round(at)}:${Math.round(a)}`, levelId: level.id, orientation, at, from: a, to: b, sides, kind: 'interior', thickness: thickness.interior }
        out.push(current)
      }
    }
  }
  for (const s of out) {
    const facing = outwardSide(s)
    if (!facing) continue
    const buried = level.elevation < 0 && !(level.exposed ?? []).includes(facing)
    s.kind = buried ? 'foundation' : 'exterior'
    s.thickness = thickness[s.kind]
  }
  return out
}

export const allWalls = (house: HouseModel) => house.levels.flatMap(l => levelWalls(house, l))

/** An opening located in the plan, with what it connects. `problem` explains why it does not fit, if it does not. */
export interface PlacedOpening extends Opening {
  levelId: string
  orientation: 'h' | 'v'
  at: Inches
  from: Inches
  to: Inches
  wall?: WallSegment
  /** The other side: a room id or 'outside'. */
  leadsTo?: string
  problem?: string
}

const KIND_WORD: Record<Opening['kind'], string> = { door: 'Door', window: 'Window', opening: 'Opening', 'garage-door': 'Garage door' }
export const describeOpening = (o: Opening, house: HouseModel) => `${KIND_WORD[o.kind]} ${o.id} in ${roomById(house, o.roomId)?.name ?? o.roomId}`

export function placeOpenings(house: HouseModel, walls = allWalls(house)): PlacedOpening[] {
  const placed: PlacedOpening[] = house.openings.map(o => {
    const room = roomById(house, o.roomId)
    const level = levelOf(house, o.roomId)
    if (!room || !level) return { ...o, levelId: '', orientation: 'h', at: 0, from: 0, to: 0, problem: `its room "${o.roomId}" no longer exists` }
    const line = sideLine(room, o.side)
    const from = line.from + o.offset - o.width / 2, to = line.from + o.offset + o.width / 2
    const base = { ...o, levelId: level.id, orientation: line.orientation, at: line.at, from, to }
    if (room.type === 'outdoor') return { ...base, problem: `${room.name} is outdoors and has no walls` }
    if (from < line.from - EPS || to > line.to + EPS) return { ...base, problem: `it runs past the end of the ${SIDE_WORD[o.side]} side of ${room.name}` }
    const wall = walls.find(s => s.levelId === level.id && s.orientation === line.orientation && Math.abs(s.at - line.at) < EPS && s.from - EPS <= from && to <= s.to + EPS)
    if (!wall) return { ...base, problem: `it straddles a corner where walls meet on the ${SIDE_WORD[o.side]} side of ${room.name}` }
    const own = wall.sides.indexOf(room.id)
    const other = wall.sides[own === 0 ? 1 : 0]
    const leadsTo = other ?? 'outside'
    if ((o.kind === 'window' || o.kind === 'garage-door') && other) return { ...base, wall, leadsTo, problem: `it is on an interior wall` }
    if (o.kind !== 'door' && o.kind !== 'opening' && o.kind !== 'window' && o.kind !== 'garage-door') return { ...base, wall, leadsTo, problem: 'unknown kind' }
    return { ...base, wall, leadsTo }
  })
  // Openings on the same wall may not overlap each other.
  for (const [i, a] of placed.entries()) {
    if (a.problem || !a.wall) continue
    const b = placed.slice(0, i).find(b => !b.problem && b.wall?.id === a.wall!.id && a.from < b.to - EPS && b.from < a.to - EPS)
    if (b) a.problem = `it overlaps ${b.id} on the same wall`
  }
  return placed
}

const SIDE_WORD: Record<Side, string> = { n: 'north', s: 'south', e: 'east', w: 'west' }
export { SIDE_WORD }

/** Rooms joined by doors, cased openings, and stairs. 'outside' is a node too. Windows do not connect. */
export function doorGraph(house: HouseModel, placed = placeOpenings(house)): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    for (const [x, y] of [[a, b], [b, a]]) { const s = graph.get(x) ?? new Set<string>(); s.add(y); graph.set(x, s) }
  }
  for (const o of placed) if (!o.problem && o.leadsTo && o.kind !== 'window') link(o.roomId, o.leadsTo)
  for (const s of house.stairs) if (roomById(house, s.roomId) && roomById(house, s.toRoomId)) link(s.roomId, s.toRoomId)
  return graph
}

/** Rooms reachable from outside. Rooms for which `passThrough` is false can be entered but not walked through. */
export function reachableFromOutside(graph: Map<string, Set<string>>, passThrough: (id: string) => boolean = () => true): Set<string> {
  const seen = new Set<string>(['outside'])
  const queue = ['outside']
  while (queue.length) {
    const id = queue.shift()!
    if (id !== 'outside' && !passThrough(id)) continue
    for (const next of graph.get(id) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) }
  }
  return seen
}

/** Rooms that must be reachable without walking through a bedroom. A suite's own bath or closet may be reached through it. */
export const mustAvoidBedrooms = (r: Room) => r.type !== 'bath' && r.type !== 'service'
