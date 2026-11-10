import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { allHouses } from './houses'
import { stairGeometry } from './stairs'
import { floorPlanSheets } from '../drawings/floorPlanSheet'

const house = sampleEstate.house
const room = (id: string) => house.levels.flatMap(l => l.rooms).find(r => r.id === id)!
const inside = (q: { x: number; y: number; w: number; d: number }, r: { x: number; y: number; w: number; d: number }) => q.x >= r.x && q.y >= r.y && q.x + q.w <= r.x + r.w && q.y + q.d <= r.y + r.d

describe('stairs', () => {
  it('climbs the main stair in equal risers, up one lane, across a landing, and back up the other', () => {
    const st = house.stairs.find(s => s.roomId === 'm-stair')!
    const g = stairGeometry(house, st)!
    // 11 ft floor to floor in risers of 7.75 in or less.
    expect(g.risers).toBe(18)
    expect(g.riser).toBeCloseTo(132 / 18)
    // Every tread and the landing is a step: the last tread is one riser below the floor above.
    expect(g.treads.length + 1).toBe(g.risers - 1)
    expect(Math.max(...g.treads.map(t => t.top))).toBeCloseTo(132 - g.riser)
    expect(g.landing).toBeDefined()
    for (const q of [...g.treads.map(t => t.rect), g.landing!.rect]) expect(inside(q, room('m-stair').rect)).toBe(true)
  })

  it('fits inside every stair room in every building', () => {
    for (const h of allHouses(sampleEstate)) for (const st of h.stairs) {
      const g = stairGeometry(h, st)!
      const r = h.levels.flatMap(l => l.rooms).find(x => x.id === st.roomId)!.rect
      for (const q of [...g.treads.map(t => t.rect), ...(g.landing ? [g.landing.rect] : [])]) expect(inside(q, r), `${h.buildingId} ${st.id}`).toBe(true)
    }
  })

  it('is drawn on the plans, up from below and down from above', () => {
    const sheets = floorPlanSheets(sampleEstate, { revision: 1, date: '2026-11-10', projectName: 'Test' })
    const texts = (i: number) => sheets[i].marks.flatMap(m => m.t === 'text' ? [m.text] : [])
    expect(texts(0)).toContain('UP')
    expect(texts(1)).toEqual(expect.arrayContaining(['UP', 'DN']))
    expect(texts(2)).toContain('DN')
  })
})
