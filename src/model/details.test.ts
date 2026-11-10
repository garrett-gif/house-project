import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { allHouses } from './houses'
import { fixtureSymbols } from '../drawings/fixtures'

/** Every room in every building, with the kinds of pieces in it. */
const everyRoom = allHouses(sampleEstate).flatMap(h => h.levels.flatMap(l => l.rooms).map(r => ({
  where: `${h.buildingId}/${r.id}`, r, kinds: (h.furniture ?? []).filter(i => i.roomId === r.id).map(i => i.kind),
})))

describe('fixtures and cabinetry in every building', () => {
  it('gives every bath a toilet and a sink, and a shower or tub unless it is a powder room or restroom', () => {
    for (const { where, r, kinds } of everyRoom.filter(x => x.r.type === 'bath')) {
      const k = kinds.join(' ')
      expect(/toilet|bath-set/.test(k), `${where} toilet`).toBe(true)
      expect(/vanity|sink|lav-counter|bath-set/.test(k), `${where} sink`).toBe(true)
      if (!/powder|restroom/i.test(r.name) || /shower/i.test(r.name)) expect(/shower|tub|bath-set/.test(k), `${where} shower`).toBe(true)
    }
  })

  it('gives every bedroom a bed, every closet rods, and every kitchen counters', () => {
    for (const { where, kinds } of everyRoom.filter(x => x.r.type === 'bedroom')) expect(kinds.some(k => /bed|bunk/.test(k)), where).toBe(true)
    for (const { where, kinds } of everyRoom.filter(x => /closet/i.test(x.r.name))) expect(kinds.some(k => /closet-rods/.test(k)), where).toBe(true)
    for (const { where, kinds } of everyRoom.filter(x => /kitchen|scullery/i.test(x.r.name) && x.r.type !== 'outdoor' && !/hall/i.test(x.r.name))) {
      expect(kinds.some(k => /counter|kitchenette|walk-in/.test(k)), where).toBe(true)
    }
  })

  it('leaves no room empty but halls, stairs, and elevators', () => {
    const empty = everyRoom.filter(x => x.r.type !== 'outdoor' && x.r.type !== 'circulation' && !/elevator|stair/i.test(x.r.name) && x.kinds.length === 0)
    expect(empty.map(x => x.where)).toEqual([])
  })

  it('draws fixtures with their plan symbols', () => {
    const r = { x: 0, y: 0, w: 30, d: 28 }
    expect(fixtureSymbols('Toilet', r)[0]).toMatchObject({ t: 'ellipse' })
    expect(fixtureSymbols('Shower', r)).toHaveLength(2)
    expect(fixtureSymbols('Range', { x: 0, y: 0, w: 48, d: 26 })).toHaveLength(4)
    expect(fixtureSymbols('Bookshelf', r)).toEqual([])
  })
})
