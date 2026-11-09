import { describe, expect, it } from 'vitest'
import type { Estate, HouseModel, Room } from './types'
import { sampleEstate } from './sampleEstate'
import { ft } from './geometry'
import { ceilingChecks, ceilingOf, ceilingPolygons, ceilingTimber, plateHeight, roofHeightAt } from './ceilings'
import { applyOperations } from './edits'
import { toEditOp } from './editTools'
import { sectionMarks } from '../drawings/sections'

/** One story, 40 x 24 ft great room under a 12:12 gable, and a 12 x 12 study beside it. Floor to floor 11 ft. */
const great: Room = { id: 'gr', name: 'Great room', type: 'living', rect: { x: 0, y: 0, w: ft(40), d: ft(24) }, ceiling: { form: 'vaulted', height: ft(18) } }
const lodge: HouseModel = {
  buildingId: 'house', origin: { x: 0, y: 0 }, concept: true,
  wallThickness: { exterior: 8, interior: 5, foundation: 10 },
  levels: [{ id: 'main', name: 'Main floor', elevation: 0, floorHeight: ft(11), rooms: [great, { id: 'study', name: 'Study', type: 'living', rect: { x: ft(40), y: 0, w: ft(12), d: ft(12) } }] }],
  openings: [], stairs: [],
  roofs: [{ id: 'r', name: 'Roof', rect: { x: 0, y: 0, w: ft(52), d: ft(24) }, levelId: 'main', form: 'gable', pitch: 12, ridge: 'ew', low: 's', overhang: 12 }],
}
const est = (house: HouseModel): Estate => ({ ...sampleEstate, house })
const status = (house: HouseModel, id: string) => ceilingChecks(est(house)).find(c => c.id === id)!.status

describe('ceilings', () => {
  it('springs a vault from the long walls at the plate and peaks along the long way', () => {
    expect(plateHeight(lodge, great)).toBe(ft(10))
    expect(ceilingOf(lodge, great)).toMatchObject({ form: 'vaulted', ridge: 'ew', spacing: ft(12) })
    const polys = ceilingPolygons(lodge, great)
    const planes = polys.filter(p => p.kind === 'roof'), ends = polys.filter(p => p.kind === 'gable')
    expect(planes).toHaveLength(2)
    expect(ends).toHaveLength(2)
    expect(Math.max(...planes.flatMap(p => p.pts.map(q => q[2])))).toBe(ft(18))
    expect(Math.min(...planes.flatMap(p => p.pts.map(q => q[2])))).toBe(ft(10))
  })

  it('puts king-post trusses across the span about 12 ft apart, under a ridge beam', () => {
    const t = ceilingTimber(lodge, great)
    expect(t.filter(m => m.kind === 'post')).toHaveLength(3)
    expect(t.filter(m => m.kind === 'rafter')).toHaveLength(6)
    expect(t.filter(m => m.kind === 'ridge')).toHaveLength(1)
    // Rafters run from the plate at a long wall to the peak in the middle.
    const r = t.find(m => m.kind === 'rafter')!
    expect(Math.abs(r.a[1] - r.b[1])).toBe(ft(12))
    expect(ceilingTimber(lodge, { ...great, ceiling: { form: 'vaulted', height: ft(18), spacing: 0 } })).toEqual([])
    expect(ceilingTimber(lodge, { ...great, ceiling: { form: 'beamed', height: ft(10) } }).filter(m => m.kind === 'beam')).toHaveLength(7)
  })

  it('finds the roof over a point', () => {
    // 12:12 from the 11 ft eave, 12 ft run to the ridge, less the overhang drop is not under the walls.
    expect(roofHeightAt(lodge, ft(20), ft(12))).toBeCloseTo(ft(23), 0)
    expect(roofHeightAt(lodge, ft(80), ft(12))).toBeNull()
  })

  it('passes a vault that fits under the roof, and warns about one that does not or has rooms above', () => {
    expect(status(lodge, 'ceiling-vaults')).toBe('pass')
    const tooTall: HouseModel = { ...lodge, levels: [{ ...lodge.levels[0], rooms: [{ ...great, ceiling: { form: 'vaulted', height: ft(23) } }, lodge.levels[0].rooms[1]] }] }
    expect(status(tooTall, 'ceiling-vaults')).toBe('warn')
    const upstairs: HouseModel = { ...lodge, levels: [...lodge.levels, { id: 'up', name: 'Upper floor', elevation: ft(11), floorHeight: ft(10), rooms: [{ id: 'loft', name: 'Loft', type: 'living', rect: { x: 0, y: 0, w: ft(20), d: ft(24) } }] }] }
    expect(status(upstairs, 'ceiling-vaults')).toBe('warn')
  })

  it('warns about living spaces under 7 ft', () => {
    expect(status(lodge, 'ceiling-height')).toBe('pass')
    const low: HouseModel = { ...lodge, levels: [{ ...lodge.levels[0], rooms: [great, { ...lodge.levels[0].rooms[1], ceiling: { form: 'flat', height: ft(6.5) } }] }] }
    expect(status(low, 'ceiling-height')).toBe('warn')
  })

  it('draws the vault profile on a section across the span', () => {
    const { marks } = sectionMarks(est(lodge), { id: 'a', axis: 'x', at: ft(20) }, 0, 0)
    expect(marks.filter(m => m.t === 'line').length).toBeGreaterThan(2)
  })

  it('is set through the edit and the chat tool, and rejects bad values', () => {
    const e = est(lodge)
    const op = toEditOp('setCeiling', { roomId: 'study', form: 'tray', heightFt: 10, ridge: null, spacingFt: null })
    expect(op.ok).toBe(true)
    const r = applyOperations(e, [op.ok ? op.op : (null as never)])
    expect(r.ok && r.estate.house.levels[0].rooms[1].ceiling).toEqual({ form: 'tray', height: ft(10) })
    expect(applyOperations(e, [{ op: 'setCeiling', roomId: 'study', ceiling: { form: 'dome' as never, height: ft(10) } }]).ok).toBe(false)
    expect(applyOperations(e, [{ op: 'setCeiling', roomId: 'study', ceiling: { form: 'flat', height: ft(3) } }]).ok).toBe(false)
    const cleared = applyOperations(e, [{ op: 'setCeiling', roomId: 'gr', ceiling: null }])
    expect(cleared.ok && cleared.estate.house.levels[0].rooms[0].ceiling).toBeUndefined()
  })
})
