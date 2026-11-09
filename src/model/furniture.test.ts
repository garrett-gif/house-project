import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import { toEditOp } from './editTools'
import { validateEstate } from './validate'
import { CATALOG, clearance, firstPassFurniture, footprint, parts } from './furniture'
import { houseByBuilding } from './houses'
import { withHouseDefaults } from './firstPass'
import { summarizeEstate } from './summary'
import { furnitureDragOp } from '../ui/dragOps'
import { drawingSet } from '../drawings/drawingSet'
import { ft } from './geometry'
import type { Estate, FurnitureItem } from './types'

const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const check = (e: Estate, id: string) => validateEstate(e).find(c => c.id === id)!
const items = (e: Estate) => e.house.furniture ?? []
const inRoom = (e: Estate, roomId: string) => items(e).filter(i => i.roomId === roomId).map(i => i.kind)
const item = (e: Estate, id: string) => items(e).find(i => i.id === id)!

describe('the furniture first pass', () => {
  it('furnishes both houses and passes every furniture check', () => {
    expect(items(sampleEstate).length).toBeGreaterThan(150)
    expect(houseByBuilding(sampleEstate, 'guest-house')!.furniture!.length).toBeGreaterThan(40)
    for (const id of ['furniture-fit', 'furniture-clearance', 'seating']) expect(check(sampleEstate, id).status, check(sampleEstate, id).detail).toBe('pass')
  })

  it('puts the right pieces in the right rooms', () => {
    expect(inRoom(sampleEstate, 'primary')).toEqual(expect.arrayContaining(['king-bed-set', 'dresser']))
    expect(inRoom(sampleEstate, 'kid-1')).toEqual(expect.arrayContaining(['twin-bed', 'desk']))
    expect(inRoom(sampleEstate, 'kitchen')).toEqual(expect.arrayContaining(['counter-range', 'counter-sink', 'fridge', 'island-table']))
    expect(inRoom(sampleEstate, 'dining')).toContain('dining-12')
    expect(inRoom(sampleEstate, 'garage').filter(k => k === 'car')).toHaveLength(3)
    expect(inRoom(sampleEstate, 'gym')).toEqual(expect.arrayContaining(['power-rack', 'treadmill', 'rower', 'reformer']))
    expect(inRoom(sampleEstate, 'woodshop')).toEqual(expect.arrayContaining(['table-saw', 'workbench', 'dust-collector']))
    expect(inRoom(sampleEstate, 'indoor-pool')).toContain('pool-basin')
    expect(houseByBuilding(sampleEstate, 'guest-house')!.furniture!.filter(i => i.roomId === 'g-bunk').map(i => i.kind)).toEqual(['bunk-bed', 'bunk-bed', 'bunk-bed'])
  })

  it('seats the 20-seat theater', () => {
    expect(inRoom(sampleEstate, 'theater')).toEqual(['theater-screen', 'theater-seating-20'])
    expect(check(sampleEstate, 'seating').detail).toMatch(/20-seat theater seats 20/)
  })

  it('keeps every piece inside its room and clear of the doors', () => {
    const rooms = sampleEstate.house.levels.flatMap(l => l.rooms)
    for (const i of items(sampleEstate)) {
      const r = rooms.find(x => x.id === i.roomId)!.rect, f = footprint(i)
      expect(f.x >= r.x && f.y >= r.y && f.x + f.w <= r.x + r.w && f.y + f.d <= r.y + r.d, i.id).toBe(true)
    }
  })

  it('furnishes a house saved without furniture', () => {
    const { furniture: _f, ...bare } = sampleEstate.house
    expect(withHouseDefaults(bare).furniture!.length).toBeGreaterThan(100)
  })
})

describe('pieces', () => {
  const bed: FurnitureItem = { id: 'b', kind: 'king-bed-set', roomId: 'primary', x: ft(10), y: ft(10), rotation: 0 }

  it('turn their footprint, parts, and walking room with their rotation', () => {
    expect(footprint(bed)).toEqual({ x: ft(10) - 64, y: ft(10) - 43, w: 128, d: 86 })
    expect(footprint({ ...bed, rotation: 90 })).toMatchObject({ w: 86, d: 128 })
    // Facing north, the bed's head is at the south and the walking room is to the north.
    const head = parts(bed).find(q => q.name === 'King bed')!
    expect(head.y).toBe(footprint(bed).y)
    expect(clearance(bed)[0].y).toBe(footprint(bed).y + 86)
    // Facing south, the walking room is to the south.
    expect(clearance({ ...bed, rotation: 180 })[0].y).toBe(footprint(bed).y - 30)
  })

  it('carry real sizes, seats, and machine loads', () => {
    expect(CATALOG.car).toMatchObject({ w: 76, d: 200 })
    expect(CATALOG['theater-seating-20'].seats).toBe(20)
    expect(CATALOG['table-saw'].kw).toBeGreaterThan(3)
  })
})

