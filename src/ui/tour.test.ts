import { describe, expect, it } from 'vitest'
import { sampleEstate } from '../model/sampleEstate'
import { placeOpenings } from '../model/walls'
import { ft, toFt } from '../model/geometry'
import { canStand, flyoverKeyframes, step, walkStart } from './tour'

const house = sampleEstate.house

describe('flyover', () => {
  it('starts high over the estate gate and circles the house', () => {
    const k = flyoverKeyframes(sampleEstate)
    expect(k.length).toBeGreaterThan(8)
    const gate = sampleEstate.roads.find(r => r.id === 'estate-drive')!.points[0]
    expect(Math.hypot(k[0].x - toFt(gate.x), k[0].y - toFt(gate.y))).toBeLessThan(1)
    expect(k[0].z).toBeGreaterThan(500)
    const h = sampleEstate.buildings.find(b => b.id === 'main-house')!.rect
    const hx = toFt(h.x + h.w / 2), hy = toFt(h.y + h.d / 2)
    const near = k.filter(f => Math.hypot(f.x - hx, f.y - hy) < 700)
    expect(near.length).toBeGreaterThanOrEqual(4)
    expect(near.every(f => Math.hypot(f.lookX - hx, f.lookY - hy) < 1)).toBe(true)
  })

  it('stays above the trees', () => {
    expect(flyoverKeyframes(sampleEstate).every(f => f.z >= 150)).toBe(true)
  })
})

describe('walkthrough', () => {
  it('starts inside the front door on the main floor', () => {
    const p = walkStart(house, 'main')
    const foyer = house.levels[1].rooms.find(r => r.id === 'foyer')!
    expect(p).toEqual({ x: foyer.rect.x + foyer.rect.w / 2, y: foyer.rect.y + foyer.rect.d / 2 })
    expect(canStand(house, 'main', p.x, p.y)).toBe(true)
  })

  it('cannot walk through the wall between the kitchen and the great room', () => {
    // Middle of that wall, away from any door.
    expect(canStand(house, 'main', ft(96), ft(70))).toBe(false)
    const from = { x: ft(94), y: ft(70) }
    let p = from
    for (let i = 0; i < 20; i++) p = step(house, 'main', p, 6, 0)
    expect(p.x).toBeLessThan(ft(96))
  })

  it('walks through a door', () => {
    const door = placeOpenings(house).find(o => o.roomId === 'kitchen' && o.leadsTo === 'm-hall')!
    const mid = (door.from + door.to) / 2
    // From the kitchen, north through its door into the gallery.
    let p = { x: mid, y: ft(85) }
    for (let i = 0; i < 20; i++) p = step(house, 'main', p, 0, 6)
    expect(p.y).toBeGreaterThan(ft(89))
  })

  it('slides along a wall instead of stopping dead', () => {
    const p = step(house, 'main', { x: ft(94), y: ft(70) }, 24, 6)
    expect(p).toEqual({ x: ft(94), y: ft(70) + 6 })
  })
})
