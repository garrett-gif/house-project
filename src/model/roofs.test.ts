import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import type { EditOp } from './edits'
import { toEditOp } from './editTools'
import { validateEstate } from './validate'
import { firstPassRoofs, houseHeight, ridgeHeight, roofPolygons } from './roofs'
import { ft } from './geometry'
import type { Estate } from './types'

const house = sampleEstate.house
const roof = (e: Estate, id: string) => e.house.roofs.find(r => r.id === id)!
const check = (e: Estate, id: string) => validateEstate(e).find(c => c.id === id)!
const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const rejected = (r: ReturnType<typeof applyOperations>) => { if (r.ok) throw new Error('expected a rejection'); return r.error }

describe('roofs', () => {
  it('puts 8:12 gables on the bar, wings, and garage at the expected heights', () => {
    expect(house.roofs.map(r => [r.id, r.form, r.pitch, r.ridge])).toEqual([
      ['roof-bar', 'gable', 8, 'ew'], ['roof-west', 'gable', 8, 'ns'], ['roof-east', 'gable', 8, 'ns'], ['roof-garage', 'gable', 8, 'ew'],
    ])
    // Bar: eave at 21 ft on the kids floor; half of a 44 ft span at 8:12 rises 14 ft 8 in.
    expect(ridgeHeight(house, roof(sampleEstate, 'roof-bar'))).toBeCloseTo(ft(21) + ft(22) * 8 / 12)
    expect(ridgeHeight(house, roof(sampleEstate, 'roof-west'))).toBeCloseTo(ft(11) + ft(23) * 8 / 12)
    expect(houseHeight(house)).toBeCloseTo(ridgeHeight(house, roof(sampleEstate, 'roof-bar')))
    expect(sampleEstate.buildings.find(b => b.id === 'main-house')!.height).toBe(Math.round(houseHeight(house)))
  })

  it('builds two planes and two gable walls for a gable, four planes for a hip, one plane and three walls for a shed', () => {
    const r = roof(sampleEstate, 'roof-west')
    const kinds = (form: 'gable' | 'hip' | 'shed') => roofPolygons(house, { ...r, form }).map(p => p.kind).sort()
    expect(kinds('gable')).toEqual(['gable', 'gable', 'roof', 'roof'])
    expect(kinds('hip')).toEqual(['roof', 'roof', 'roof', 'roof'])
    expect(kinds('shed')).toEqual(['gable', 'gable', 'gable', 'roof'])
  })

  it('passes the roof checks as laid out', () => {
    for (const id of ['roof-coverage', 'roof-support', 'roof-pitch']) expect(check(sampleEstate, id).status, id).toBe('pass')
  })

  it('fails coverage when a roof is missing', () => {
    const e = structuredClone(sampleEstate)
    e.house.roofs = e.house.roofs.filter(r => r.id !== 'roof-garage')
    expect(check(e, 'roof-coverage')).toMatchObject({ status: 'fail', elements: ['garage'] })
  })

  it('first pass roofs cover a house saved without them', () => {
    const e = structuredClone(sampleEstate)
    e.house.roofs = firstPassRoofs(e.house)
    expect(e.house.roofs.length).toBeGreaterThan(0)
    expect(check(e, 'roof-coverage').status).toBe('pass')
  })
})

describe('setRoof', () => {
  const hip: EditOp = { op: 'setRoof', roofId: 'roof-west', form: 'hip', pitch: 6, ridge: 'ns', low: 's', overhang: ft(3) }

  it('reshapes a roof without changing the estate it was given', () => {
    const before = JSON.stringify(sampleEstate)
    const e = ok(applyOperations(sampleEstate, [hip]))
    expect(JSON.stringify(sampleEstate)).toBe(before)
    expect(roof(e, 'roof-west')).toMatchObject({ form: 'hip', pitch: 6, overhang: ft(3) })
    expect(ridgeHeight(e.house, roof(e, 'roof-west'))).toBeLessThan(ridgeHeight(house, roof(sampleEstate, 'roof-west')))
  })

  it('rejects unknown roofs and bad values', () => {
    expect(rejected(applyOperations(sampleEstate, [{ ...hip, roofId: 'nope' } as EditOp]))).toMatch(/No roof with id "nope"/)
    expect(rejected(applyOperations(sampleEstate, [{ ...hip, form: 'dome' } as never]))).toMatch(/Roof form/)
    expect(rejected(applyOperations(sampleEstate, [{ ...hip, pitch: 40 } as EditOp]))).toMatch(/Pitch/)
    expect(rejected(applyOperations(sampleEstate, [{ ...hip, overhang: ft(10) } as EditOp]))).toMatch(/Overhang/)
    expect(rejected(applyOperations(sampleEstate, [{ ...hip, ridge: 'up' } as never]))).toMatch(/Ridge/)
  })

  it('warns about a very low pitch', () => {
    const e = ok(applyOperations(sampleEstate, [{ ...hip, pitch: 2 } as EditOp]))
    expect(check(e, 'roof-pitch')).toMatchObject({ status: 'warn', elements: ['roof-west'] })
  })

  it('converts the chat tool, overhang in feet', () => {
    expect(toEditOp('setRoof', { roofId: 'roof-bar', form: 'shed', pitch: 4, ridge: 'ew', low: 'n', overhangFt: 1.5 }))
      .toEqual({ ok: true, op: { op: 'setRoof', roofId: 'roof-bar', form: 'shed', pitch: 4, ridge: 'ew', low: 'n', overhang: 18 } })
  })
})