describe('furniture edits', () => {
  const sofa = items(sampleEstate).find(i => i.roomId === 'den' && i.kind === 'living-group')!

  it('move, turn, add, and remove pieces', () => {
    expect(item(ok(applyOperations(sampleEstate, [{ op: 'moveFurniture', itemId: sofa.id, dx: ft(1), dy: 0 }])), sofa.id).x).toBe(sofa.x + ft(1))
    expect(item(ok(applyOperations(sampleEstate, [{ op: 'rotateFurniture', itemId: sofa.id, rotation: 90 }])), sofa.id).rotation).toBe(90)
    const added = ok(applyOperations(sampleEstate, [{ op: 'addFurniture', item: { id: 'great-piano-2', kind: 'piano', roomId: 'great', x: ft(80), y: ft(50), rotation: 0 } }]))
    expect(item(added, 'great-piano-2').kind).toBe('piano')
    expect(items(ok(applyOperations(sampleEstate, [{ op: 'removeFurniture', itemId: sofa.id }]))).some(i => i.id === sofa.id)).toBe(false)
    expect(applyOperations(sampleEstate, [{ op: 'addFurniture', item: { id: 'x', kind: 'hovercraft', roomId: 'great', x: 0, y: 0, rotation: 0 } }])).toMatchObject({ ok: false })
  })

  it('flag a piece pushed into another, or blocking a door', () => {
    const into = ok(applyOperations(sampleEstate, [{ op: 'addFurniture', item: { id: 'extra-sofa', kind: 'sofa', roomId: 'den', x: sofa.x, y: sofa.y, rotation: 0 } }]))
    expect(check(into, 'furniture-fit')).toMatchObject({ status: 'warn' })
    expect(check(into, 'furniture-fit').elements).toContain('extra-sofa')
  })

  it('flag a theater short of seats', () => {
    const seats = items(sampleEstate).find(i => i.kind === 'theater-seating-20')!
    expect(check(ok(applyOperations(sampleEstate, [{ op: 'removeFurniture', itemId: seats.id }])), 'seating')).toMatchObject({ status: 'warn', elements: ['theater'] })
  })

  it('move with their room, go with a removed room, and refurnish on request', () => {
    const moved = ok(applyOperations(sampleEstate, [{ op: 'moveRoom', roomId: 'primary-deck', dx: 0, dy: ft(-2) }]))
    const deck = items(sampleEstate).find(i => i.roomId === 'primary-deck')!
    expect(item(moved, deck.id).y).toBe(deck.y - ft(2))
    expect(inRoom(ok(applyOperations(sampleEstate, [{ op: 'removeRoom', roomId: 'den' }])), 'den')).toEqual([])
    const cleared = ok(applyOperations(sampleEstate, items(sampleEstate).filter(i => i.roomId === 'den').map(i => ({ op: 'removeFurniture', itemId: i.id }) as const)))
    expect(inRoom(ok(applyOperations(cleared, [{ op: 'furnishRoom', roomId: 'den' }])), 'den')).toEqual(inRoom(sampleEstate, 'den'))
  })

  it('route guest house pieces to the guest house', () => {
    const g = houseByBuilding(sampleEstate, 'guest-house')!.furniture![0]
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveFurniture', itemId: g.id, dx: 6, dy: 0 }]))
    expect(houseByBuilding(e, 'guest-house')!.furniture!.find(i => i.id === g.id)!.x).toBe(g.x + 6)
  })

  it('come from chat tools and drags', () => {
    expect(toEditOp('addFurniture', { id: 'p1', kind: 'piano', roomId: 'great', xFt: 80, yFt: 50, facing: 'east' })).toEqual({ ok: true, op: { op: 'addFurniture', item: { id: 'p1', kind: 'piano', roomId: 'great', x: ft(80), y: ft(50), rotation: 270 } } })
    expect(toEditOp('rotateFurniture', { itemId: 'p1', facing: 'south' })).toEqual({ ok: true, op: { op: 'rotateFurniture', itemId: 'p1', rotation: 180 } })
    expect(furnitureDragOp(sofa, ft(2) + 1, -1)).toEqual({ op: 'moveFurniture', itemId: sofa.id, dx: ft(2), dy: 0 })
    expect(furnitureDragOp(sofa, 1, 1)).toBeNull()
  })
})

describe('furniture elsewhere', () => {
  it('shows on the printed plans and is listed for Claude', () => {
    const set = drawingSet(sampleEstate, { revision: 0, date: '2026-11-09', projectName: 'House Project' })
    const thin = set.find(s => s.number === 'A-102')!.marks.filter(m => m.t === 'rect' && m.stroke === '#6b6b6b')
    expect(thin.length).toBeGreaterThan(100)
    expect(summarizeEstate(sampleEstate)).toMatch(/furniture: f-primary-\d+ king-bed-set at [\d.]+,[\d.]+ rot \d+/)
  })

  it('is the same every time for the same house', () => {
    expect(firstPassFurniture(sampleEstate.house).length).toBe(firstPassFurniture(sampleEstate.house).length)
  })
})
