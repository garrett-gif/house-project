import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyEdit, applyOperations, describeEdits, resizeRect } from './edits'
import type { EditOp } from './edits'
import { toEditOp } from './editTools'
import { diffChecks, validateEstate } from './validate'
import { ft } from './geometry'
import type { Estate } from './types'

const building = (e: Estate, id: string) => e.buildings.find(b => b.id === id)!
const room = (e: Estate, id: string) => e.house.levels.flatMap(l => l.rooms).find(r => r.id === id)
const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const rejected = (r: ReturnType<typeof applyOperations>) => { if (r.ok) throw new Error('expected a rejection'); return r.error }
const box = (x: number, y: number, w: number, d: number) => ({ x: ft(x), y: ft(y), w: ft(w), d: ft(d) })

/** One valid example of every operation. */
const VALID: EditOp[] = [
  { op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(100), dy: ft(-20) },
  { op: 'resizeBuilding', buildingId: 'rv', w: ft(180), d: ft(120), anchor: 'w' },
  { op: 'moveRoom', roomId: 'primary-deck', dx: 0, dy: ft(-2) },
  { op: 'resizeRoom', roomId: 'gear', w: ft(24), d: ft(32), anchor: 's' },
  { op: 'addRoom', levelId: 'walkout', room: { id: 'root-cellar', name: 'Root cellar', type: 'service', rect: box(-38, 64, 20, 26) } },
  { op: 'removeRoom', roomId: 'w-storage-2' },
  { op: 'renameRoom', roomId: 'office', name: 'Reading room' },
  { op: 'setRoomType', roomId: 'craft', type: 'wellness' },
]

describe('applyOperations', () => {
  it.each(VALID.map(op => [op.op, op] as const))('%s never changes the estate it was given', (_name, op) => {
    const before = JSON.stringify(sampleEstate)
    const after = ok(applyOperations(sampleEstate, [op]))
    expect(JSON.stringify(sampleEstate)).toBe(before)
    expect(after).not.toBe(sampleEstate)
    expect(JSON.stringify(after)).not.toBe(before)
  })

  it('does not change the input when it rejects', () => {
    const before = JSON.stringify(sampleEstate)
    rejected(applyOperations(sampleEstate, [VALID[0], { op: 'removeRoom', roomId: 'missing' }]))
    expect(JSON.stringify(sampleEstate)).toBe(before)
  })

  it('applies a set all or nothing and names the failing operation', () => {
    const r = applyOperations(sampleEstate, [VALID[0], { op: 'removeRoom', roomId: 'missing' }])
    expect(r).toMatchObject({ ok: false, index: 1 })
    expect(rejected(r)).toMatch(/^Edit 2 \(removeRoom\): No room with id "missing"/)
  })
})

describe('moveBuilding', () => {
  it('moves a building by feet converted to inches', () => {
    const e = ok(applyEdit(sampleEstate, VALID[0]))
    expect(building(e, 'forestry-shop').rect.x).toBe(building(sampleEstate, 'forestry-shop').rect.x + ft(100))
    expect(building(e, 'forestry-shop').rect.y).toBe(building(sampleEstate, 'forestry-shop').rect.y - ft(20))
  })

  it('moves the car building east and stretches the walkway from the entertainment shop', () => {
    const e = ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'car-building', dx: ft(300), dy: 0 }))
    expect(building(e, 'car-building').rect.x).toBe(building(sampleEstate, 'car-building').rect.x + ft(300))
    const walk = e.walkways.find(w => w.id === 'walk-car')!
    expect(walk.points[0]).toEqual(sampleEstate.walkways.find(w => w.id === 'walk-car')!.points[0])
    expect(walk.points.at(-1)!.x).toBe(ft(1470))
    expect(validateEstate(e).find(c => c.id === 'walkways')!.status).toBe('fail')
  })

  it('moves a detailed building with its rooms, outline, and walkway ends', () => {
    const e = ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'main-house', dx: ft(5), dy: ft(5) }))
    expect(e.house.origin).toEqual({ x: sampleEstate.house.origin.x + ft(5), y: sampleEstate.house.origin.y + ft(5) })
    expect(building(e, 'main-house').rect.x).toBe(building(sampleEstate, 'main-house').rect.x + ft(5))
    const fun = ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'entertainment', dx: ft(-5), dy: 0 }))
    const a = sampleEstate.walkways.find(w => w.id === 'walk-car')!, b = fun.walkways.find(w => w.id === 'walk-car')!
    expect(b.points[0]).toEqual({ x: a.points[0].x - ft(5), y: a.points[0].y })
    expect(b.points.at(-1)).toEqual(a.points.at(-1))
  })

  it('rejects unknown ids, bad numbers, and moves onto another building', () => {
    expect(rejected(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'nope', dx: 0, dy: 0 }))).toMatch(/No building with id "nope"/)
    expect(rejected(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'fuel', dx: Number.NaN, dy: 0 }))).toMatch(/numbers/)
    expect(rejected(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'fuel', dx: 0, dy: ft(970) }))).toMatch(/Forestry machine shop \(forestry-shop\) and Fuel island and storage \(fuel\) would overlap/)
  })
})

