import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { validateEstate } from './validate'
import { houseByBuilding } from './houses'
import { CATALOG } from './furniture'
import { placeOpenings } from './walls'
import { buildingsInRequest, summarizeEstate } from './summary'

const h = (id: string) => houseByBuilding(sampleEstate, id)!
const rooms = (id: string) => h(id).levels.flatMap(l => l.rooms)
const kinds = (id: string, roomId?: string) => (h(id).furniture ?? []).filter(i => !roomId || i.roomId === roomId).map(i => i.kind)
const seats = (id: string, roomId: string) => (h(id).furniture ?? []).filter(i => i.roomId === roomId).reduce((s, i) => s + (CATALOG[i.kind].seats ?? 0), 0)

describe('lodges', () => {
  it('are all private rooms, each with its own bath, 22 beds in 18 rooms, some for couples', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const beds = rooms(`lodge-${n}`).filter(r => r.type === 'bedroom')
      expect(beds).toHaveLength(18)
      expect(new Set(beds.map(r => r.bathId)).size).toBe(18)
      const couples = beds.filter(r => /couple/i.test(r.name)).length
      expect(beds.length + couples).toBe(22)
      // Each bath opens only into its own room.
      const p = placeOpenings(h(`lodge-${n}`))
      for (const b of beds) expect(p.filter(o => o.kind !== 'window' && (o.roomId === b.bathId || o.leadsTo === b.bathId)).map(o => o.roomId === b.bathId ? o.leadsTo : o.roomId), b.id).toEqual([b.id])
    }
  })
})

describe('commons', () => {
  it('seats 150 for dinner beside a commercial kitchen, with laundry, lounge, fitness, and a store', () => {
    expect(seats('commons', 'cm-dining')).toBeGreaterThanOrEqual(150)
    expect(kinds('commons', 'cm-kitchen')).toEqual(expect.arrayContaining(['walk-in-cooler', 'counter-range', 'prep-table']))
    expect(kinds('commons', 'cm-laundry').filter(k => k === 'laundry-pair').length).toBeGreaterThanOrEqual(4)
    for (const id of ['cm-lounge', 'cm-fitness', 'cm-store']) expect(rooms('commons').map(r => r.id)).toContain(id)
  })
})

describe('cabins, classroom, hangars, pool house, fuel', () => {
  it('has six cabins that sleep four, with porches', () => {
    expect(rooms('cabins').filter(r => /living/.test(r.id))).toHaveLength(6)
    expect(rooms('cabins').filter(r => /porch/.test(r.id) && r.type === 'outdoor')).toHaveLength(6)
    expect(kinds('cabins').filter(k => k === 'queen-bed-set' || k === 'bunk-bed')).toHaveLength(12)
  })

  it('has three classrooms of 30, a lab, and a gear room', () => {
    for (const n of [1, 2, 3]) expect(seats('classroom', `cr-class-${n}`)).toBe(30)
    expect(rooms('classroom').map(r => r.id)).toEqual(expect.arrayContaining(['cr-lab', 'cr-gear']))
  })

  it('houses six helicopters and a plane, with maintenance and a ready room', () => {
    expect(kinds('hangars', 'hg-helo').filter(k => k === 'helicopter')).toHaveLength(6)
    expect(kinds('hangars', 'hg-plane')).toContain('airplane')
    for (const o of h('hangars').openings.filter(o => o.kind === 'garage-door')) expect(o.height, o.id).toBe(12 * 16)
  })

  it('has a pool house with changing rooms, a bar, and an outdoor kitchen on the pool deck', () => {
    expect(kinds('outdoor-pool', 'ph-deck')).toContain('pool-basin')
    expect(kinds('outdoor-pool', 'ph-loggia')).toEqual(expect.arrayContaining(['outdoor-kitchen', 'fireplace-outdoor']))
    expect(rooms('outdoor-pool').filter(r => /changing/i.test(r.name))).toHaveLength(2)
  })

  it('lays out the fuel island with 30 ft between the canopy, tanks, and building', () => {
    const r = (id: string) => rooms('fuel').find(x => x.id === id)!.rect
    expect(r('fu-tanks').x - (r('fu-canopy').x + r('fu-canopy').w)).toBeGreaterThanOrEqual(12 * 30)
    expect(r('fu-lube').y - (r('fu-canopy').y + r('fu-canopy').d)).toBeGreaterThanOrEqual(12 * 30)
    expect(kinds('fuel', 'fu-tanks').filter(k => k === 'fuel-tank')).toHaveLength(3)
  })

  it('all pass every check', () => {
    expect(validateEstate(sampleEstate).filter(c => c.status !== 'pass').map(c => c.id)).toEqual([])
  })
})

describe('the chat summary with many buildings', () => {
  it('gives full detail to the buildings a request names, or the main house, and rooms only to the rest', () => {
    expect([...buildingsInRequest(sampleEstate, 'Add a window to the commons dining hall')]).toEqual(['commons'])
    expect([...buildingsInRequest(sampleEstate, 'Make every lodge room bigger')]).toEqual(['lodge-1', 'lodge-2', 'lodge-3', 'lodge-4', 'lodge-5'])
    expect([...buildingsInRequest(sampleEstate, 'Widen the kitchen')]).toEqual(['main-house'])
    const text = summarizeEstate(sampleEstate, new Set(['commons']))
    expect(text).toMatch(/cm-entry: door/)
    expect(text).not.toMatch(/l1-door-w: door/)
    expect(text).toMatch(/Rooms only, to keep this short/)
  })
})
