import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { doorGraph, placeOpenings } from './walls'
import { validateEstate } from './validate'
import { area } from './geometry'

const house = sampleEstate.house
const rooms = house.levels.flatMap(l => l.rooms)
const room = (id: string) => rooms.find(r => r.id === id)!

describe('main house layout v3: a mountain modern courtyard U', () => {
  it('splays the two wings 20 degrees off the center bar, so the courtyard opens south', () => {
    expect(house.wings!.map(w => [w.id, w.angle])).toEqual([['west-wing', -20], ['east-wing', 20]])
    expect(room('primary').wingId).toBe('east-wing')
    expect(room('guest-bed').wingId).toBe('west-wing')
    expect(room('kid-2').wingId).toBe('west-wing')
    for (const id of ['great', 'kitchen', 'dining']) expect(room(id).wingId, id).toBeUndefined()
  })

  it('opens the kitchen, dining, bar, foyer, den, and hearth room into one another and the great room', () => {
    const graph = doorGraph(house)
    for (const id of ['dining', 'bar', 'foyer', 'den', 'hearth']) expect(graph.get('great'), id).toContain(id)
    expect(graph.get('kitchen')).toContain('dining')
    const wide = placeOpenings(house).filter(o => o.kind === 'opening' && (o.roomId === 'great' || o.leadsTo === 'great' || o.roomId === 'kitchen'))
    expect(wide.filter(o => o.width >= 96).length).toBeGreaterThanOrEqual(6)
  })

  it('joins each wing to the bar with an opening on each side of a short link', () => {
    const p = placeOpenings(house)
    for (const [a, b] of [['family-hall', 'guest-entry'], ['kids-landing', 'kids-hall'], ['primary-hall', 'primary-gallery']]) {
      expect(p.find(o => o.roomId === a && o.leadsTo === b && !o.problem), a).toBeDefined()
      expect(p.find(o => o.roomId === b && o.leadsTo === a && !o.problem), b).toBeDefined()
    }
  })

  it('has no long halls on the main floor', () => {
    // The foyer is an entry room, not a hall.
    const halls = house.levels.find(l => l.id === 'main')!.rooms.filter(r => r.type === 'circulation' && !/stair/i.test(r.name) && r.id !== 'foyer')
    for (const h of halls) expect(Math.max(h.rect.w, h.rect.d), h.id).toBeLessThanOrEqual(12 * 22)
  })

  it('faces the living spaces onto a covered courtyard porch, with glass and doors out', () => {
    for (const id of ['kitchen', 'dining', 'great']) expect(room(id).rect.y, id).toBe(0)
    expect(room('terrace').rect.y + room('terrace').rect.d).toBe(0)
    const out = placeOpenings(house).filter(o => o.levelId === 'main' && o.leadsTo === 'outside' && o.side === 's' && o.kind === 'door' && !o.problem)
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(placeOpenings(house).find(o => o.id === 'great-glass')!.width).toBeGreaterThanOrEqual(12 * 24)
  })

  it('shapes the ceilings: a trussed vault with a glass gable, beamed dining, a lower hearth room, a vaulted primary', () => {
    expect(room('great').ceiling).toMatchObject({ form: 'vaulted', glassEnds: ['s'] })
    expect(room('great').ceiling!.spacing).toBeGreaterThan(0)
    expect(room('kitchen').ceiling!.form).toBe('vaulted')
    expect(room('dining').ceiling!.form).toBe('beamed')
    expect(room('hearth').ceiling!.height).toBeLessThan(room('great').ceiling!.height)
    expect(room('primary').ceiling!.form).toBe('vaulted')
  })

  it('has the nooks, fireplaces, and outdoor rooms from the brief', () => {
    const bays = placeOpenings(house).filter(o => o.bay?.seat).map(o => o.roomId)
    for (const id of ['kitchen', 'hearth', 'office', 'primary-sitting', 'kids-landing']) expect(bays, id).toContain(id)
    const kinds = (id: string) => (house.furniture ?? []).filter(i => i.roomId === id).map(i => i.kind)
    expect(kinds('great')).toContain('fireplace-stone-tall')
    expect(kinds('primary')).toContain('fireplace-stone')
    expect(kinds('terrace')).toEqual(expect.arrayContaining(['outdoor-kitchen', 'fireplace-outdoor']))
    for (const id of ['screened-porch', 'primary-deck', 'kids-deck', 'courtyard']) expect(room(id).type, id).toBe('outdoor')
  })

  it('keeps cozy rooms alongside the big ones', () => {
    for (const id of ['den', 'hearth', 'office', 'homework']) expect(area(room(id).rect) / 144, id).toBeLessThan(400)
  })

  it('puts the indoor pool under the great room, so no walls stand over it', () => {
    expect(room('indoor-pool').rect).toEqual(room('great').rect)
    expect(validateEstate(sampleEstate).find(c => c.id === 'beam-span')!.status).toBe('pass')
  })

  it('is about two thirds the size of the first layout, and passes every check', () => {
    const finished = rooms.filter(r => r.type !== 'outdoor' && r.type !== 'garage').reduce((s, r) => s + area(r.rect), 0) / 144
    expect(finished).toBeGreaterThan(22000)
    expect(finished).toBeLessThan(26500)
    expect(validateEstate(sampleEstate).filter(c => c.status !== 'pass').map(c => c.id)).toEqual([])
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
