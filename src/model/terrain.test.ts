import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import { toEditOp } from './editTools'
import { validateEstate } from './validate'
import { contours, earthwork, groundAt, houseDatum, roadGrade, terrainOf } from './terrain'
import { withExcavationDefault } from './migrate'
import { Terrain } from './parcel'
import { summarizeEstate } from './summary'
import { drawingSet } from '../drawings/drawingSet'
import { ft, toFt } from './geometry'
import type { Estate } from './types'

const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const check = (e: Estate, id: string) => validateEstate(e).find(c => c.id === id)!

describe('terrain', () => {
  it('reads the same land as the parcel generator, cached per parcel', () => {
    const p = { x: ft(1234), y: ft(4321) }
    expect(groundAt(sampleEstate, p)).toBe(new Terrain(sampleEstate.parcel).at(p.x, p.y))
    expect(terrainOf(structuredClone(sampleEstate))).toBe(terrainOf(sampleEstate))
  })

  it('traces contours that lie on their elevation', () => {
    const lines = contours(sampleEstate, 10)
    expect(lines.length).toBeGreaterThan(20)
    expect(lines.filter(c => c.major).every(c => c.level % 50 === 0)).toBe(true)
    for (const c of lines.filter((_, i) => i % 7 === 0)) for (const [a] of c.segs.slice(0, 20)) {
      expect(Math.abs(toFt(groundAt(sampleEstate, a)) - c.level)).toBeLessThan(1.5)
    }
  })

  it('measures road grades', () => {
    const drive = sampleEstate.roads.find(r => r.id === 'estate-drive')!
    expect(roadGrade(sampleEstate, drive).pct).toBeGreaterThan(1)
    expect(roadGrade(sampleEstate, drive).pct).toBeLessThan(10)
    // The perimeter road's 10.2% stretch is within the 12% the owner allows for it, but not the 10% for other roads.
    expect(check(sampleEstate, 'road-grade').status).toBe('pass')
    const strict = ok(applyOperations(sampleEstate, [{ op: 'setUtilityRule', rule: 'maxPerimeterGradePct', value: 10 }]))
    expect(check(strict, 'road-grade')).toMatchObject({ status: 'warn', elements: ['perimeter'] })
  })
})