describe('resizeBuilding', () => {
  it('resizes around the anchor', () => {
    const e = ok(applyEdit(sampleEstate, VALID[1]))
    expect(building(e, 'rv').rect).toEqual({ ...building(sampleEstate, 'rv').rect, w: ft(180) })
  })

  it('rejects the main house, bad sizes, and bad anchors', () => {
    expect(rejected(applyEdit(sampleEstate, { op: 'resizeBuilding', buildingId: 'main-house', w: ft(300), d: ft(100), anchor: 'sw' }))).toMatch(/comes from its rooms/)
    expect(rejected(applyEdit(sampleEstate, { op: 'resizeBuilding', buildingId: 'rv', w: 0, d: ft(10), anchor: 'sw' }))).toMatch(/at least 1 ft/)
    expect(rejected(applyEdit(sampleEstate, { op: 'resizeBuilding', buildingId: 'rv', w: ft(10), d: ft(99999), anchor: 'sw' }))).toMatch(/under/)
    expect(rejected(applyEdit(sampleEstate, { op: 'resizeBuilding', buildingId: 'rv', w: ft(10), d: ft(10), anchor: 'up' as never }))).toMatch(/anchor/)
    // Detailed buildings take their outline from their rooms.
    expect(rejected(applyEdit(sampleEstate, { op: 'resizeBuilding', buildingId: 'fuel', w: ft(10), d: ft(10), anchor: 'sw' }))).toMatch(/comes from its rooms/)
    expect(rejected(applyEdit(sampleEstate, { op: 'resizeBuilding', buildingId: 'nope', w: ft(10), d: ft(10), anchor: 'sw' }))).toMatch(/No building/)
  })
})

describe('resizeRect', () => {
  it('keeps the anchor point fixed', () => {
    const r = box(0, 0, 10, 10)
    expect(resizeRect(r, ft(20), ft(10), 'sw')).toEqual(box(0, 0, 20, 10))
    expect(resizeRect(r, ft(20), ft(10), 'e')).toEqual(box(-10, 0, 20, 10))
    expect(resizeRect(r, ft(10), ft(20), 'n')).toEqual(box(0, -10, 10, 20))
    expect(resizeRect(r, ft(20), ft(20), 'center')).toEqual(box(-5, -5, 20, 20))
  })
})

