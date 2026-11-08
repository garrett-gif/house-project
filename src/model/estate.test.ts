import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { Terrain } from './parcel'
import { validateEstate } from './validate'
import { ft } from './geometry'

describe('approved layout version 1', () => {
  const checks = validateEstate(sampleEstate)

  it.each(checks.map(c => [c.label, c] as const))('%s', (_label, c) => {
    expect(c.status, c.detail).toBe('pass')
  })

  it('flags a building moved into the work setback', () => {
    const moved = structuredClone(sampleEstate)
    const shop = moved.buildings.find(b => b.id === 'forestry-shop')!
    shop.rect.x = ft(1800)
    shop.rect.y = ft(3800)
    const result = validateEstate(moved).find(c => c.id === 'separation')!
    expect(result.status).toBe('fail')
  })

  it('flags a bedroom with no bathroom', () => {
    const changed = structuredClone(sampleEstate)
    const room = changed.house.levels[2].rooms.find(r => r.id === 'kid-1')!
    room.bathId = undefined
    expect(validateEstate(changed).find(c => c.id === 'baths')!.status).toBe('fail')
  })
})

describe('terrain', () => {
  it('recreates identical land from the same seed', () => {
    const a = new Terrain(sampleEstate.parcel), b = new Terrain(sampleEstate.parcel)
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights))
  })

  it('changes with the seed', () => {
    const other = new Terrain({ ...sampleEstate.parcel, seed: 42 })
    expect(other.at(ft(3000), ft(3000))).not.toBe(new Terrain(sampleEstate.parcel).at(ft(3000), ft(3000)))
  })
})
