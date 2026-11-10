import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { doorGraph, placeOpenings } from './walls'
import { validateEstate } from './validate'
import { area } from './geometry'

const house = sampleEstate.house
const rooms = house.levels.flatMap(l => l.rooms)
const room = (id: string) => rooms.find(r => r.id === id)!

describe('main house layout v3: a mountain modern courtyard U', () => {
  it('runs the two wings straight south from the ends of the bar, so the courtyard opens south', () => {
    // Garrett found the splayed wings unusable (2026-11-10).
    expect(house.wings ?? []).toEqual([])
    for (const id of ['guest-bed', 'kid-2', 'kids-living']) expect(room(id).rect.x + room(id).rect.w, id).toBeLessThanOrEqual(0)
    for (const id of ['primary', 'primary-sitting', 'bath-his']) expect(room(id).rect.x, id).toBeGreaterThanOrEqual(12 * 136)
    for (const id of ['primary', 'guest-bed', 'kid-5']) expect(room(id).rect.y, id).toBeLessThan(0)
  })

  it('opens the kitchen, dining, bar, foyer, den, and hearth room into one another and the great room', () => {
    const graph = doorGraph(house)
    for (const id of ['kitchen', 'bar', 'foyer', 'den', 'hearth']) expect(graph.get('great'), id).toContain(id)
    expect(graph.get('kitchen')).toContain('dining')
    const wide = placeOpenings(house).filter(o => o.kind === 'opening' && (o.roomId === 'great' || o.leadsTo === 'great' || o.roomId === 'kitchen'))
    expect(wide.filter(o => o.width >= 96).length).toBeGreaterThanOrEqual(6)
  })

  it('joins each wing to the bar through an 8 ft opening in a shared wall', () => {
    const p = placeOpenings(house)
    for (const [a, b] of [['family-hall', 'guest-entry'], ['kids-landing', 'kids-wing-landing'], ['primary-hall', 'primary-vestibule']]) {
      expect(p.find(o => o.roomId === a && o.leadsTo === b && !o.problem && o.width >= 96), a).toBeDefined()
    }
  })

  it('opens every wing bedroom straight off a gallery or loft, with its own bath and an outside wall', () => {
    const graph = doorGraph(house)
    for (const [bed, hub] of [['extra-bed', 'guest-gallery'], ['kid-2', 'kids-living'], ['kid-4', 'kids-living'], ['kid-5', 'kids-living']]) expect(graph.get(bed), bed).toContain(hub)
    expect(graph.get('primary')).toContain('primary-sitting')
    expect(graph.get('primary')).toContain('dressing-hall')
    expect(validateEstate(sampleEstate).find(c => c.id === 'escape-windows')!.status).toBe('pass')
  })

  it('flows: the garage into the mudroom and laundry, his bath straight off the bedroom, the kitchen open to the great room', () => {
    const graph = doorGraph(house)
    expect(graph.get('garage')).toContain('mudroom')
    expect([...graph.get('mudroom')!]).toEqual(expect.arrayContaining(['family-hall', 'pantry']))
    // His bath opens only off the bedroom; her bath off the dressing hall at the bedroom door.
    expect([...graph.get('bath-his')!]).toEqual(['primary'])
    expect(graph.get('bath-hers')).toContain('dressing-hall')
    expect([...graph.get('dressing-hall')!]).toEqual(expect.arrayContaining(['primary', 'primary-gallery']))
    for (const id of ['closet-his', 'closet-hers']) expect([...graph.get(id)!].some(n => /primary-(gallery|vestibule)/.test(n)), id).toBe(true)
    expect([...graph.get('kitchen')!]).toEqual(expect.arrayContaining(['great', 'dining', 'scullery']))
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
    // Larger than the brief's two thirds of v1 since the wings were widened to be usable; Garrett: size is not the issue.
    expect(finished).toBeLessThan(30000)
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