describe('room operations', () => {
  it('resizeRoom grows the house outline when a room grows past it', () => {
    const e = ok(applyEdit(sampleEstate, VALID[3]))
    expect(room(e, 'gear')!.rect.d).toBe(ft(32))
    expect(building(e, 'main-house').rect.d).toBe(building(sampleEstate, 'main-house').rect.d + ft(4))
  })

  it('rejects "make the kitchen 7 feet wider" when it would overlap the dining room', () => {
    const error = rejected(applyEdit(sampleEstate, { op: 'resizeRoom', roomId: 'kitchen', w: ft(40), d: ft(28), anchor: 'e' }))
    expect(error).toContain('Formal dining (dining) and Eat-in party kitchen, island, breakfast bay (kitchen) would overlap by 7 ft × 28 ft on the main floor')
  })

  it('accepts the kitchen widening when the dining room gives up the space, in either order', () => {
    const grow: EditOp = { op: 'resizeRoom', roomId: 'kitchen', w: ft(40), d: ft(28), anchor: 'e' }
    const shrink: EditOp = { op: 'resizeRoom', roomId: 'dining', w: ft(11), d: ft(28), anchor: 'w' }
    // The dining room's glass would be left past its new west end, so it narrows too.
    const fit: EditOp = { op: 'resizeOpening', openingId: 'dining-glass', width: ft(8), height: ft(7), sill: ft(1.5) }
    const slide: EditOp = { op: 'moveOpening', openingId: 'dining-glass', side: 's', offset: ft(5.5) }
    for (const ops of [[grow, shrink, fit, slide], [shrink, grow, slide, fit]]) {
      const e = ok(applyOperations(sampleEstate, ops))
      expect(room(e, 'kitchen')!.rect).toEqual(box(28, 0, 40, 28))
      expect(room(e, 'dining')!.rect).toEqual(box(17, 0, 11, 28))
    }
  })

  it('moveRoom moves within the level and rejects overlaps and unknown rooms', () => {
    expect(room(ok(applyEdit(sampleEstate, VALID[2])), 'primary-deck')!.rect.y).toBe(ft(-70))
    expect(rejected(applyEdit(sampleEstate, { op: 'moveRoom', roomId: 'garage', dx: ft(10), dy: 0 }))).toMatch(/3-car garage \(garage\) and Library and home office, window seat \(office\) would overlap by 10 ft × 24 ft/)
    expect(rejected(applyEdit(sampleEstate, { op: 'moveRoom', roomId: 'nope', dx: 0, dy: 0 }))).toMatch(/No room with id "nope"/)
    expect(rejected(applyEdit(sampleEstate, { op: 'moveRoom', roomId: 'garage', dx: Number.POSITIVE_INFINITY, dy: 0 }))).toMatch(/numbers/)
  })

  it('addRoom adds a room on the walkout level by taking space from storage', () => {
    const e = ok(applyOperations(sampleEstate, [
      { op: 'resizeRoom', roomId: 'w-storage-2', w: ft(12), d: ft(12), anchor: 's' },
      { op: 'addRoom', levelId: 'walkout', room: { id: 'cellar-nook', name: 'Cellar nook', type: 'service', rect: box(124, 60, 12, 8) } },
    ]))
    expect(e.house.levels.find(l => l.id === 'walkout')!.rooms.find(r => r.id === 'cellar-nook')).toBeTruthy()
  })

  it('addRoom rejects duplicates, unknown levels, bad ids, types, sizes, and overlaps', () => {
    const add = (levelId: string, id: string, type: string, rect = box(-38, 64, 20, 26)) =>
      applyEdit(sampleEstate, { op: 'addRoom', levelId, room: { id, name: 'New', type: type as never, rect } })
    expect(rejected(add('main', 'office', 'living'))).toMatch(/already exists/)
    expect(rejected(add('attic', 'new', 'living'))).toMatch(/No level with id "attic"\. Levels: walkout, main, upper/)
    expect(rejected(add('walkout', 'Bad Id', 'living'))).toMatch(/lowercase/)
    expect(rejected(add('walkout', 'new', 'ballroom'))).toMatch(/Unknown room type/)
    expect(rejected(add('walkout', 'new', 'living', box(-38, 64, 0.5, 26)))).toMatch(/at least 1 ft/)
    expect(rejected(add('walkout', 'new', 'living', box(50, 60, 10, 10)))).toMatch(/would overlap/)
  })

  it('rejects moving the main house into the outdoor pool house south of it', () => {
    expect(rejected(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'main-house', dx: 0, dy: ft(-70) }))).toMatch(/Outdoor pool and pool house/)
  })

  it('rejects a room that would push the house into the outdoor pool building', () => {
    const r = applyEdit(sampleEstate, { op: 'addRoom', levelId: 'main', room: { id: 'cabana', name: 'Cabana', type: 'living', rect: box(60, -75, 20, 20) } })
    expect(rejected(r)).toMatch(/Main house \(main-house\) and Outdoor pool and pool house \(outdoor-pool\) would overlap/)
  })

  it('removeRoom removes, and rejects unknown rooms and the last room on a level', () => {
    expect(room(ok(applyEdit(sampleEstate, VALID[5])), 'w-storage-2')).toBeUndefined()
    expect(rejected(applyEdit(sampleEstate, { op: 'removeRoom', roomId: 'nope' }))).toMatch(/No room/)
    const one = structuredClone(sampleEstate)
    one.house.levels[0].rooms = one.house.levels[0].rooms.slice(0, 1)
    expect(rejected(applyEdit(one, { op: 'removeRoom', roomId: one.house.levels[0].rooms[0].id }))).toMatch(/last room/)
  })

  it('renameRoom renames, and rejects empty names and unknown rooms', () => {
    expect(room(ok(applyEdit(sampleEstate, VALID[6])), 'office')!.name).toBe('Reading room')
    expect(rejected(applyEdit(sampleEstate, { op: 'renameRoom', roomId: 'office', name: '  ' }))).toMatch(/empty/)
    expect(rejected(applyEdit(sampleEstate, { op: 'renameRoom', roomId: 'nope', name: 'x' }))).toMatch(/No room/)
  })

  it('setRoomType changes the type, and rejects unknown types and rooms', () => {
    expect(room(ok(applyEdit(sampleEstate, VALID[7])), 'craft')!.type).toBe('wellness')
    expect(rejected(applyEdit(sampleEstate, { op: 'setRoomType', roomId: 'craft', type: 'ballroom' as never }))).toMatch(/Unknown room type/)
    expect(rejected(applyEdit(sampleEstate, { op: 'setRoomType', roomId: 'nope', type: 'living' }))).toMatch(/No room/)
  })
})

