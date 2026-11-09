import { describe, expect, it } from 'vitest'
import type { Estate, HouseModel } from './types'
import { sampleEstate } from './sampleEstate'
import { ft } from './geometry'
import { levelWalls, placeOpenings } from './walls'
import { houseBounds, houseFootprint } from './derive'
import { roofPolygons } from './roofs'
import { sideInHouse, toHouse, toWing } from './wings'
import { canStand } from '../ui/tour'
import { floorPlanSheet } from '../drawings/floorPlanSheet'
import { floorPlansDxf } from '../drawings/dxf'
import { applyOperations } from './edits'

/**
 * A 40 x 20 ft bar with a 30 x 20 ft wing running east from it, turned 20 degrees about the bar's northeast corner,
 * the inside of the turn, so the wing swings clear of the bar. A cased opening each side joins them.
 */
const bent: HouseModel = {
  buildingId: 'house', origin: { x: 0, y: 0 }, concept: true,
  wallThickness: { exterior: 8, interior: 5, foundation: 10 },
  wings: [{ id: 'east-wing', name: 'East wing', pivot: { x: ft(40), y: ft(20) }, angle: 20 }],
  levels: [{ id: 'main', name: 'Main floor', elevation: 0, floorHeight: ft(10), rooms: [
    { id: 'living', name: 'Living', type: 'living', rect: { x: 0, y: 0, w: ft(40), d: ft(20) } },
    { id: 'suite', name: 'Suite', type: 'bedroom', rect: { x: 0, y: ft(-20), w: ft(30), d: ft(20) }, wingId: 'east-wing' },
  ] }],
  openings: [
    { id: 'j1', kind: 'opening', roomId: 'living', side: 'e', offset: ft(14), width: ft(4), height: ft(7), sill: 0, through: 'suite' },
    { id: 'j2', kind: 'opening', roomId: 'suite', side: 'w', offset: ft(16), width: ft(4), height: ft(7), sill: 0, through: 'living' },
    { id: 'w1', kind: 'window', roomId: 'suite', side: 'e', offset: ft(10), width: ft(6), height: ft(5), sill: ft(2) },
  ],
  stairs: [],
  roofs: [
    { id: 'r1', name: 'Bar roof', rect: { x: 0, y: 0, w: ft(40), d: ft(20) }, levelId: 'main', form: 'gable', pitch: 6, ridge: 'ew', low: 's', overhang: 12 },
    { id: 'r2', name: 'Wing roof', rect: { x: 0, y: ft(-20), w: ft(30), d: ft(20) }, levelId: 'main', form: 'gable', pitch: 6, ridge: 'ew', low: 's', overhang: 12, wingId: 'east-wing' },
  ],
}
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01)

