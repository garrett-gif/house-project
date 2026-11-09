import type { Beam, BeamMaterial, Check, Estate, HouseModel, Room } from './types'
import { utilityRules } from './utilities'
import { enclosedRooms, levelWalls } from './walls'
import type { WallSegment } from './walls'
import { toFt } from './geometry'

export const BEAM_MATERIALS: BeamMaterial[] = ['lvl', 'glulam', 'steel']
export const BEAM_WORD: Record<BeamMaterial, string> = { lvl: 'LVL', glulam: 'Glulam', steel: 'Steel' }

/** Levels in order from the bottom, with the level below each. */
const below = (house: HouseModel, levelId: string) => {
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const i = levels.findIndex(l => l.id === levelId)
  return i > 0 ? levels[i - 1] : undefined
}

const onLine = (w: WallSegment, orientation: 'h' | 'v', at: number, p: number, tol = 1) =>
  w.orientation === orientation && Math.abs(w.at - at) <= tol && w.from - tol <= p && p <= w.to + tol

/** A wall below crosses or meets a point: either a wall across the beam's line there, or one running along it. */
function bearsAt(lower: WallSegment[], b: Pick<Beam, 'orientation' | 'at'>, p: number) {
  const [x, y] = b.orientation === 'h' ? [p, b.at] : [b.at, p]
  return lower.some(w => w.orientation === 'h' ? Math.abs(w.at - y) <= 6 && w.from - 6 <= x && x <= w.to + 6 : Math.abs(w.at - x) <= 6 && w.from - 6 <= y && y <= w.to + 6)
}

/** The span between bearing points, and whether each end sits on a wall below or needs a post. */
export function beamBearing(house: HouseModel, b: Beam) {
  const lower = below(house, b.levelId)
  const walls = lower ? levelWalls(house, lower) : []
  return { span: longestSpan(b), start: bearsAt(walls, b, b.from), end: bearsAt(walls, b, b.to) }
}

/** Longest clear span between the beam's ends and posts. */
export function longestSpan(b: Beam) {
  const stops = [b.from, ...(b.posts ?? []).filter(p => p > b.from && p < b.to).sort((x, y) => x - y), b.to]
  return Math.max(...stops.slice(1).map((p, i) => p - stops[i]))
}

const nextUp = (v: number, list: number[]) => list.find(x => x >= v) ?? list[list.length - 1]

/**
 * A planning size from the span, by common rules of thumb for a beam carrying a wall and floor above: depth about
 * span/20 for LVL and glulam, span/24 for steel. An engineer sizes the real member.
 */
export function beamSize(b: Beam) {
  const spanIn = longestSpan(b)
  switch (b.material) {
    case 'lvl': {
      const depth = nextUp(spanIn / 20, [9.25, 11.875, 14, 16, 18, 20, 24])
      return `3-1/2" x ${depth === 11.875 ? '11-7/8' : depth === 9.25 ? '9-1/4' : depth}" LVL`
    }
    case 'glulam': {
      const depth = Math.max(9, Math.ceil(spanIn / 20 / 1.5) * 1.5)
      return `5-1/8" x ${depth % 1 ? `${Math.floor(depth)}-1/2` : depth}" glulam`
    }
    case 'steel': return `W${nextUp(spanIn / 24, [8, 10, 12, 14, 16, 18, 21, 24, 27])} steel`
  }
}

/** LVL for short spans, glulam to 30 ft, steel beyond. */
export const materialFor = (spanIn: number): BeamMaterial => spanIn <= 12 * 16 ? 'lvl' : spanIn <= 12 * 30 ? 'glulam' : 'steel'

/** Stretches of an upper wall that sit over open floor below rather than on a wall, in inches along the wall. */
function openRuns(upper: WallSegment, lowerWalls: WallSegment[], lowerRooms: Room[]) {
  const step = 6
  const runs: [number, number][] = []
  for (let p = upper.from + step / 2; p < upper.to; p += step) {
    if (lowerWalls.some(w => onLine(w, upper.orientation, upper.at, p))) continue
    const [x, y] = upper.orientation === 'h' ? [p, upper.at] : [upper.at, p]
    if (!lowerRooms.some(r => x > r.rect.x + 1 && x < r.rect.x + r.rect.w - 1 && y > r.rect.y + 1 && y < r.rect.y + r.rect.d - 1)) continue
    const last = runs[runs.length - 1]
    if (last && p - step / 2 - last[1] <= step) last[1] = p + step / 2
    else runs.push([p - step / 2, p + step / 2])
  }
  return runs
}

/**
 * First pass of beams: under every inside wall stretch that stands over open floor, a beam along that wall, carried
 * out to the nearest wall below that crosses its line at each end and broken over any wall it crosses, so each
 * beam spans from wall to wall. Runs on the same line are joined first.
 */