describe('checks and descriptions', () => {
  it('shows a check failure caused by an edit', () => {
    const e = ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'fuel', dx: ft(-3500), dy: ft(3300) }))
    expect(diffChecks(validateEstate(sampleEstate), validateEstate(e)).find(c => c.id === 'separation')).toMatchObject({ from: 'pass', to: 'fail' })
  })

  it('describes edits in plain language, in order', () => {
    expect(describeEdits([
      { op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(100), dy: 0 },
      { op: 'renameRoom', roomId: 'office', name: 'Reading room' },
      { op: 'setRoomType', roomId: 'office', type: 'service' },
      { op: 'removeRoom', roomId: 'office' },
    ], sampleEstate)).toEqual([
      'Move Forestry machine shop 100 ft east',
      'Rename Library and home office, window seat to Reading room',
      'Make Reading room a service room',
      'Remove Reading room',
    ])
  })
})

describe('edit tools', () => {
  it('converts feet to inches', () => {
    expect(toEditOp('moveBuilding', { buildingId: 'fuel', eastFt: 12.5, northFt: -3 }))
      .toEqual({ ok: true, op: { op: 'moveBuilding', buildingId: 'fuel', dx: 150, dy: -36 } })
    expect(toEditOp('resizeRoom', { roomId: 'kitchen', widthFt: 60, depthFt: 24, anchor: 'w' }))
      .toEqual({ ok: true, op: { op: 'resizeRoom', roomId: 'kitchen', w: 720, d: 288, anchor: 'w' } })
    expect(toEditOp('setRoomType', { roomId: 'craft', type: 'wellness' }))
      .toEqual({ ok: true, op: { op: 'setRoomType', roomId: 'craft', type: 'wellness' } })
  })

  it('rejects unknown tools, missing fields, wrong types, and extra fields', () => {
    expect(toEditOp('deleteEverything', {}).ok).toBe(false)
    expect(toEditOp('moveBuilding', { buildingId: 'fuel', eastFt: 1 }).ok).toBe(false)
    expect(toEditOp('moveBuilding', { buildingId: 'fuel', eastFt: '1', northFt: 0 }).ok).toBe(false)
    expect(toEditOp('removeRoom', { roomId: 'x', extra: true }).ok).toBe(false)
    expect(toEditOp('renameRoom', null).ok).toBe(false)
  })

  it('maps a null bathId to no bath', () => {
    const r = toEditOp('addRoom', { levelId: 'main', id: 'den', name: 'Den', type: 'living', xFt: 0, yFt: 0, widthFt: 10, depthFt: 12, bathId: null, wingId: null })
    expect(r.ok && r.op.op === 'addRoom' && !('bathId' in r.op.room)).toBe(true)
  })
})
