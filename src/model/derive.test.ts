import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import { validateEstate } from './validate'
import { area, ft, footprintOf, partsOf } from './geometry'
import type { Estate } from './types'

const house = (e: Estate) => e.buildings.find(b => b.id === 'main-house')!
const total = (rects: { w: number; d: number }[]) => rects.reduce((s, r) => s + area(r as never), 0)
const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }

describe('below-grade rooms', () => {
  // A cellar under the kitchen terrace (house-local 0,0, 30 x 16 ft), south of the walkout. The house already has a wine cellar.
  const cellar = ok(applyOperations(sampleEstate, [
    { op: 'addRoom', levelId: 'walkout', room: { id: 'tasting-cellar', name: 'Tasting cellar', type: 'service', rect: { x: 0, y: 0, w: ft(30), d: ft(16) } } },
  ]))

  it('is not drawn or extruded as above-grade mass', () => {
    expect(total(partsOf(house(cellar)))).toBe(total(partsOf(house(sampleEstate))))
  })

  it('still counts in the footprint used for collisions', () => {
    expect(total(footprintOf(house(cellar)))).toBe(total(footprintOf(house(sampleEstate))) + ft(30) * ft(16))
  })

  it('cannot be placed under another building, here the pool house south of the terraces', () => {
    const r = applyOperations(sampleEstate, [
      { op: 'addRoom', levelId: 'walkout', room: { id: 'tasting-cellar', name: 'Tasting cellar', type: 'service', rect: { x: ft(60), y: ft(-20), w: ft(30), d: ft(20) } } },
    ])
    expect(r.ok).toBe(false)
  })
})

describe('checks name what they are about', () => {
  it('names the stretched walkway', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveBuilding', buildingId: 'car-building', dx: ft(100), dy: 0 }]))
    expect(validateEstate(e).find(c => c.id === 'walkways')).toMatchObject({ status: 'fail', elements: ['walk-car'] })
  })

  it('names the misplaced rooms', () => {
    // Pushing the guest bedroom past the north face leaves the front door no longer the northmost wall.
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'guest-bed', side: 'n', distance: ft(4) }]))
    expect(validateEstate(e).find(c => c.id === 'house-placement')).toMatchObject({ status: 'fail', elements: ['foyer'] })
  })

  it('names the bedroom with no bath, and the pair that is too close', () => {
    const noBath = structuredClone(sampleEstate)
    noBath.house.levels[2].rooms.find(r => r.id === 'kid-1')!.bathId = undefined
    expect(validateEstate(noBath).find(c => c.id === 'baths')!.elements).toEqual(['kid-1'])
    const close = ok(applyOperations(sampleEstate, [{ op: 'moveBuilding', buildingId: 'forestry-shop', dx: ft(-1690), dy: ft(2360) }]))
    expect(validateEstate(close).find(c => c.id === 'separation')!.elements).toContain('forestry-shop')
  })

  it('leaves passing checks without elements', () => {
    expect(validateEstate(sampleEstate).filter(c => c.status === 'pass').every(c => c.elements === undefined)).toBe(true)
  })
})
