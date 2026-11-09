import type { Check, CheckStatus, Estate, HouseModel, Opening, Room, Beam } from './types'
import { toFt } from './geometry'
import { SIDE_WORD, allWalls, doorGraph, enclosedRooms, levelOf, levelWalls, mustAvoidBedrooms, placeOpenings, reachableFromOutside, roomById } from './walls'
import type { PlacedOpening, WallSegment } from './walls'

/**
 * Planning values taken from the 2006 IRC, which Meade County's published ordinance cites for unincorporated areas.
 * They are starting points for this app's checks, not a statement that a design meets any adopted code.
 */
export const PLANNING_VALUES = {
  maxRiser: 7.75, minTread: 10, minStairWidth: 36,
  minHallWidth: 36,
  egressDoor: { width: 36, height: 80 },
  minDoor: { width: 28, height: 78 },
  escapeWindow: { area: 5.7, areaAtGrade: 5.0, height: 24, width: 20, maxSill: 44 },
}
const BASIS = '2006 IRC planning values, not checked against your adopted code'

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const ftIn = (inches: number) => {
  const f = Math.floor(inches / 12), i = Math.round(inches - f * 12)
  return i === 12 ? `${f + 1}′` : i ? `${f}′ ${i}″` : `${f}′`
}
const make = (id: string, label: string, ok: boolean, detail: string, failAs: CheckStatus, elements: string[]): Check =>
  ok ? { id, label, status: 'pass', detail } : { id, label, status: failAs, detail, elements: [...new Set(elements)] }
const list = (items: string[], max = 4) => items.length <= max ? items.join('; ') : `${items.slice(0, max).join('; ')}; and ${items.length - max} more`

/** Estimated clear opening of a window, in inches, from its rough size and how it opens. */
export function clearOpening(o: Opening) {
  switch (o.operation ?? 'casement') {
    case 'casement': return { w: o.width - 5, h: o.height - 5 }
    case 'double-hung': return { w: o.width - 5, h: o.height / 2 - 4 }
    case 'slider': return { w: o.width / 2 - 4, h: o.height - 5 }
    case 'fixed': return { w: 0, h: 0 }
  }
}

function wallName(house: HouseModel, s: WallSegment) {
  const names = s.sides.map(id => id ? roomById(house, id)?.name ?? id : 'outside')
  return s.sides[0] && s.sides[1] ? `wall between ${names[0]} and ${names[1]}` : `outside wall of ${names[0] === 'outside' ? names[1] : names[0]}`
}

/** Length of a wall on `upper` that is not over a wall on `lower` but is over a room there. */
function unsupported(upper: WallSegment, lowerWalls: WallSegment[], lowerRooms: Room[], beams: Beam[] = []) {
  const step = 6
  let length = 0
  const under = new Set<string>()
  for (let p = upper.from + step / 2; p < upper.to; p += step) {
    const onWall = lowerWalls.some(w => w.orientation === upper.orientation && Math.abs(w.at - upper.at) <= 1 && w.from - 1 <= p && p <= w.to + 1)
    if (onWall) continue
    if (beams.some(b => b.orientation === upper.orientation && Math.abs(b.at - upper.at) <= 1 && b.from - 1 <= p && p <= b.to + 1)) continue
    const [x, y] = upper.orientation === 'h' ? [p, upper.at] : [upper.at, p]
    const room = lowerRooms.find(r => x > r.rect.x + 1 && x < r.rect.x + r.rect.w - 1 && y > r.rect.y + 1 && y < r.rect.y + r.rect.d - 1)
    if (room) { length += step; under.add(room.name) }
  }
  return { length, under: [...under] }
}

