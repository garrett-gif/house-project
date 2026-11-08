import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyEdit, applyEdits, describeEdits, resizeRect } from './edits'
import { toEditOp } from './editTools'
import { diffChecks, validateEstate } from './validate'
import { ft } from './geometry'
import type { Estate } from './types'

const building = (e: Estate, id: string) => e.buildings.find(b => b.id === id)!
const room = (e: Estate, id: string) => e.house.levels.flatMap(l => l.rooms).find(r => r.id === id)!
const ok = (r: ReturnType<typeof applyEdit>) => { if (!r.ok) throw new Error(r.error); return r.estate }

describe('edit operations', () => {
  it('never changes the estate it was given', () => {
    const before = JSON.stringify(sampleEstate)
    ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(100), dy: 0 }))
    expect(JSON.stringify(sampleEstate)).toBe(before)
  })

  it('moves a building', () => {
    const e = ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(100), dy: ft(-20) }))
    expect(building(e, 'forestry-shop').rect.x).toBe(building(sampleEstate, 'forestry-shop').rect.x + ft(100))
    expect(building(e, 'forestry-shop').rect.y).toBe(building(sampleEstate, 'forestry-shop').rect.y - ft(20))
  })

  it('moves the main house with its rooms, outline, and walkways', () => {
    const e = ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'main-house', dx: ft(10), dy: ft(5) }))
    expect(e.house.origin).toEqual({ x: sampleEstate.house.origin.x + ft(10), y: sampleEstate.house.origin.y + ft(5) })
    expect(building(e, 'main-house').rect.x).toBe(building(sampleEstate, 'main-house').rect.x + ft(10))
    for (const id of ['walk-car', 'walk-ent']) {
      const a = sampleEstate.walkways.find(w => w.id === id)!, b = e.walkways.find(w => w.id === id)!
      expect(b.points[0]).toEqual({ x: a.points[0].x + ft(10), y: a.points[0].y + ft(5) })
      expect(b.points.at(-1)).toEqual(a.points.at(-1))
    }
  })

  it('moves the far end of a walkway when its destination building moves', () => {
    const e = ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'car-building', dx: ft(40), dy: 0 }))
    const a = sampleEstate.walkways.find(w => w.id === 'walk-car')!, b = e.walkways.find(w => w.id === 'walk-car')!
    expect(b.points[0]).toEqual(a.points[0])
    expect(b.points.at(-1)!.x).toBe(a.points.at(-1)!.x + ft(40))
  })

  it('resizes around an anchor', () => {
    const r = { x: 0, y: 0, w: ft(10), d: ft(10) }
    expect(resizeRect(r, ft(20), ft(10), 'sw')).toEqual({ x: 0, y: 0, w: ft(20), d: ft(10) })
    expect(resizeRect(r, ft(20), ft(10), 'e')).toEqual({ x: ft(-10), y: 0, w: ft(20), d: ft(10) })
    expect(resizeRect(r, ft(10), ft(20), 'n')).toEqual({ x: 0, y: ft(-10), w: ft(10), d: ft(20) })
    expect(resizeRect(r, ft(20), ft(20), 'center')).toEqual({ x: ft(-5), y: ft(-5), w: ft(20), d: ft(20) })
  })

  it('refuses to resize the main house directly', () => {
    const r = applyEdit(sampleEstate, { op: 'resizeBuilding', buildingId: 'main-house', w: ft(300), d: ft(100), anchor: 'sw' })
    expect(r.ok).toBe(false)
  })

  it('grows the house outline when a room grows past it', () => {
    const e = ok(applyEdit(sampleEstate, { op: 'resizeRoom', roomId: 'library', w: ft(53), d: ft(24), anchor: 's' }))
    expect(building(e, 'main-house').rect.d).toBe(building(sampleEstate, 'main-house').rect.d + ft(10))
  })

  it('adds, renames, and removes rooms', () => {
    let e = ok(applyEdit(sampleEstate, { op: 'addRoom', levelId: 'main', room: { id: 'mudroom-2', name: 'Boot room', type: 'service', rect: { x: ft(-38), y: ft(90), w: ft(38), d: ft(10) } } }))
    expect(room(e, 'mudroom-2').name).toBe('Boot room')
    e = ok(applyEdit(e, { op: 'renameRoom', roomId: 'mudroom-2', name: 'Gear room' }))
    expect(room(e, 'mudroom-2').name).toBe('Gear room')
    e = ok(applyEdit(e, { op: 'removeRoom', roomId: 'mudroom-2' }))
    expect(room(e, 'mudroom-2')).toBeUndefined()
  })

  it('rejects bad input with a clear message', () => {
    const cases = [
      applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'nope', dx: 0, dy: 0 }),
      applyEdit(sampleEstate, { op: 'resizeRoom', roomId: 'library', w: 0, d: ft(10), anchor: 'sw' }),
      applyEdit(sampleEstate, { op: 'addRoom', levelId: 'main', room: { id: 'library', name: 'Dup', type: 'living', rect: { x: 0, y: 0, w: ft(10), d: ft(10) } } }),
      applyEdit(sampleEstate, { op: 'addRoom', levelId: 'attic', room: { id: 'new', name: 'New', type: 'living', rect: { x: 0, y: 0, w: ft(10), d: ft(10) } } }),
      applyEdit(sampleEstate, { op: 'moveRoom', roomId: 'library', dx: Number.NaN, dy: 0 }),
    ]
    for (const r of cases) expect(r.ok).toBe(false)
  })

  it('applies a group all or nothing', () => {
    const r = applyEdits(sampleEstate, [
      { op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(10), dy: 0 },
      { op: 'removeRoom', roomId: 'missing' },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^Edit 2/)
  })

  it('shows a check failure caused by an edit', () => {
    const e = ok(applyEdit(sampleEstate, { op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(-1690), dy: ft(2360) }))
    const changes = diffChecks(validateEstate(sampleEstate), validateEstate(e))
    expect(changes.find(c => c.id === 'separation')).toMatchObject({ from: 'pass', to: 'fail' })
  })

  it('describes edits in plain language', () => {
    const ops = [
      { op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(100), dy: 0 },
      { op: 'renameRoom', roomId: 'library', name: 'Reading room' },
      { op: 'removeRoom', roomId: 'library' },
    ] as const
    expect(describeEdits([...ops], sampleEstate)).toEqual([
      'Move Forestry shop 100 ft east',
      'Rename Library to Reading room',
      'Remove Reading room',
    ])
  })
})

describe('edit tools', () => {
  it('converts feet to inches', () => {
    expect(toEditOp('moveBuilding', { buildingId: 'fuel', eastFt: 12.5, northFt: -3 }))
      .toEqual({ ok: true, op: { op: 'moveBuilding', buildingId: 'fuel', dx: 150, dy: -36 } })
  })

  it('rejects unknown tools, missing fields, and extra fields', () => {
    expect(toEditOp('deleteEverything', {}).ok).toBe(false)
    expect(toEditOp('moveBuilding', { buildingId: 'fuel', eastFt: 1 }).ok).toBe(false)
    expect(toEditOp('moveBuilding', { buildingId: 'fuel', eastFt: '1', northFt: 0 }).ok).toBe(false)
    expect(toEditOp('removeRoom', { roomId: 'x', extra: true }).ok).toBe(false)
  })

  it('maps a null bathId to no bath', () => {
    const r = toEditOp('addRoom', { levelId: 'main', id: 'den', name: 'Den', type: 'living', xFt: 0, yFt: 0, widthFt: 10, depthFt: 12, bathId: null })
    expect(r.ok && r.op.op === 'addRoom' && !('bathId' in r.op.room)).toBe(true)
  })
})
