import { describe, expect, it } from 'vitest'
import type { Estate, HouseModel } from './types'
import { sampleEstate } from './sampleEstate'
import { ft } from './geometry'
import { placeOpenings } from './walls'
import { bayChecks, bayOutline } from './bays'
import { applyOperations } from './edits'
import { toEditOp } from './editTools'
import { floorPlanSheet } from '../drawings/floorPlanSheet'

/** A 20 x 16 ft hearth room with a 10 ft window on the south wall, and a closet to its east. */
const nook: HouseModel = {
  buildingId: 'house', origin: { x: 0, y: 0 }, concept: true,
  wallThickness: { exterior: 8, interior: 5, foundation: 10 },
  levels: [{ id: 'main', name: 'Main floor', elevation: 0, floorHeight: ft(10), rooms: [
    { id: 'hearth', name: 'Hearth room', type: 'living', rect: { x: 0, y: 0, w: ft(20), d: ft(16) } },
    { id: 'closet', name: 'Closet', type: 'service', rect: { x: ft(20), y: 0, w: ft(6), d: ft(16) } },
  ] }],
  openings: [
    { id: 'bw', kind: 'window', roomId: 'hearth', side: 's', offset: ft(10), width: ft(10), height: ft(5), sill: 18, bay: { form: 'angled', depth: ft(3), seat: true } },
    { id: 'iw', kind: 'window', roomId: 'hearth', side: 'n', offset: ft(10), width: ft(4), height: ft(4), sill: ft(3) },
  ],
  stairs: [], roofs: [],
}
const est = (house: HouseModel): Estate => ({ ...sampleEstate, house })

describe('bays', () => {
  it('outlines an angled bay with 45 degree sides out from the wall', () => {
    const o = placeOpenings(nook).find(x => x.id === 'bw')!
    expect(bayOutline(o)).toEqual([{ x: ft(5), y: 0 }, { x: ft(8), y: ft(-3) }, { x: ft(12), y: ft(-3) }, { x: ft(15), y: 0 }])
    expect(bayOutline({ ...o, bay: { form: 'box', depth: ft(2) } })).toEqual([{ x: ft(5), y: 0 }, { x: ft(5), y: ft(-2) }, { x: ft(15), y: ft(-2) }, { x: ft(15), y: 0 }])
  })

  it('passes a bay into the clear and warns about narrow, deep, or blocked ones', () => {
    expect(bayChecks(est(nook))[0].status).toBe('pass')
    const narrow = { ...nook, openings: [{ ...nook.openings[0], width: ft(6) }] }
    expect(bayChecks(est(narrow))[0].detail).toMatch(/too narrow/)
    const deep = { ...nook, openings: [{ ...nook.openings[0], bay: { form: 'box' as const, depth: ft(6) } }] }
    expect(bayChecks(est(deep))[0].status).toBe('warn')
    // A porch room south of the bay is outdoors and does not block it; a mudroom does.
    const blocked: HouseModel = { ...nook, levels: [{ ...nook.levels[0], rooms: [...nook.levels[0].rooms, { id: 'mud', name: 'Mudroom', type: 'service', rect: { x: 0, y: ft(-8), w: ft(20), d: ft(6) } }] }] }
    expect(bayChecks(est(blocked))[0].detail).toMatch(/projects into Mudroom/)
  })

  it('draws the bay on the plan sheet', () => {
    const sheet = floorPlanSheet(est(nook), nook.levels[0], 'A-101', { revision: 1, date: '2026-11-09', projectName: 'Test' })
    expect(sheet.marks.filter(m => m.t === 'path' && m.d.split(' L ').length === 4).length).toBeGreaterThanOrEqual(1)
  })

  it('is set through the edit and the chat tool, windows only', () => {
    const op = toEditOp('setBay', { openingId: 'iw', form: 'box', depthFt: 2, seat: true })
    expect(op.ok).toBe(true)
    const r = applyOperations(est(nook), [op.ok ? op.op : (null as never)])
    expect(r.ok && r.estate.house.openings.find(o => o.id === 'iw')!.bay).toEqual({ form: 'box', depth: ft(2), seat: true })
    const off = toEditOp('setBay', { openingId: 'bw', form: null, depthFt: 0, seat: false })
    const r2 = applyOperations(est(nook), [off.ok ? off.op : (null as never)])
    expect(r2.ok && r2.estate.house.openings.find(o => o.id === 'bw')!.bay).toBeUndefined()
    expect(applyOperations(est(nook), [{ op: 'setBay', openingId: 'iw', bay: { form: 'box', depth: ft(8) } }]).ok).toBe(false)
  })
})