describe('terrain checks', () => {
  it('accept the main house walkout because its site is excavated, and estimate the earthwork', () => {
    const c = check(sampleEstate, 'walkout-grade')
    expect(c.status).toBe('pass')
    expect(c.detail).toMatch(/Main house: excavated by design, about 11 ft of cut along the south face with retaining walls, roughly [\d,]+ cubic yards of cut/)
    const w = earthwork(sampleEstate, sampleEstate.house)
    // At least the walkout level dug out: about 9,500 sq ft, 11 ft deep, over 27 cubic feet per yard.
    expect(w.cutCy).toBeGreaterThan(9000 * 11 / 27 * 0.8)
  })

  it('find that the walkout faces the wrong way on this land without the excavation', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'setExcavated', buildingId: 'main-house', excavated: false }]))
    const c = check(e, 'walkout-grade')
    expect(c).toMatchObject({ status: 'warn', elements: ['main-house'] })
    expect(c.detail).toMatch(/about 11 ft of cut along the south face\. The land falls most toward the east, 5\.7 ft/)
  })

  it('show how much cut an east-facing walkout would need instead', () => {
    const e = structuredClone(sampleEstate)
    e.house.levels.find(l => l.id === 'walkout')!.exposed = ['e']
    e.house.excavated = false
    expect(check(e, 'walkout-grade').detail).toMatch(/falls 5\.7 ft toward the east side, .* about 5\.3 ft of cut along the east face/)
  })

  it('pass building sites on gentle ground, and flag them under a stricter rule', () => {
    expect(check(sampleEstate, 'building-slope').status).toBe('pass')
    const e = ok(applyOperations(sampleEstate, [{ op: 'setUtilityRule', rule: 'maxBuildingSlopePct', value: 2 }]))
    expect(check(e, 'building-slope').elements).toContain('main-house')
  })

  it('want sewage to drain downhill unless the system is pumped', () => {
    expect(check(sampleEstate, 'septic-gravity').status).toBe('pass')
    const lodging = sampleEstate.utilities!.find(u => u.id === 'lodging-septic')!
    const e = ok(applyOperations(sampleEstate, [{ op: 'setUtility', utilityId: 'lodging-septic', capacity: lodging.capacity, serves: lodging.serves, pumped: false }]))
    expect(check(e, 'septic-gravity').elements).toEqual(expect.arrayContaining(['lodging-septic', 'lodge-4']))
    // The estate drainfield where it used to be, west of the house, is uphill of the walkout.
    const west = ok(applyOperations(sampleEstate, [{ op: 'moveUtility', utilityId: 'estate-septic', dx: ft(-1000), dy: ft(250) }]))
    expect(check(west, 'septic-gravity').detail).toMatch(/Estate septic and drainfield is [\d.]+ ft above the lowest floor of Main house/)
  })

  it('keep wells above nearby drainfields', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'setUtilityRule', rule: 'wellUpgradientFt', value: 3000 }]))
    expect(check(e, 'drainfield-ground').status).toBe('warn')
  })

  it('name the buildings with a drainage swale', () => {
    expect(check(sampleEstate, 'site-drainage').status).toBe('pass')
    const e = ok(applyOperations(sampleEstate, [{ op: 'setSwale', buildingId: 'fuel', swale: true }]))
    expect(check(e, 'site-drainage').detail).toMatch(/swale carries runoff around Fuel island and storage/)
    expect(toEditOp('setSwale', { buildingId: 'car-building', swale: true })).toEqual({ ok: true, op: { op: 'setSwale', buildingId: 'car-building', swale: true } })
  })
})

describe('the excavation choice', () => {
  it('carries into projects saved before it, but not over an explicit no', () => {
    const old = structuredClone(sampleEstate)
    delete old.house.excavated
    expect(withExcavationDefault(old).house.excavated).toBe(true)
    const no = structuredClone(sampleEstate)
    no.house.excavated = false
    expect(withExcavationDefault(no).house.excavated).toBe(false)
    expect(toEditOp('setExcavated', { buildingId: 'main-house', excavated: true })).toEqual({ ok: true, op: { op: 'setExcavated', buildingId: 'main-house', excavated: true } })
  })
})

describe('terrain in the drawings and the chat summary', () => {
  const info = { revision: 0, date: '2026-11-09', projectName: 'House Project' }
  const texts = (number: string) => drawingSet(sampleEstate, info).find(s => s.number === number)!.marks.flatMap(m => m.t === 'text' ? [m.text] : [])

  it('draws existing grade on elevations and sections, and contours on the site plan', () => {
    expect(texts('A-201')).toContain('EXISTING GRADE, SAMPLE TERRAIN')
    expect(texts('A-401')).toContain('EXISTING GRADE, SAMPLE TERRAIN')
    expect(texts('AS-101').some(t => /^3[5-9]\d0$/.test(t))).toBe(true)
  })

  it('sets the main floor at the ground in the middle of the house', () => {
    expect(toFt(houseDatum(sampleEstate, sampleEstate.house))).toBeGreaterThan(3700)
  })

  it('tells Claude the ground under each building and how steep each road is', () => {
    const text = summarizeEstate(sampleEstate)
    expect(text).toMatch(/- main-house: Main house, .* ground \d{4}(\.\d)? ft above sea level sloping [\d.]+%/)
    expect(text).toMatch(/- perimeter: Perimeter road, .* steepest 10\.2%/)
    expect(text).toMatch(/lodging-septic: .* pumped/)
    expect(text).toMatch(/Its site is excavated to the walkout by design, about [\d]+ cubic yards of cut\./)
  })
})
