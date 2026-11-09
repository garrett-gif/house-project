import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import type { EditOp } from './edits'
import { toEditOp } from './editTools'
import { validateEstate } from './validate'
import { allWalls, doorGraph, levelWalls, placeOpenings, reachableFromOutside } from './walls'
import { loadProject } from './history'
import { summarizeEstate } from './summary'
import { ft } from './geometry'
import type { Estate, Opening } from './types'

const house = sampleEstate.house
const level = (id: string) => house.levels.find(l => l.id === id)!
const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const rejected = (r: ReturnType<typeof applyOperations>) => { if (r.ok) throw new Error('expected a rejection'); return r.error }
const check = (e: Estate, id: string) => validateEstate(e).find(c => c.id === id)!
const placed = (e: Estate) => placeOpenings(e.house)
const wallBetween = (e: Estate, a: string, b: string) => allWalls(e.house).find(s => s.sides.includes(a) && s.sides.includes(b))
/** Where an opening sits in plan, in house-local inches, so tests can tell whether it moved. */
const where = (e: Estate, id: string) => { const o = placed(e).find(o => o.id === id)!; return { at: o.at, from: o.from, to: o.to } }
const door = (over: Partial<Opening>): Opening => ({ id: 'new-door', kind: 'door', roomId: 'library', side: 'n', offset: ft(6), width: 36, height: 80, sill: 0, ...over })

describe('derived walls', () => {
  it('puts interior walls between rooms and exterior walls on the outside', () => {
    expect(wallBetween(sampleEstate, 'kitchen', 'great')).toMatchObject({ kind: 'interior', thickness: 4.5, orientation: 'v', at: ft(96) })
    const north = levelWalls(house, level('main')).filter(s => s.orientation === 'h' && s.at === ft(108))
    expect(north.length).toBeGreaterThan(0)
    expect(north.every(s => s.kind === 'exterior' && s.thickness === 8)).toBe(true)
  })

  it('makes buried walkout walls foundation walls, except the exposed south side', () => {
    const walkout = levelWalls(house, level('walkout')).filter(s => s.kind !== 'interior')
    expect(walkout.filter(s => s.kind === 'foundation').length).toBeGreaterThan(0)
    const pool = walkout.find(s => s.sides.includes('indoor-pool') && s.orientation === 'h' && s.at === 0)!
    expect(pool).toMatchObject({ kind: 'exterior', thickness: 8 })
    expect(walkout.find(s => s.sides.includes('theater') && s.orientation === 'v' && s.at === 0)).toMatchObject({ kind: 'foundation', thickness: 10 })
  })

  it('treats the covered terrace as outside, so the kitchen wall beside it is exterior', () => {
    expect(levelWalls(house, level('main')).find(s => s.sides.includes('kitchen') && s.at === ft(64) && s.orientation === 'h')).toMatchObject({ kind: 'exterior' })
  })
})

describe('first pass of doors, windows, and stairs', () => {
  const all = placed(sampleEstate)

  it('places every opening on a wall', () => {
    expect(all.filter(o => o.problem)).toEqual([])
    expect(all.length).toBeGreaterThan(50)
  })

  it('gives the house a north entry, garage doors, and a kitchen door to the terrace', () => {
    expect(all.some(o => o.roomId === 'foyer' && o.side === 'n' && o.leadsTo === 'outside' && o.width >= 36)).toBe(true)
    expect(all.filter(o => o.kind === 'garage-door' && o.roomId === 'garage')).toHaveLength(2)
    expect(all.some(o => o.roomId === 'kitchen' && o.kind === 'door' && o.leadsTo === 'outside')).toBe(true)
  })

  it('opens each kid bath only into its own bedroom', () => {
    for (let k = 1; k <= 7; k++) {
      const doors = all.filter(o => o.kind !== 'window' && (o.roomId === `kid-${k}-bath` || o.leadsTo === `kid-${k}-bath`))
      expect(doors.map(o => [o.roomId, o.leadsTo].sort())).toEqual([[`kid-${k}`, `kid-${k}-bath`].sort()])
    }
  })

  it('connects every room to outside, through the stairs between levels', () => {
    const reached = reachableFromOutside(doorGraph(house))
    expect(house.levels.flatMap(l => l.rooms).filter(r => r.type !== 'outdoor' && !reached.has(r.id))).toEqual([])
    expect(house.stairs.map(s => [s.roomId, s.toRoomId])).toEqual([['w-stair', 'm-stair'], ['m-stair', 'u-stair']])
  })
})

