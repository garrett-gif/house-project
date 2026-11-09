import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import { validateEstate } from './validate'
import { allHouses, focusHouse, houseByBuilding } from './houses'
import { occupancy } from './utilities'
import { withGuestHouseDefaults } from './migrate'
import { summarizeEstate } from './summary'
import { drawingSet } from '../drawings/drawingSet'
import { ft } from './geometry'
import type { Estate } from './types'

const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const guest = (e: Estate) => houseByBuilding(e, 'guest-house')!
const room = (e: Estate, id: string) => allHouses(e).flatMap(h => h.levels.flatMap(l => l.rooms)).find(r => r.id === id)
const check = (e: Estate, id: string) => validateEstate(e).find(c => c.id === id)!

describe('the guest house', () => {
  it('is a detailed building whose outline comes from its rooms', () => {
    const b = sampleEstate.buildings.find(x => x.id === 'guest-house')!
    expect(b.rect).toEqual({ x: ft(600), y: ft(4860), w: ft(74), d: ft(38) })
    expect(b.height).toBeGreaterThan(ft(20))
  })

  it('sleeps a gathering: four suites and a bunk room, each with a bath', () => {
    const rooms = guest(sampleEstate).levels.flatMap(l => l.rooms)
    const bedrooms = rooms.filter(r => r.type === 'bedroom')
    expect(bedrooms).toHaveLength(5)
    for (const r of bedrooms) expect(rooms.find(o => o.id === r.bathId)?.type, r.id).toBe('bath')
    const area = rooms.filter(r => r.type !== 'outdoor').reduce((s, r) => s + r.rect.w * r.rect.d, 0) / 144
    expect(area).toBeGreaterThan(4000)
    expect(area).toBeLessThan(5000)
    expect(occupancy(sampleEstate, sampleEstate.buildings.find(x => x.id === 'guest-house')!).beds).toBe(14)
  })

  it('has its front door on the foyer and passes the house checks', () => {
    for (const id of ['openings-fit', 'reachable', 'egress-door', 'escape-windows', 'program', 'roof-coverage', 'stairs', 'baths', 'house-rooms']) {
      expect(check(sampleEstate, id).status, `${id}: ${check(sampleEstate, id).detail}`).toBe('pass')
    }
    expect(check(sampleEstate, 'egress-door').detail).toMatch(/Guest house: g-front-door/)
  })
})

describe('edits inside the guest house', () => {
  it('resize its rooms without touching the main house', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'g-pantry', side: 'n', distance: ft(2) }]))
    expect(room(e, 'g-pantry')!.rect.d).toBe(ft(12))
    expect(e.house).toEqual(sampleEstate.house)
  })

  it('add a room to the guest house by its level id', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'addRoom', levelId: 'g-main', room: { id: 'g-porch', name: 'North porch', type: 'outdoor', rect: { x: ft(20), y: ft(38), w: ft(24), d: ft(8) } } }]))
    expect(guest(e).levels[0].rooms.some(r => r.id === 'g-porch')).toBe(true)
    expect(e.house.levels.flatMap(l => l.rooms).some(r => r.id === 'g-porch')).toBe(false)
  })

  it('keep room and opening ids unique across both houses', () => {
    expect(applyOperations(sampleEstate, [{ op: 'addRoom', levelId: 'g-main', room: { id: 'kitchen', name: 'Second kitchen', type: 'living', rect: { x: ft(20), y: ft(38), w: ft(10), d: ft(10) } } }]))
      .toMatchObject({ ok: false, error: 'A room with id "kitchen" already exists.' })
  })

  it('move the whole guest house with its building', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveBuilding', buildingId: 'guest-house', dx: ft(-20), dy: 0 }]))
    expect(guest(e).origin.x).toBe(ft(580))
    expect(e.buildings.find(b => b.id === 'guest-house')!.rect.x).toBe(ft(580))
    expect(applyOperations(sampleEstate, [{ op: 'resizeBuilding', buildingId: 'guest-house', w: ft(10), d: ft(10), anchor: 'sw' }])).toMatchObject({ ok: false })
  })

  it('reshape its roof and flag its rooms by name in merged checks', () => {
    expect(ok(applyOperations(sampleEstate, [{ op: 'setRoof', roofId: 'g-roof', form: 'hip', pitch: 6, ridge: 'ew', low: 's', overhang: ft(2) }])).houses![0].roofs[0].form).toBe('hip')
    const e = ok(applyOperations(sampleEstate, [{ op: 'removeOpening', openingId: 'g-bed-4-door-1' }]))
    const c = check(e, 'reachable')
    expect(c.status).toBe('fail')
    expect(c.elements).toContain('g-bed-4')
    expect(c.detail).toMatch(/^Guest house: /)
  })
})

describe('focusing on a house', () => {
  it('swaps it into the house slot and keeps the main house in the list', () => {
    const f = focusHouse(sampleEstate, 'guest-house')
    expect(f.house.buildingId).toBe('guest-house')
    expect(f.houses!.map(h => h.buildingId)).toEqual(['main-house'])
    expect(focusHouse(sampleEstate, 'main-house')).toBe(sampleEstate)
  })

  it('draws a set for the guest house', () => {
    const set = drawingSet(focusHouse(sampleEstate, 'guest-house'), { revision: 0, date: '2026-11-09', projectName: 'House Project' })
    expect(set.map(s => s.number)).toEqual(['G-001', 'AS-101', 'A-101', 'A-102', 'A-201', 'A-202', 'A-301', 'A-401', 'A-601'])
    const texts = set.flatMap(s => s.marks.flatMap(m => m.t === 'text' ? [m.text] : []))
    expect(texts).toContain('GUEST HOUSE')
    expect(texts).toContain('SITE AND GUEST HOUSE · DRAFT DRAWING SET')
  })
})

describe('older saves', () => {
  it('get the guest house layout where the old box stood', () => {
    const old = structuredClone(sampleEstate)
    delete old.houses
    old.buildings = old.buildings.map(b => b.id === 'guest-house' ? { id: b.id, name: b.name, use: b.use, access: b.access, height: ft(24), rect: { x: ft(605), y: ft(4857), w: ft(70), d: ft(45) }, beds: 4 } : b)
    const e = withGuestHouseDefaults(old)
    expect(guest(e).origin).toEqual({ x: ft(605), y: ft(4857) })
    expect(e.buildings.find(b => b.id === 'guest-house')!.beds).toBe(14)
    expect(withGuestHouseDefaults(sampleEstate)).toBe(sampleEstate)
  })
})

describe('the chat summary', () => {
  it('lists the guest house rooms with their levels', () => {
    const text = summarizeEstate(sampleEstate)
    expect(text).toMatch(/Guest house \(building guest-house\)\. Concept layout\. Its house origin is at site 600,4860\./)
    expect(text).toMatch(/Level g-upper: Upper floor/)
    expect(text).toMatch(/- g-bunk: Bunk room, sleeps six, bedroom/)
  })
})
