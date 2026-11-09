import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { validateEstate } from './validate'
import { houseByBuilding } from './houses'
import { amenityKinds } from './amenities'
import { CATALOG } from './furniture'

const h = (id: string) => houseByBuilding(sampleEstate, id)!
const names = (id: string) => h(id).levels.flatMap(l => l.rooms).map(r => r.name)
const kinds = (id: string, roomId?: string) => (h(id).furniture ?? []).filter(i => !roomId || i.roomId === roomId).map(i => i.kind)
const seats = (id: string, roomId: string) => (h(id).furniture ?? []).filter(i => i.roomId === roomId).reduce((s, i) => s + (CATALOG[i.kind].seats ?? 0), 0)

describe('office and dispatch building', () => {
  it('has every room Garrett asked for, on one floor', () => {
    expect(h('offices').levels).toHaveLength(1)
    for (const n of ['Reception lobby, fireplace', 'Conference room, 16 seats', 'Executive office', 'Executive bath', 'Executive conference room', 'Executive lounge and bar',
      'Dispatch floor, 8 positions', 'Emergency operations room, 40 seats', 'Break room', 'Training room, 50 seats', 'Radio and server room', 'Records and plans room',
      'Staff showers and lockers', 'Mail, print, and supply', 'Open office']) expect(names('offices')).toContain(n)
  })

  it('seats the training room, conference room, and operations room, with 8 dispatch positions', () => {
    expect(seats('offices', 'of-training')).toBeGreaterThanOrEqual(50)
    expect(seats('offices', 'of-conference')).toBeGreaterThanOrEqual(16)
    expect(seats('offices', 'of-eoc')).toBeGreaterThanOrEqual(40)
    expect(seats('offices', 'of-dispatch')).toBe(8)
  })

  it('gives the executive suite its own outside door', () => {
    expect(h('offices').openings.find(o => o.id === 'of-exec-entry')).toMatchObject({ roomId: 'of-exec-lounge', side: 's' })
  })
})

describe('car collection building', () => {
  it('holds 55 cars, 20 on display and 35 in storage, plus the toys', () => {
    const cars = (roomId: string) => kinds('car-building', roomId).filter(k => ['suv', 'classic-car', 'sports-car'].includes(k)).length
    expect(cars('cb-showroom')).toBe(20)
    expect(cars('cb-storage')).toBe(35)
    expect(kinds('car-building', 'cb-toys')).toEqual(expect.arrayContaining(['motorcycle', 'utv', 'snowmobile']))
  })

  it('has the shop: wash, detail, body and prep, paint booth and mixing, 4 lifts, tires and alignment, parts', () => {
    expect(kinds('car-building')).toEqual(expect.arrayContaining(['car-wash', 'detail-station', 'paint-booth', 'mixing-bench', 'alignment-rack', 'tire-machine', 'parts-racks']))
    expect(kinds('car-building', 'cb-mechanic').filter(k => k === 'car-lift')).toHaveLength(4)
  })

  it('puts the lounge, bar, and event space on a mezzanine open to the two-story showroom', () => {
    const mezz = h('car-building').levels.find(l => l.id === 'cb-mezz')!
    expect(mezz.rooms.map(r => r.name)).toContain("Collector's lounge, bar, and event space")
    expect(h('car-building').levels[0].rooms.find(r => r.id === 'cb-showroom')!.twoStory).toBe(true)
    expect(kinds('car-building', 'cb-lounge')).toEqual(expect.arrayContaining(['bar-counter', 'living-group']))
  })
})

describe('entertainment shop', () => {
  it('has the karts, trampolines, foam pit, bowling, arcade, and the rest', () => {
    for (const k of ['kart-circuit', 'go-kart', 'trampoline-court', 'foam-pit', 'dodgeball-court', 'ninja-course', 'climbing-wall', 'arena-obstacles', 'basketball-court',
      'bowling-lanes-4', 'arcade-row', 'golf-sim-bay', 'living-group', 'dining-12']) expect(kinds('entertainment'), k).toContain(k)
    expect(kinds('entertainment', 'en-golf').filter(k => k === 'golf-sim-bay')).toHaveLength(2)
  })

  it('opens the indoor kart track onto the outdoor track, with a viewing mezzanine', () => {
    const doors = h('entertainment').openings.filter(o => o.roomId === 'en-track' && o.side === 's' && o.kind === 'garage-door')
    expect(doors.length).toBeGreaterThanOrEqual(2)
    const track = sampleEstate.zones.find(z => z.id === 'kart-track')!
    const b = sampleEstate.buildings.find(x => x.id === 'entertainment')!
    expect(b.rect.y - (track.rect.y + track.rect.d)).toBeLessThan(12 * 30)
    expect(h('entertainment').levels.find(l => l.id === 'en-mezz')!.rooms.map(r => r.name)).toContain('Viewing mezzanine and lounge')
  })

  it('is about 80,000 sq ft, beside the car building, inside the private estate', () => {
    const area = h('entertainment').levels[0].rooms.reduce((s, r) => s + r.rect.w * r.rect.d, 0) / 144
    expect(area).toBeGreaterThan(70000)
    expect(area).toBeLessThan(90000)
    expect(sampleEstate.buildings.find(x => x.id === 'entertainment')!.access).toBe('private')
    expect(sampleEstate.walkways.find(w => w.id === 'walk-car')).toMatchObject({ from: 'entertainment', to: 'car-building' })
  })
})

describe('all three', () => {
  it('use only catalog pieces and pass every check', () => {
    expect(amenityKinds()).toEqual([])
    expect(validateEstate(sampleEstate).filter(c => c.status !== 'pass').map(c => c.id)).toEqual([])
  })
})