describe('opening and wall operations', () => {
  const kitchenHall = placed(sampleEstate).find(o => o.roomId === 'kitchen' && o.leadsTo === 'm-hall')!
  const bedroomWindow = placed(sampleEstate).find(o => o.roomId === 'kid-1' && o.kind === 'window')!

  const VALID: EditOp[] = [
    { op: 'addDoor', opening: door({}) },
    { op: 'addWindow', opening: { id: 'lounge-win-9', kind: 'window', roomId: 'lounge', side: 'n', offset: ft(6), width: ft(3), height: ft(4), sill: ft(3), operation: 'double-hung' } },
    { op: 'moveOpening', openingId: kitchenHall.id, side: 'n', offset: ft(10) },
    { op: 'resizeOpening', openingId: bedroomWindow.id, width: ft(4), height: ft(5), sill: 20 },
    { op: 'removeOpening', openingId: bedroomWindow.id },
    { op: 'moveWall', roomId: 'kitchen', side: 'e', distance: ft(10) },
    { op: 'setWallThickness', kind: 'exterior', thickness: 12 },
  ]

  it.each(VALID.map(op => [op.op, op] as const))('%s works and never changes the estate it was given', (_name, op) => {
    const before = JSON.stringify(sampleEstate)
    const after = ok(applyOperations(sampleEstate, [op]))
    expect(JSON.stringify(sampleEstate)).toBe(before)
    expect(JSON.stringify(after)).not.toBe(before)
  })

  it('addDoor connects the rooms on both sides of the wall', () => {
    const e = ok(applyOperations(sampleEstate, [VALID[0]]))
    expect(placed(e).find(o => o.id === 'new-door')).toMatchObject({ leadsTo: 'm-hall' })
  })

  it('rejects openings that do not fit, with the reason', () => {
    const add = (o: Partial<Opening>, op: 'addDoor' | 'addWindow' = 'addDoor') => applyOperations(sampleEstate, [{ op, opening: door(o) }])
    expect(rejected(add({ offset: ft(52) }))).toMatch(/new-door would not fit because it runs past the end of the north side of Library/)
    expect(rejected(add({ roomId: 'm-hall', side: 'n', offset: ft(20) }))).toMatch(/straddles a corner where walls meet on the north side of Gallery/)
    expect(rejected(add({ kind: 'window', sill: 30 }, 'addWindow'))).toMatch(/on an interior wall/)
    expect(rejected(add({ id: kitchenHall.id }))).toMatch(/already exists/)
    expect(rejected(add({ roomId: 'nope' }))).toMatch(/No room/)
    expect(rejected(add({ side: 'x' as never }))).toMatch(/Side must be/)
    expect(rejected(add({ sill: 10 }))).toMatch(/sill is 0/)
    expect(rejected(add({ width: 6 }))).toMatch(/at least 1 ft/)
    expect(rejected(add({ kind: 'window' }))).toMatch(/Kind must be one of: door, opening, garage-door/)
    expect(rejected(add({ offset: kitchenHall.offset, roomId: 'kitchen', side: 'n', id: 'dup-spot' }))).toMatch(/overlaps/)
  })

  it('rejects edits to openings that do not exist, and bad sizes', () => {
    expect(rejected(applyOperations(sampleEstate, [{ op: 'moveOpening', openingId: 'nope', side: 'n', offset: 0 }]))).toMatch(/No door or window/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'removeOpening', openingId: 'nope' }]))).toMatch(/No door or window/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'resizeOpening', openingId: kitchenHall.id, width: 36, height: 80, sill: 6 }]))).toMatch(/sill is 0/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'resizeOpening', openingId: kitchenHall.id, width: ft(30), height: 80, sill: 0 }]))).toMatch(/under 24 ft/)
  })

  it('moveWall widens the kitchen 10 ft by taking it from the great room, leaving doors where they were', () => {
    const e = ok(applyOperations(sampleEstate, [VALID[5]]))
    const room = (id: string) => e.house.levels[1].rooms.find(r => r.id === id)!.rect
    expect(room('kitchen')).toMatchObject({ x: ft(48), w: ft(58) })
    expect(room('great')).toMatchObject({ x: ft(106), w: ft(38) })
    const greatDoor = placed(sampleEstate).find(o => o.roomId === 'great' && o.leadsTo === 'm-hall')!
    expect(where(e, greatDoor.id)).toEqual(where(sampleEstate, greatDoor.id))
    expect(wallBetween(e, 'kitchen', 'great')).toMatchObject({ at: ft(106) })
  })

  it('moveWall rejects squeezing a neighbor to nothing, and walls that push a door off', () => {
    expect(rejected(applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'kitchen', side: 'e', distance: ft(48) }]))).toMatch(/Great room, two story would be less than 1 ft wide/)
    // The great room's patio door sits on its south wall; shrinking the room from the west past it breaks the door.
    const patio = placed(sampleEstate).find(o => o.roomId === 'great' && o.leadsTo === 'outside')!
    const r = applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'kitchen', side: 'e', distance: ft(30) }])
    expect(rejected(r)).toContain(`${patio.id} would not fit`)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'kitchen', side: 'q' as never, distance: 12 }]))).toMatch(/Side must be/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'kitchen', side: 'e', distance: 0 }]))).toMatch(/other than 0/)
  })

  it('setWallThickness changes every wall of that kind and rejects silly values', () => {
    const e = ok(applyOperations(sampleEstate, [VALID[6]]))
    expect(allWalls(e.house).filter(s => s.kind === 'exterior').every(s => s.thickness === 12)).toBe(true)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'setWallThickness', kind: 'exterior', thickness: 1 }]))).toMatch(/between 2 and 24/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'setWallThickness', kind: 'glass' as never, thickness: 6 }]))).toMatch(/Wall kind/)
  })

  it('removeRoom takes its doors, windows, and stairs with it', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'removeRoom', roomId: 'kitchen' }]))
    expect(placed(e).some(o => o.roomId === 'kitchen' || o.leadsTo === 'kitchen')).toBe(false)
    const s = ok(applyOperations(sampleEstate, [{ op: 'removeRoom', roomId: 'u-stair' }]))
    expect(s.house.stairs.map(x => x.toRoomId)).not.toContain('u-stair')
  })

  it('moving a room carries its doors and windows with it', () => {
    const gd = placed(sampleEstate).find(o => o.roomId === 'garage' && o.kind === 'garage-door')!
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveRoom', roomId: 'garage', dx: 0, dy: ft(-1) }]))
    expect(where(e, gd.id)).toEqual({ ...where(sampleEstate, gd.id), at: where(sampleEstate, gd.id).at - ft(1) })
  })
})

