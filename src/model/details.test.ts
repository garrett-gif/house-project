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

describe('room touches in every building', () => {
  it('puts rugs under seating and beds, lamps, art, and plants in the living spaces and bedrooms', async () => {
    const { roomDecor } = await import('./decor')
    const d = roomDecor(sampleEstate.house)
    const inRoom = (id: string) => d.filter(x => x.roomId === id).map(x => x.kind)
    expect(inRoom('great')).toEqual(expect.arrayContaining(['rug', 'floor-lamp']))
    expect(inRoom('primary')).toEqual(expect.arrayContaining(['rug', 'table-lamp']))
    expect(d.filter(x => x.kind === 'art').length).toBeGreaterThan(10)
    expect(d.filter(x => x.kind === 'tv').length).toBeGreaterThan(0)
    // Every touch sits inside its room.
    const rooms = new Map(sampleEstate.house.levels.flatMap(l => l.rooms).map(r => [r.id, r.rect]))
    for (const x of d) {
      const r = rooms.get(x.roomId)!
      expect(x.rect.x >= r.x && x.rect.y >= r.y && x.rect.x + x.rect.w <= r.x + r.w && x.rect.y + x.rect.d <= r.y + r.d, `${x.kind} in ${x.roomId}`).toBe(true)
    }
    // And every building with living spaces gets them.
    for (const h of allHouses(sampleEstate).filter(h => h.levels.some(l => l.rooms.some(r => r.type === 'living' || r.type === 'bedroom')))) {
      expect(roomDecor(h).length, h.buildingId).toBeGreaterThan(0)
    }
  })
})

describe('architecture in every building', () => {
  it('stands porch posts along the open edges of covered porches, and rails decks above the ground', async () => {
    const { porchPosts, railings } = await import('./architecture')
    const h = sampleEstate.house
    const posts = porchPosts(h), rails = railings(h)
    expect(new Set(posts.map(p => p.roomId))).toEqual(new Set(['terrace', 'screened-porch']))
    // The porch over the sunken courtyard, the primary deck, and the kids' deck all need guards.
    expect(new Set(rails.map(r => r.roomId))).toEqual(new Set(['terrace', 'primary-deck', 'kids-deck']))
    // Posts stand no more than 12 ft apart.
    const terrace = posts.filter(p => p.roomId === 'terrace' && p.y === -16 * 12).map(p => p.x).sort((a, b) => a - b)
    for (let i = 1; i < terrace.length; i++) expect(terrace[i] - terrace[i - 1]).toBeLessThanOrEqual(144)
    // Every covered porch elsewhere gets posts too.
    for (const id of ['guest-house', 'cabins', 'outdoor-pool', 'fuel']) expect(porchPosts(allHouses(sampleEstate).find(x => x.buildingId === id)!).length, id).toBeGreaterThan(0)
  })
})