export function firstPassBeams(house: HouseModel): Beam[] {
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const beams: Beam[] = []
  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1], upper = levels[i]
    const lowerWalls = levelWalls(house, lower), lowerRooms = enclosedRooms(lower)
    const lines = new Map<string, { orientation: 'h' | 'v'; at: number; runs: [number, number][] }>()
    for (const s of levelWalls(house, upper).filter(s => s.kind === 'interior')) {
      for (const r of openRuns(s, lowerWalls, lowerRooms)) {
        if (r[1] - r[0] < 12) continue
        const key = `${s.orientation}:${s.at}`
        const line = lines.get(key) ?? { orientation: s.orientation, at: s.at, runs: [] }
        line.runs.push(r)
        lines.set(key, line)
      }
    }
    for (const line of lines.values()) {
      const runs = line.runs.sort((a, b) => a[0] - b[0]).reduce<[number, number][]>((out, r) => {
        const last = out[out.length - 1]
        if (last && r[0] - last[1] <= 12) last[1] = Math.max(last[1], r[1]); else out.push([...r])
        return out
      }, [])
      // Where walls below cross this line, so beams can stop on them.
      const crossings = lowerWalls.filter(w => w.orientation !== line.orientation && w.from - 6 <= line.at && line.at <= w.to + 6).map(w => w.at).sort((a, b) => a - b)
      for (const [a, b] of runs) {
        // Bear on the nearest wall below at each end, and break the beam over any wall it crosses on the way.
        const from = [...crossings].reverse().find(c => c <= a + 6) ?? a
        const to = crossings.find(c => c >= b - 6) ?? b
        const stops = [from, ...crossings.filter(c => c > from + 12 && c < to - 12), to]
        for (let k = 0; k < stops.length - 1; k++) {
          const beam: Beam = { id: `beam-${upper.id}-${beams.length + 1}`, levelId: upper.id, orientation: line.orientation, at: line.at, from: stops[k], to: stops[k + 1], material: 'lvl' }
          // A long beam over a room that can take a column, such as a shop or storage room, gets a post at mid-span.
          const mid = (beam.from + beam.to) / 2
          const [mx, my] = beam.orientation === 'h' ? [mid, beam.at] : [beam.at, mid]
          const room = lowerRooms.find(r => mx > r.rect.x && mx < r.rect.x + r.rect.w && my > r.rect.y && my < r.rect.y + r.rect.d)
          if (beam.to - beam.from > POST_OVER && room && POSTS_OK.includes(room.type)) beam.posts = [mid]
          beam.material = materialFor(longestSpan(beam))
          beams.push(beam)
        }
      }
    }
  }
  return beams
}

/** Spans longer than this get a post in the first pass when the room below can take one. */
const POST_OVER = 12 * 32
/** Rooms where a column is acceptable. Living rooms, pools, theaters, and bedrooms are kept clear. */
const POSTS_OK: Room['type'][] = ['service', 'garage', 'circulation']

/**
 * Beam checks for one house: every end bears on a wall below, and no clear span runs longer than the rule allows.
 * Planning values only; an engineer designs the structure.
 */
export function beamChecks(e: Estate): Check[] {
  const house = e.house
  const rules = utilityRules(e)
  const beams = house.beams ?? []
  const n1 = (v: number) => Math.round(toFt(v) * 10) / 10
  const loose = beams.filter(b => { const x = beamBearing(house, b); return !x.start || !x.end })
  const long = beams.filter(b => longestSpan(b) > rules.maxBeamSpanFt * 12)
  const over = (b: Beam) => {
    const lower = below(house, b.levelId)
    const mid = (b.from + b.to) / 2, [x, y] = b.orientation === 'h' ? [mid, b.at] : [b.at, mid]
    return lower?.rooms.find(r => x > r.rect.x && x < r.rect.x + r.rect.w && y > r.rect.y && y < r.rect.y + r.rect.d)?.name ?? 'open space'
  }
  const BASIS = 'Planning values; an engineer sizes and details the structure.'
  return [
    loose.length
      ? { id: 'beam-bearing', label: 'Beams bear on walls below', status: 'warn', detail: `${loose.map(b => `${b.id} has an end with no wall under it; it needs a post`).join('; ')}. ${BASIS}`, elements: loose.map(b => b.id) }
      : { id: 'beam-bearing', label: 'Beams bear on walls below', status: 'pass', detail: `${beams.length} beams, every end on a wall. ${BASIS}` },
    long.length
      ? { id: 'beam-span', label: `Beam spans are ${rules.maxBeamSpanFt} ft or shorter`, status: 'warn', detail: `${long.slice(0, 4).map(b => `${b.id}: ${n1(longestSpan(b))} ft over ${over(b)}, about a ${beamSize(b)}`).join('; ')}${long.length > 4 ? `; and ${long.length - 4} more` : ''}. Add a post or a wall below, use a transfer truss, or accept a long-span member. ${BASIS}`, elements: long.map(b => b.id) }
      : { id: 'beam-span', label: `Beam spans are ${rules.maxBeamSpanFt} ft or shorter`, status: 'pass', detail: `Longest ${beams.length ? n1(Math.max(...beams.map(longestSpan))) : 0} ft. ${BASIS}` },
  ]
}

/** Schedule marks for beams: BM1, BM2… in the house's beam order. */
export const beamMarks = (house: HouseModel) => new Map((house.beams ?? []).map((b, i) => [b.id, `BM${i + 1}`]))

/** Beams that sit in the ceiling of a level: those carrying walls of the level above it. */
export function beamsAbove(house: HouseModel, levelId: string) {
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const i = levels.findIndex(l => l.id === levelId)
  const up = levels[i + 1]
  return up ? (house.beams ?? []).filter(b => b.levelId === up.id) : []
}

/** Plain description of where a beam is, for schedules and the chat summary. */
export function beamWhere(house: HouseModel, b: Beam) {
  const level = house.levels.find(l => l.id === b.levelId)
  return `under the ${level?.name.toLowerCase() ?? b.levelId}, ${b.orientation === 'h' ? 'east-west' : 'north-south'} on the line at ${Math.round(toFt(b.at) * 10) / 10} ft, ${Math.round(toFt(b.from) * 10) / 10} to ${Math.round(toFt(b.to) * 10) / 10} ft`
}