describe('wings', () => {
  it('turns points both ways about the pivot', () => {
    const p = { x: 123, y: -45 }
    near(toWing(bent, 'east-wing', toHouse(bent, 'east-wing', p)), p)
    near(toHouse(bent, 'east-wing', { x: 0, y: 0 }), { x: ft(40), y: ft(20) })
    const a = 20 * Math.PI / 180
    near(toHouse(bent, 'east-wing', { x: 0, y: ft(-20) }), { x: ft(40) + ft(20) * Math.sin(a), y: ft(20) - ft(20) * Math.cos(a) })
    expect(sideInHouse(bent, 'east-wing', 'e')).toBe('e')
    expect(sideInHouse({ ...bent, wings: [{ ...bent.wings![0], angle: 60 }] }, 'east-wing', 'e')).toBe('n')
  })

  it('keeps walls in their own frame, so the wing and the bar never share one', () => {
    const walls = levelWalls(bent, bent.levels[0])
    const wing = walls.filter(w => w.wingId === 'east-wing'), bar = walls.filter(w => !w.wingId)
    expect(wing).toHaveLength(4)
    expect(bar).toHaveLength(4)
    expect(walls.every(w => w.kind === 'exterior')).toBe(true)
    expect(new Set(walls.map(w => w.id)).size).toBe(walls.length)
  })

  it('leads joint openings to the room beyond, and windows outside', () => {
    const placed = placeOpenings(bent)
    expect(placed.find(o => o.id === 'j1')).toMatchObject({ leadsTo: 'suite' })
    expect(placed.find(o => o.id === 'j2')).toMatchObject({ leadsTo: 'living' })
    expect(placed.filter(o => o.problem).map(o => o.problem)).toEqual([])
    expect(placed.find(o => o.id === 'w1')!.wall!.wingId).toBe('east-wing')
    expect(placed.find(o => o.id === 'w1')!.leadsTo).toBe('outside')
  })

  it('counts the turned wing in the outline and roofs', () => {
    const b = houseBounds(bent)
    expect(b.x + b.w).toBeGreaterThan(ft(40) + ft(30) * Math.cos(20 * Math.PI / 180) - 1)
    expect(houseFootprint(bent).length).toBeGreaterThanOrEqual(2)
    const pts = roofPolygons(bent, bent.roofs[1]).flatMap(p => p.pts)
    expect(Math.max(...pts.map(p => p[1]))).toBeGreaterThan(ft(20) + ft(30) * Math.sin(20 * Math.PI / 180))
  })

  it('walks in the wing and stops at its walls', () => {
    const mid = toHouse(bent, 'east-wing', { x: ft(15), y: ft(-10) })
    expect(canStand(bent, 'main', mid.x, mid.y)).toBe(true)
    const onWall = toHouse(bent, 'east-wing', { x: ft(30), y: ft(-10) })
    expect(canStand(bent, 'main', onWall.x, onWall.y)).toBe(false)
  })

  it('draws the wing turned on the plan sheet and in the DXF', () => {
    const e: Estate = { ...sampleEstate, house: bent }
    const sheet = floorPlanSheet(e, bent.levels[0], 'A-101', { revision: 1, date: '2026-11-09', projectName: 'Test' })
    const turned = sheet.marks.filter(m => m.t === 'path' && /^M [\d.]+ [\d.]+ L/.test(m.d))
    expect(turned.length).toBeGreaterThanOrEqual(4)
    expect(sheet.marks.some(m => m.t === 'text' && m.text === 'SUITE')).toBe(true)
    const dxf = floorPlansDxf(e)
    expect(dxf).toContain('SUITE')
  })

  it('lets rooms in different frames overlap in plan coordinates without a clash', () => {
    const e: Estate = { ...sampleEstate, house: bent }
    const r = applyOperations(e, [{ op: 'addRoom', levelId: 'main', room: { id: 'closet', name: 'Closet', type: 'service', rect: { x: ft(2), y: ft(2), w: ft(6), d: ft(6) }, wingId: 'east-wing' } }])
    expect(r.ok, JSON.stringify(r).slice(0, 400)).toBe(true)
    const bad = applyOperations(e, [{ op: 'addRoom', levelId: 'main', room: { id: 'closet', name: 'Closet', type: 'service', rect: { x: 0, y: 0, w: ft(6), d: ft(6) }, wingId: 'nope' } }])
    expect(bad.ok).toBe(false)
  })
})

describe('rooms across a joint', () => {
  it('flags a wing room that really covers a room in the bar, but not the small wedge at the joint', async () => {
    const { validateEstate } = await import('./validate')
    const e: Estate = { ...sampleEstate, house: bent }
    const roomsCheck = (x: Estate) => validateEstate(x).find(c => c.id === 'house-rooms')!
    expect(roomsCheck(e).status).toBe('pass')
    const inside: HouseModel = { ...bent, levels: [{ ...bent.levels[0], rooms: [...bent.levels[0].rooms, { id: 'den', name: 'Den', type: 'living', rect: { x: ft(-14), y: ft(-14), w: ft(10), d: ft(10) }, wingId: 'east-wing' }] }] }
    expect(roomsCheck({ ...e, house: inside }).status).toBe('fail')
  })
})