describe('wall and opening checks', () => {
  it('flags a bedroom whose only window is removed', () => {
    const windows = placed(sampleEstate).filter(o => o.roomId === 'kid-1' && o.kind === 'window')
    const e = ok(applyOperations(sampleEstate, windows.map(o => ({ op: 'removeOpening', openingId: o.id }) as EditOp)))
    expect(check(e, 'escape-windows')).toMatchObject({ status: 'fail', elements: ['kid-1'] })
  })

  it('flags a window too small or too high to escape through', () => {
    const win = placed(sampleEstate).filter(o => o.roomId === 'kid-2' && o.kind === 'window')
    expect(win).toHaveLength(1)
    const e = ok(applyOperations(sampleEstate, [{ op: 'resizeOpening', openingId: win[0].id, width: ft(2), height: ft(2), sill: ft(5) }]))
    expect(check(e, 'escape-windows').status).toBe('fail')
  })

  it('flags a room left with no way in', () => {
    const doors = placed(sampleEstate).filter(o => o.kind !== 'window' && (o.roomId === 'library' || o.leadsTo === 'library'))
    const e = ok(applyOperations(sampleEstate, doors.map(o => ({ op: 'removeOpening', openingId: o.id }) as EditOp)))
    expect(check(e, 'reachable')).toMatchObject({ status: 'fail', elements: ['library'] })
  })

  it('warns when the only way to a room is through a bedroom', () => {
    // Leave the primary sitting area reachable only through the primary bedroom.
    const others = placed(sampleEstate).filter(o => o.kind !== 'window' && (o.roomId === 'primary-sitting' || o.leadsTo === 'primary-sitting') && o.roomId !== 'primary' && o.leadsTo !== 'primary')
    expect(others.length).toBeGreaterThan(0)
    const e = ok(applyOperations(sampleEstate, others.map(o => ({ op: 'removeOpening', openingId: o.id }) as EditOp)))
    const c = check(e, 'circulation')
    expect(c.status).toBe('warn')
    expect(c.elements).toContain('primary-sitting')
  })

  it('fails stairs that no longer fit their room', () => {
    // The elevator door opens onto the stair hall, so it has to go in the same set or the edit is rejected.
    const elevatorDoors = placed(sampleEstate).filter(o => o.kind !== 'window' && (o.roomId === 'm-elevator' || o.leadsTo === 'm-elevator') && (o.roomId === 'm-stair' || o.leadsTo === 'm-stair'))
    expect(rejected(applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'm-stair', side: 'n', distance: ft(-7) }]))).toMatch(/would not fit/)
    const e = ok(applyOperations(sampleEstate, [
      ...elevatorDoors.map(o => ({ op: 'removeOpening', openingId: o.id }) as EditOp),
      { op: 'moveWall', roomId: 'm-stair', side: 'n', distance: ft(-7) },
    ]))
    expect(check(e, 'stairs')).toMatchObject({ status: 'fail' })
    expect(check(e, 'stairs').elements).toContain('m-stair')
  })

  it('fails an outside wall that lands over the middle of a room below', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'playroom', side: 'n', distance: ft(-4) }]))
    expect(check(e, 'stack-exterior')).toMatchObject({ status: 'fail' })
    expect(check(e, 'stack-exterior').detail).toMatch(/Kids floor: outside wall of Playroom, \d+ ft over Bar and lounge/)
  })

  it('warns that a widened kitchen wall needs support over the walkout below', () => {
    const before = check(sampleEstate, 'stack-interior')
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'kitchen', side: 'e', distance: ft(10) }]))
    const after = check(e, 'stack-interior')
    expect(after.status).toBe('warn')
    expect(after.detail).not.toBe(before.detail)
  })

  it('names the exit door', () => {
    expect(check(sampleEstate, 'egress-door').detail).toMatch(/^Main house: foyer-door/)
  })
})

