import { describe, expect, it } from 'vitest'
import { sampleEstate } from '../model/sampleEstate'
import { applyOperations } from '../model/edits'
import { ft } from '../model/geometry'
import { gradeAt, project, elevationMarks } from './elevations'
import { drawingSet } from './drawingSet'
import type { Mark } from './sheet'

const info = { revision: 0, date: '2026-11-09', projectName: 'House Project' }
const texts = (marks: Mark[]) => marks.flatMap(m => m.t === 'text' ? [m.text] : [])

describe('elevation projection', () => {
  it('puts the viewer’s left on the left for each side', () => {
    expect(project('south', [10, 20, 5])).toEqual({ h: 10, z: 5, depth: 20 })
    expect(project('north', [10, 20, 5])).toEqual({ h: -10, z: 5, depth: -20 })
    expect(project('east', [10, 20, 5])).toEqual({ h: 20, z: 5, depth: -10 })
    expect(project('west', [10, 20, 5])).toEqual({ h: -20, z: 5, depth: 10 })
  })
})

describe('assumed grade', () => {
  const h = sampleEstate.house
  it('is at the main floor north of the bar, at the walkout in the courtyard, and slopes beside the wings', () => {
    expect(gradeAt(h, ft(100), ft(100))).toBe(0)
    expect(gradeAt(h, ft(100), ft(30))).toBe(ft(-11))
    expect(gradeAt(h, ft(-10), ft(0))).toBeCloseTo(ft(-11))
    expect(gradeAt(h, ft(-10), ft(32))).toBeCloseTo(ft(-5.5))
  })
})

describe('elevation sheets', () => {
  const set = drawingSet(sampleEstate, info)
  const ns = set.find(s => s.number === 'A-201')!, ew = set.find(s => s.number === 'A-202')!, roofPlan = set.find(s => s.number === 'A-301')!

  it('title each view and mark floor and ridge heights', () => {
    const t = texts(ns.marks)
    expect(t).toContain('NORTH ELEVATION')
    expect(t).toContain('SOUTH ELEVATION')
    expect(t).toContain(`MAIN FLOOR 0'-0"`)
    expect(t).toContain(`WALKOUT LEVEL -11'-0"`)
    expect(t).toContain(`TOP OF HIGHEST RIDGE 35'-8"`)
    expect(texts(ew.marks)).toEqual(expect.arrayContaining(['EAST ELEVATION', 'WEST ELEVATION']))
  })

  it('keeps the drawing clear of the title block', () => {
    const titleLeft = 36 * 72 - 18 - 3.5 * 72
    for (const s of [ns, ew, roofPlan]) for (const m of s.marks) {
      if (m.t === 'text' && m.x > titleLeft) continue
      if (m.t === 'line' && m.x1 >= titleLeft && m.x2 >= titleLeft) continue
      const xs = m.t === 'line' ? [m.x1, m.x2] : m.t === 'text' ? [m.x] : []
      for (const x of xs) expect(x, `${s.number}: ${JSON.stringify(m).slice(0, 80)}`).toBeLessThan(titleLeft)
    }
  })

  it('draws more roof when a wing gets a hip roof, since its ends slope too', () => {
    const r = applyOperations(sampleEstate, [{ op: 'setRoof', roofId: 'roof-west', form: 'hip', pitch: 8, ridge: 'ns', low: 's', overhang: ft(2) }])
    if (!r.ok) throw new Error(r.error)
    const count = (e: typeof sampleEstate) => elevationMarks(e, 'south', 0, 0).marks.filter(m => m.t === 'path' && m.fill === '#d9d9d9').length
    expect(count(r.estate)).toBeGreaterThan(count(sampleEstate))
  })

  it('labels pitch on the roof plan', () => {
    expect(texts(roofPlan.marks).filter(t => t === '8:12').length).toBe(8)
    expect(texts(roofPlan.marks)).toContain('ROOF PLAN')
  })
})
