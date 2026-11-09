import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import type { EditOp } from './edits'
import { toEditOp } from './editTools'
import { DEFAULT_FIRE_RULES, fireChecks, roadWidth } from './fireChecks'
import { ft } from './geometry'
import type { Estate } from './types'

const check = (e: Estate, id: string) => fireChecks(e).find(c => c.id === id)!
const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const rejected = (r: ReturnType<typeof applyOperations>) => { if (r.ok) throw new Error('expected a rejection'); return r.error }

describe('wildfire checks on the sample estate', () => {
  it('are all advisories that say so', () => {
    const checks = fireChecks(sampleEstate)
    expect(checks.map(c => c.id)).toEqual(['defensible-space', 'ignition', 'road-width', 'dead-ends', 'two-ways-out', 'hose-pull', 'fire-water'])
    expect(checks.every(c => c.status !== 'fail')).toBe(true)
    expect(checks.every(c => /Advisory planning values/.test(c.detail))).toBe(true)
  })

  it('pass where the layout already plans for fire', () => {
    for (const id of ['ignition', 'road-width', 'dead-ends', 'two-ways-out', 'fire-water']) expect(check(sampleEstate, id).status, id).toBe('pass')
  })

  it('flag the classroom in the training forest and the lodges at the forest edge', () => {
    const c = check(sampleEstate, 'defensible-space')
    expect(c.status).toBe('warn')
    expect(c.elements).toEqual(expect.arrayContaining(['classroom', 'lodge-1', 'lodge-3']))
    expect(c.elements).not.toContain('main-house')
  })

  it('flag buildings an engine cannot reach within a hose pull, including the main house', () => {
    const c = check(sampleEstate, 'hose-pull')
    expect(c.status).toBe('warn')
    expect(c.elements).toContain('main-house')
    expect(c.elements).not.toContain('hangars')
  })
})

