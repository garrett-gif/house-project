import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { doorGraph, placeOpenings } from './walls'
import { validateEstate } from './validate'
import { area } from './geometry'

const house = sampleEstate.house
const rooms = house.levels.flatMap(l => l.rooms)
const room = (id: string) => rooms.find(r => r.id === id)!

describe('main house layout v2: open and homey', () => {
  it('opens the kitchen, dining, foyer, den, hearth room, and bar straight into the great room', () => {
    const graph = doorGraph(house)
    for (const id of ['kitchen', 'dining', 'foyer', 'den', 'hearth', 'lounge']) expect(graph.get('great'), id).toContain(id)
    // Wide cased openings, not doors, around the great room.
    const wide = placeOpenings(house).filter(o => o.kind === 'opening' && (o.roomId === 'great' || o.leadsTo === 'great' || o.roomId === 'kitchen'))
    expect(wide.filter(o => o.width >= 96).length).toBeGreaterThanOrEqual(6)
  })

  it('has no long halls on the main floor', () => {
    const halls = house.levels.find(l => l.id === 'main')!.rooms.filter(r => r.type === 'circulation' && !/stair/i.test(r.name))
    for (const h of halls) expect(Math.max(h.rect.w, h.rect.d), h.id).toBeLessThanOrEqual(12 * 22)
  })

  it('steps out to terraces or porches all along the south', () => {
    const outdoor = house.levels.find(l => l.id === 'main')!.rooms.filter(r => r.type === 'outdoor' && r.rect.y === 0)
    expect(outdoor.reduce((s, r) => s + r.rect.w, 0)).toBe(12 * 170)
    expect(placeOpenings(house).filter(o => o.levelId === 'main' && o.leadsTo === 'outside' && o.side === 's' && o.kind === 'door').length).toBeGreaterThanOrEqual(4)
  })

  it('keeps cozy rooms alongside the big ones', () => {
    for (const id of ['den', 'hearth', 'office', 'homework']) expect(area(room(id).rect) / 144, id).toBeLessThan(400)
  })

  it('puts the indoor pool under the great room, so no walls stand over it', () => {
    expect(room('indoor-pool').rect).toEqual(room('great').rect)
    expect(validateEstate(sampleEstate).find(c => c.id === 'beam-span')!.status).toBe('pass')
  })

  it('is about two thirds the size of the first layout', () => {
    const finished = rooms.filter(r => r.type !== 'outdoor' && r.type !== 'garage').reduce((s, r) => s + area(r.rect), 0) / 144
    expect(finished).toBeGreaterThan(22000)
    expect(finished).toBeLessThan(26000)
  })
})

describe('plan labels', () => {
  it('use the short name, wrap, and shrink to fit the room, or step aside in tiny rooms', async () => {
    const { planLabel } = await import('../views/planLabel')
    expect(planLabel('Mudroom, lockers, bench, and dog wash', 22, 14)!.lines).toEqual(['Mudroom'])
    expect(planLabel('Great room, two story, fireplace', 44, 46)).toMatchObject({ lines: ['Great room'], size: 1.9, showSize: true })
    const narrow = planLabel('Hot tub and cold plunge', 14, 22)!
    expect(narrow.lines).toHaveLength(2)
    expect(Math.max(...narrow.lines.map(l => l.length)) * 0.55 * narrow.size).toBeLessThanOrEqual(14 * 0.86 + 1e-9)
    expect(planLabel('Elevator', 2, 2)).toBeNull()
  })
})
