import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import { toEditOp } from './editTools'
import { validateEstate } from './validate'
import { beamBearing, beamMarks, beamSize, beamsAbove, firstPassBeams, longestSpan, materialFor } from './beams'
import { houseByBuilding } from './houses'
import { withHouseDefaults } from './firstPass'
import { summarizeEstate } from './summary'
import { drawingSet } from '../drawings/drawingSet'
import { ft } from './geometry'
import type { Beam, Estate } from './types'

const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const check = (e: Estate, id: string) => validateEstate(e).find(c => c.id === id)!
const beams = (e: Estate) => e.house.beams ?? []
const beam = (e: Estate, id: string) => beams(e).find(b => b.id === id)!
const b = (o: Partial<Beam>): Beam => ({ id: 'x', levelId: 'main', orientation: 'h', at: 0, from: 0, to: ft(20), material: 'lvl', ...o })

describe('the first pass of beams', () => {
  it('carries every inside wall that stands over open floor, so the stacking check passes in both houses', () => {
    expect(beams(sampleEstate).length).toBeGreaterThan(10)
    expect(houseByBuilding(sampleEstate, 'guest-house')!.beams!.length).toBe(4)
    expect(check(sampleEstate, 'stack-interior').status).toBe('pass')
    expect(check(sampleEstate, 'beam-bearing').status).toBe('pass')
  })

  it('ends every beam on walls below and breaks it where it crosses one', () => {
    for (const bm of beams(sampleEstate)) {
      const br = beamBearing(sampleEstate.house, bm)
      expect(br.start && br.end, bm.id).toBe(true)
    }
  })

  it('puts a post under long beams over rooms that can take one, and keeps every span within 32 ft', () => {
    const posted = beams(sampleEstate).filter(bm => bm.posts?.length)
    expect(posted.length).toBeGreaterThan(0)
    for (const bm of posted) expect(longestSpan(bm)).toBeLessThan(bm.to - bm.from)
    expect(Math.max(...beams(sampleEstate).map(longestSpan))).toBeLessThanOrEqual(ft(32))
    expect(check(sampleEstate, 'beam-span').status).toBe('pass')
  })

  it('flags spans longer than the rule allows', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'setUtilityRule', rule: 'maxBeamSpanFt', value: 20 }]))
    const c = check(e, 'beam-span')
    expect(c.status).toBe('warn')
    expect(c.detail).toMatch(/Main house: beam-[\w-]+: [\d.]+ ft over /)
  })
})

describe('beam sizes', () => {
  it('pick a material and a planning size from the span', () => {
    expect(materialFor(ft(14))).toBe('lvl')
    expect(materialFor(ft(24))).toBe('glulam')
    expect(materialFor(ft(40))).toBe('steel')
    expect(beamSize(b({ to: ft(14) }))).toBe('3-1/2" x 9-1/4" LVL')
    expect(beamSize(b({ to: ft(24), material: 'glulam' }))).toBe('5-1/8" x 15" glulam')
    expect(beamSize(b({ to: ft(46), material: 'steel' }))).toBe('W24 steel')
    expect(beamSize(b({ to: ft(46), material: 'steel', posts: [ft(23)] }))).toBe('W12 steel')
  })
})

describe('beam edits', () => {
  // The longest beam without a post.
  const longest = [...beams(sampleEstate)].filter(bm => !bm.posts).sort((a, b) => (b.to - b.from) - (a.to - a.from))[0]
  const pool = longest.id

  it('a post shortens a span and clears its warning', () => {
    const tight = ok(applyOperations(sampleEstate, [{ op: 'setUtilityRule', rule: 'maxBeamSpanFt', value: 20 }]))
    expect(check(tight, 'beam-span').elements).toContain(pool)
    const mid = (longest.from + longest.to) / 2
    const e = ok(applyOperations(tight, [{ op: 'setBeam', beamId: pool, material: 'glulam', posts: [mid] }]))
    expect(longestSpan(beam(e, pool))).toBe((longest.to - longest.from) / 2)
    expect(check(e, 'beam-span').elements ?? []).not.toContain(pool)
    expect(applyOperations(sampleEstate, [{ op: 'setBeam', beamId: pool, material: 'steel', posts: [longest.to + ft(10)] }])).toMatchObject({ ok: false })
  })

  it('removing a beam brings back the stacking warning; fitting beams again clears it', () => {
    const gone = ok(applyOperations(sampleEstate, [{ op: 'removeBeam', beamId: pool }]))
    expect(check(gone, 'stack-interior').status).toBe('warn')
    const back = ok(applyOperations(gone, [{ op: 'fitBeams', buildingId: 'main-house' }]))
    expect(check(back, 'stack-interior').status).toBe('pass')
    expect(beams(back).length).toBe(beams(sampleEstate).length)
  })

  it('add a beam that needs a post, and route guest house beams to the guest house', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'addBeam', beam: { id: 'beam-x', levelId: 'main', orientation: 'h', at: ft(50), from: ft(97), to: ft(120), material: 'glulam' } }]))
    expect(check(e, 'beam-bearing')).toMatchObject({ status: 'warn', elements: ['beam-x'] })
    const g = ok(applyOperations(sampleEstate, [{ op: 'setBeam', beamId: 'beam-g-upper-3', material: 'steel', posts: [] }]))
    expect(houseByBuilding(g, 'guest-house')!.beams!.find(x => x.id === 'beam-g-upper-3')!.material).toBe('steel')
  })

  it('convert from the chat tools in feet', () => {
    expect(toEditOp('setBeam', { beamId: 'beam-x', material: 'steel', postsFt: [32] })).toEqual({ ok: true, op: { op: 'setBeam', beamId: 'beam-x', material: 'steel', posts: [ft(32)] } })
    expect(toEditOp('fitBeams', { buildingId: 'main-house' })).toEqual({ ok: true, op: { op: 'fitBeams', buildingId: 'main-house' } })
  })
})

describe('beams in drawings, views, and saves', () => {
  it('show on the plan below as "above", and in the A-602 schedule', () => {
    const set = drawingSet(sampleEstate, { revision: 0, date: '2026-11-09', projectName: 'House Project' })
    const texts = (n: string) => set.find(s => s.number === n)!.marks.flatMap(m => m.t === 'text' ? [m.text] : [])
    const walkoutPlan = texts('A-101')
    // Only the mark goes on the plan; sizes live on the schedule.
    expect(walkoutPlan.some(t => /^BM\d+$/.test(t))).toBe(true)
    const schedule = texts('A-602')
    expect(schedule).toContain('BEAM SCHEDULE')
    expect(schedule.filter(t => /^BM\d+$/.test(t)).length).toBe(beams(sampleEstate).length)
    expect(schedule.some(t => /(LVL|glulam|steel)$/.test(t))).toBe(true)
    expect(beamMarks(sampleEstate.house).get(beams(sampleEstate)[0].id)).toBe('BM1')
    expect(beamsAbove(sampleEstate.house, 'walkout').every(bm => bm.levelId === 'main')).toBe(true)
  })

  it('are given to older saves that have none', () => {
    const { beams: _drop, ...house } = sampleEstate.house
    expect(withHouseDefaults(house).beams).toEqual(firstPassBeams(sampleEstate.house))
  })

  it('are listed for Claude', () => {
    expect(summarizeEstate(sampleEstate)).toMatch(/Beams \(id: .*beam-main-1: main, (east-west at y|north-south at x) [\d.]+, [\d.]+ to [\d.]+, (lvl|glulam|steel)/)
  })
})