describe('fire edits', () => {
  it('a fire lane brings the main house within a hose pull', () => {
    // A lane along the south of the courtyard, from the estate drive around the west wing.
    const lane: EditOp = { op: 'addRoad', road: { id: 'house-fire-lane', name: 'House fire lane', kind: 'estate', width: ft(20), turnaround: true,
      points: [{ x: ft(980), y: ft(5520) }, { x: ft(980), y: ft(5300) }, { x: ft(1270), y: ft(5300) }] } }
    const e = ok(applyOperations(sampleEstate, [lane]))
    expect(check(e, 'hose-pull').elements).not.toContain('main-house')
    expect(check(e, 'dead-ends').status).toBe('pass')
  })

  it('a narrow road and a missing turnaround are flagged', () => {
    const e = ok(applyOperations(sampleEstate, [
      { op: 'setRoadWidth', roadId: 'perimeter', width: ft(14) },
      { op: 'setTurnaround', roadId: 'lodging-street', turnaround: false },
    ]))
    expect(roadWidth(e.roads.find(r => r.id === 'perimeter')!)).toBe(ft(14))
    expect(check(e, 'road-width')).toMatchObject({ status: 'warn', elements: ['perimeter'] })
    expect(check(e, 'dead-ends')).toMatchObject({ status: 'warn', elements: ['lodging-street'] })
  })

  it('the perimeter road is a second way out; losing it and the gated link leaves one', () => {
    const noLink = ok(applyOperations(sampleEstate, [{ op: 'removeRoad', roadId: 'gated-link' }]))
    expect(check(noLink, 'two-ways-out').status).toBe('pass')
    const e = ok(applyOperations(noLink, [{ op: 'removeRoad', roadId: 'perimeter' }]))
    expect(check(e, 'two-ways-out')).toMatchObject({ status: 'warn' })
    expect(check(e, 'two-ways-out').detail).toMatch(/Only Estate gate can be reached/)
  })

  it('removing a cistern leaves buildings without water, and adding one restores it', () => {
    const dry = ok(applyOperations(sampleEstate, [{ op: 'removeWaterSource', sourceId: 'estate-cistern' }]))
    expect(check(dry, 'fire-water').elements).toContain('main-house')
    const wet = ok(applyOperations(dry, [{ op: 'addWaterSource', source: { id: 'new-cistern', name: 'New cistern', kind: 'cistern', at: { x: ft(1100), y: ft(5560) }, gallons: 40000 } }]))
    expect(check(wet, 'fire-water').elements ?? []).not.toContain('main-house')
  })

  it('weaker construction is flagged', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'setIgnition', buildingId: 'guest-house', ignition: { roofClass: 'C', emberVents: false, enclosedEaves: true, decks: 'combustible' } }]))
    const c = check(e, 'ignition')
    expect(c).toMatchObject({ status: 'warn', elements: ['guest-house'] })
    expect(c.detail).toMatch(/Guest house: class C roof, standard vents, combustible decks/)
  })

  it('the owner can replace a planning value', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'setFireRule', rule: 'maxHosePullFt', value: 400 }]))
    expect(e.fireRules?.maxHosePullFt).toBe(400)
    expect((check(e, 'hose-pull').elements ?? []).length).toBeLessThan(check(sampleEstate, 'hose-pull').elements!.length)
    expect(sampleEstate.fireRules).toBeUndefined()
    expect(DEFAULT_FIRE_RULES.maxHosePullFt).toBe(150)
  })

  it('rejects bad fire edits', () => {
    expect(rejected(applyOperations(sampleEstate, [{ op: 'setRoadWidth', roadId: 'nope', width: ft(20) }]))).toMatch(/No road/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'setRoadWidth', roadId: 'perimeter', width: ft(4) }]))).toMatch(/between 8 and 60/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'addRoad', road: { id: 'r', name: 'R', kind: 'estate', points: [{ x: 0, y: 0 }] } }]))).toMatch(/two points/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'addRoad', road: { id: 'perimeter', name: 'R', kind: 'estate', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] } }]))).toMatch(/already exists/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'addWaterSource', source: { id: 'w', name: 'W', kind: 'cistern', at: { x: -5, y: 0 }, gallons: 1000 } }]))).toMatch(/inside the parcel/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'setFireRule', rule: 'zone2Ft', value: 200 }]))).toMatch(/grow outward/)
    expect(rejected(applyOperations(sampleEstate, [{ op: 'setIgnition', buildingId: 'fuel', ignition: { roofClass: 'Z' as never, emberVents: true, enclosedEaves: true, decks: 'none' } }]))).toMatch(/Roof class/)
  })

  it('chat tools convert site feet to inches', () => {
    expect(toEditOp('addRoad', { id: 'lane', name: 'Lane', kind: 'estate', pointsFt: [10, 20, 30, 40], widthFt: 20, turnaround: true }))
      .toEqual({ ok: true, op: { op: 'addRoad', road: { id: 'lane', name: 'Lane', kind: 'estate', points: [{ x: 120, y: 240 }, { x: 360, y: 480 }], width: 240, turnaround: true } } })
    expect(toEditOp('addRoad', { id: 'lane', name: 'Lane', kind: 'estate', pointsFt: [10, 20, 30], widthFt: 20, turnaround: true }).ok).toBe(false)
    expect(toEditOp('setFireRule', { rule: 'minWaterGallons', value: 50000 })).toEqual({ ok: true, op: { op: 'setFireRule', rule: 'minWaterGallons', value: 50000 } })
  })
})

describe('older saved projects', () => {
  it('get the sample estate fire data when opened, so they do not show false fire warnings', async () => {
    const { loadProject } = await import('./history')
    const old = structuredClone(sampleEstate) as Estate
    delete old.waterSources
    old.roads = old.roads.map(({ turnaround: _t, ...r }) => r)
    old.buildings = old.buildings.map(({ ignition: _i, ...b }) => b)
    old.zones = old.zones.map(({ hardstand: _h, ...z }) => z)
    const loaded = loadProject({ format: 'house-project', version: 1, base: old, revisions: [], index: 0 })
    if (!loaded.ok) throw new Error(loaded.error)
    const e = loaded.timeline.states[0]
    expect(e.waterSources).toHaveLength(6)
    for (const id of ['dead-ends', 'fire-water', 'ignition']) expect(check(e, id).status, id).toBe('pass')
  })
})