describe('chat tools for walls and openings', () => {
  it('converts feet to inches and keeps wall thickness in inches', () => {
    expect(toEditOp('addDoor', { id: 'd1', kind: 'door', roomId: 'library', side: 's', offsetFt: 20, widthFt: 3, heightFt: 6.67, swing: 'none' }))
      .toEqual({ ok: true, op: { op: 'addDoor', opening: { id: 'd1', kind: 'door', roomId: 'library', side: 's', offset: 240, width: 36, height: 80, sill: 0 } } })
    expect(toEditOp('addWindow', { id: 'w1', roomId: 'library', side: 'n', offsetFt: 5, widthFt: 4, heightFt: 5, sillFt: 2, operation: 'casement' }))
      .toMatchObject({ ok: true, op: { op: 'addWindow', opening: { kind: 'window', sill: 24, width: 48, operation: 'casement' } } })
    expect(toEditOp('moveWall', { roomId: 'kitchen', side: 'e', distanceFt: 10 })).toEqual({ ok: true, op: { op: 'moveWall', roomId: 'kitchen', side: 'e', distance: 120 } })
    expect(toEditOp('setWallThickness', { kind: 'interior', thicknessIn: 6 })).toEqual({ ok: true, op: { op: 'setWallThickness', kind: 'interior', thickness: 6 } })
    expect(toEditOp('resizeOpening', { openingId: 'x', widthFt: 3, heightFt: 7, sillFt: 0 })).toEqual({ ok: true, op: { op: 'resizeOpening', openingId: 'x', width: 36, height: 84, sill: 0 } })
    expect(toEditOp('moveWall', { roomId: 'kitchen', side: 'e' }).ok).toBe(false)
  })
})

describe('older saved projects', () => {
  it('get the first pass of walls, doors, and windows when opened', () => {
    const old = structuredClone(sampleEstate) as Partial<Estate['house']> & Estate
    const { openings: _o, stairs: _s, wallThickness: _w, ...bare } = old.house
    const loaded = loadProject({ format: 'house-project', version: 1, base: { ...old, house: bare }, revisions: [], index: 0 })
    if (!loaded.ok) throw new Error(loaded.error)
    expect(loaded.timeline.states[0].house.openings.length).toBe(sampleEstate.house.openings.length)
  })
})

describe('model summary for chat', () => {
  it('lists openings under their rooms and explains offsets', () => {
    const text = summarizeEstate(sampleEstate)
    expect(text).toMatch(/offset from that side's west or south end/)
    expect(text).toMatch(/kitchen-door-\d: door, side n, offset [\d.]+, 3x6.67, to m-hall/)
    expect(text).toMatch(/Stairs: stair-w-stair from w-stair up to m-stair/)
  })
})

describe('every chat tool', () => {
  it('converts an input built from its own schema, so field names and the converter cannot drift apart', async () => {
    const { EDIT_TOOLS } = await import('./editTools')
    for (const tool of EDIT_TOOLS) {
      const props = (tool.input_schema as { properties: Record<string, { type: string | string[]; enum?: unknown[] }> }).properties
      const input = Object.fromEntries(Object.entries(props).map(([key, p]) => {
        const type = Array.isArray(p.type) ? p.type[0] : p.type
        return [key, p.enum ? p.enum[0] : type === 'number' ? 1 : type === 'string' ? 'x' : type === 'array' ? ((p as { items?: { type: string } }).items?.type === 'string' ? ['main-house'] : [1, 1, 2, 2]) : type === 'boolean' ? true : null]
      }))
      expect(toEditOp(tool.name, input), tool.name).toMatchObject({ ok: true })
    }
  })
})