export function wallChecks(e: Estate): Check[] {
  const house = e.house
  const walls = allWalls(house)
  const placed = placeOpenings(house, walls)
  const rooms = house.levels.flatMap(enclosedRooms)
  const checks: Check[] = []
  const levelName = (id: string) => house.levels.find(l => l.id === id)?.name ?? id

  // Openings sit on a wall.
  const misfit = placed.filter(o => o.problem)
  checks.push(make('openings-fit', 'Doors and windows sit on walls', misfit.length === 0,
    misfit.length ? list(misfit.map(o => `${o.id}: ${o.problem}`)) : `${placed.length} doors, windows, and openings placed`, 'fail',
    misfit.flatMap(o => [o.id, o.roomId])))

  // Reachability.
  const graph = doorGraph(house, placed)
  const isBedroom = (id: string) => roomById(house, id)?.type === 'bedroom'
  const reached = reachableFromOutside(graph)
  const stranded = rooms.filter(r => !reached.has(r.id))
  checks.push(make('reachable', 'Every room has a way in', stranded.length === 0,
    stranded.length ? `No door path from outside to ${list(stranded.map(r => r.name))}` : `${rooms.length} rooms connected by doors and stairs`, 'fail', stranded.map(r => r.id)))
  const free = reachableFromOutside(graph, id => !isBedroom(id))
  const throughBedroom = rooms.filter(r => reached.has(r.id) && mustAvoidBedrooms(r) && !free.has(r.id))
  checks.push(make('circulation', 'Rooms are reached without passing through a bedroom', throughBedroom.length === 0,
    throughBedroom.length ? `Only through a bedroom: ${list(throughBedroom.map(r => r.name))}` : 'A suite’s own bath and closets may open off its bedroom', 'warn', throughBedroom.map(r => r.id)))

  // Doors.
  const exits = placed.filter(o => !o.problem && o.kind === 'door' && o.leadsTo === 'outside')
  const { egressDoor, minDoor } = PLANNING_VALUES
  // Prefer a front entry (a door from a hall or foyer) over patio and walkout doors when naming the exit.
  const entry = (o: PlacedOpening) => roomById(house, o.roomId)?.type === 'circulation' ? 0 : 1
  const atGrade = (o: PlacedOpening) => house.levels.find(l => l.id === o.levelId)?.elevation === 0 ? 0 : 1
  const goodExit = exits.filter(o => o.width >= egressDoor.width && o.height >= egressDoor.height).sort((a, b) => entry(a) - entry(b) || atGrade(a) - atGrade(b) || b.width - a.width)[0]
  checks.push(make('egress-door', 'An exit door at least 3′ × 6′ 8″', !!goodExit,
    goodExit ? `${goodExit.id}, ${ftIn(goodExit.width)} × ${ftIn(goodExit.height)}. ${BASIS}` : `No outside door is ${ftIn(egressDoor.width)} × ${ftIn(egressDoor.height)} or larger. ${BASIS}`, 'fail',
    goodExit ? [] : exits.map(o => o.roomId)))
  const small = placed.filter(o => !o.problem && o.kind === 'door' && (o.width < minDoor.width || o.height < minDoor.height))
  checks.push(make('door-sizes', 'Doors are at least 2′ 4″ × 6′ 6″', small.length === 0,
    small.length ? list(small.map(o => `${o.id}: ${ftIn(o.width)} × ${ftIn(o.height)}`)) : 'All doors pass. Planning value for comfortable passage', 'warn', small.flatMap(o => [o.id, o.roomId])))

  // Halls.
  const interior = house.wallThickness.interior
  const halls = rooms.filter(r => r.type === 'circulation' && !/stair|landing/i.test(r.name))
  const narrow = halls.filter(r => Math.min(r.rect.w, r.rect.d) - interior < PLANNING_VALUES.minHallWidth)
  checks.push(make('hall-widths', 'Halls are at least 3′ wide between walls', narrow.length === 0,
    narrow.length ? `${list(narrow.map(r => `${r.name}: ${ftIn(Math.min(r.rect.w, r.rect.d) - interior)}`))}. ${BASIS}` : `${halls.length} halls. ${BASIS}`, 'fail', narrow.map(r => r.id)))

  // Escape windows.
  const w = PLANNING_VALUES.escapeWindow
  const bedrooms = rooms.filter(r => r.type === 'bedroom')
  const noEscape = bedrooms.filter(b => {
    const atGrade = levelOf(house, b.id)?.elevation === 0
    return !placed.some(o => o.roomId === b.id && o.kind === 'window' && !o.problem && o.leadsTo === 'outside' && (() => {
      const c = clearOpening(o)
      return c.w >= w.width && c.h >= w.height && o.sill <= w.maxSill && (c.w * c.h) / 144 >= (atGrade ? w.areaAtGrade : w.area)
    })())
  })
  checks.push(make('escape-windows', 'Every bedroom has an escape window', noEscape.length === 0,
    noEscape.length ? `No qualifying window in ${list(noEscape.map(r => r.name))}. Needs about ${w.area} sq ft clear (${w.areaAtGrade} at grade), ${w.height}″ high, ${w.width}″ wide, sill ${w.maxSill}″ or lower. ${BASIS}` : `${bedrooms.length} bedrooms, using estimated clear openings. ${BASIS}`,
    'fail', noEscape.map(r => r.id)))

  // Stairs.
  const stairProblems: [string, string[]][] = []
  for (const s of house.stairs) {
    const from = roomById(house, s.roomId), to = roomById(house, s.toRoomId)
    const lo = levelOf(house, s.roomId), hi = levelOf(house, s.toRoomId)
    if (!from || !to || !lo || !hi) { stairProblems.push([`${s.id}: its stair room is missing`, [s.roomId, s.toRoomId]]); continue }
    const rise = hi.elevation - lo.elevation
    if (rise <= 0) { stairProblems.push([`${s.id}: does not go up`, [from.id]]); continue }
    const risers = Math.ceil(rise / PLANNING_VALUES.maxRiser), treads = risers - 1
    const long = Math.max(from.rect.w, from.rect.d) - interior, short = Math.min(from.rect.w, from.rect.d) - interior
    const runNeeded = s.shape === 'u-shaped' ? Math.ceil(treads / 2) * s.tread + s.width : treads * s.tread
    const widthNeeded = s.shape === 'u-shaped' ? 2 * s.width : s.width
    const issues = [
      s.width < PLANNING_VALUES.minStairWidth ? `width ${ftIn(s.width)} is under 3′` : '',
      s.tread < PLANNING_VALUES.minTread ? `tread ${s.tread}″ is under ${PLANNING_VALUES.minTread}″` : '',
      runNeeded > long || widthNeeded > short ? `needs ${ftIn(runNeeded)} × ${ftIn(widthNeeded)} for ${risers} risers of ${(rise / risers).toFixed(2)}″, but ${from.name} is ${ftIn(long)} × ${ftIn(short)} inside` : '',
    ].filter(Boolean)
    if (issues.length) stairProblems.push([`${from.name} (${levelName(lo.id)}): ${issues.join(', ')}`, [from.id, to.id]])
  }
  checks.push(make('stairs', 'Stairs fit their rooms', stairProblems.length === 0,
    stairProblems.length ? `${list(stairProblems.map(([t]) => t))}. ${BASIS}` : `${house.stairs.length} stairs, rise ${PLANNING_VALUES.maxRiser}″ or less and treads ${PLANNING_VALUES.minTread}″ or more. ${BASIS}`, 'fail',
    stairProblems.flatMap(([, ids]) => ids)))

  // Walls stacking between floors.
  const levels = [...house.levels].sort((a, b) => a.elevation - b.elevation)
  const exterior: { text: string; ids: string[] }[] = [], inner: { text: string; ids: string[]; length: number }[] = []
  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1], upper = levels[i]
    const lowerWalls = levelWalls(house, lower), lowerRooms = enclosedRooms(lower)
    for (const s of levelWalls(house, upper)) {
      const same = <T extends { wingId?: string }>(x: T) => (x.wingId ?? '') === (s.wingId ?? '')
      const u = unsupported(s, lowerWalls.filter(same), lowerRooms.filter(same), (house.beams ?? []).filter(b => b.levelId === upper.id && same(b)))
      if (u.length < 12) continue
      const item = { text: `${upper.name}: ${wallName(house, s)}, ${n(toFt(u.length))} ft over ${u.under.join(' and ')}`, ids: s.sides.filter((x): x is string => !!x), length: u.length }
      if (s.kind === 'interior') inner.push(item); else exterior.push(item)
    }
  }
  checks.push(make('stack-exterior', 'Outside walls sit on walls below', exterior.length === 0,
    exterior.length ? list(exterior.map(x => x.text)) : 'Every outside wall is over a wall or on grade', 'fail', exterior.flatMap(x => x.ids)))
  inner.sort((a, b) => b.length - a.length)
  checks.push(make('stack-interior', 'Inside walls sit on walls below', inner.length === 0,
    inner.length ? `${inner.length} inside wall${inner.length === 1 ? '' : 's'} need a beam or bearing wall below, ${n(toFt(inner.reduce((s, x) => s + x.length, 0)))} ft in all. Longest: ${list(inner.map(x => x.text), 3)}` : `Every inside wall is over a wall, a beam, or on grade${house.beams?.length ? `; ${house.beams.length} beams` : ''}`,
    'warn', inner.flatMap(x => x.ids)))

  return checks
}

export type { PlacedOpening }
export { SIDE_WORD }
