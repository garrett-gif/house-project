import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import { validateEstate } from './validate'
import { SHOP_SPECS, perLane, shopBuilding } from './shops'
import { houseByBuilding, focusHouse } from './houses'
import { footprint } from './furniture'
import { placeOpenings } from './walls'
import { drawingSet } from '../drawings/drawingSet'
import { scaleFor } from '../drawings/floorPlanSheet'
import { summarizeEstate } from './summary'
import { ft } from './geometry'
import type { Estate } from './types'

const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const check = (e: Estate, id: string) => validateEstate(e).find(c => c.id === id)!
const shop = (id: string) => houseByBuilding(sampleEstate, id)!
const count = (id: string, kind: string) => (shop(id).furniture ?? []).filter(i => i.kind === kind).length

describe('the shops', () => {
  it('house at least 25 of every machine indoors, and only a few crew carriers', () => {
    for (const spec of SHOP_SPECS) for (const g of spec.groups) expect(count(spec.buildingId, g.kind), `${spec.buildingId} ${g.kind}`).toBeGreaterThanOrEqual(g.count)
    for (const kind of ['engine-t3', 'engine-t6', 'water-tender']) expect(count('wildland-shop', kind)).toBe(25)
    expect(count('wildland-shop', 'crew-carrier')).toBe(3)
    expect(count('dozer-barn', 'dozer-lowboy')).toBe(25)
    for (const kind of ['feller-buncher', 'harvester', 'skidder', 'forwarder']) expect(count('forestry-shop', kind)).toBe(25)
    for (const kind of ['log-loader', 'excavator', 'masticator', 'chipper']) expect(count('forestry-barn', kind)).toBe(25)
    for (const kind of ['log-truck', 'pickup', 'utv']) expect(count('forestry-fleet', kind)).toBe(25)
    expect(check(sampleEstate, 'fleet').status).toBe('pass')
  })

  it('give the wildland station gear lockers, hose wash, fitness, a ready room, and offices', () => {
    const names = shop('wildland-shop').levels[0].rooms.map(r => r.name)
    for (const n of ['Gear lockers', 'Hose wash and drying', 'Crew fitness room', 'Crew ready room', 'Station offices', 'Decon showers and restrooms']) expect(names).toContain(n)
    const kinds = (shop('wildland-shop').furniture ?? []).map(i => i.kind)
    expect(kinds).toEqual(expect.arrayContaining(['gear-lockers', 'hose-washer', 'power-rack', 'treadmill', 'desk']))
  })

  it('park machines nose to tail in drive-through lanes with a door at each end', () => {
    expect(perLane('engine-t3', 110)).toBe(3)
    expect(perLane('dozer-lowboy', 160)).toBe(2)
    const wl = shop('wildland-shop')
    const doors = placeOpenings(wl).filter(o => o.kind === 'garage-door')
    expect(doors.filter(o => o.side === 's').length).toBe(doors.filter(o => o.side === 'n').length)
    expect(doors.every(o => !o.problem && o.leadsTo === 'outside')).toBe(true)
    // Every machine sits inside the bays.
    const bays = wl.levels[0].rooms.find(r => r.id === 'wl-bays')!.rect
    for (const i of (wl.furniture ?? []).filter(i => i.roomId === 'wl-bays')) {
      const f = footprint(i)
      expect(f.x >= bays.x && f.x + f.w <= bays.x + bays.w && f.y >= bays.y && f.y + f.d <= bays.y + bays.d, i.id).toBe(true)
    }
  })

  it('pass every check on the site and inside', () => {
    const notPassing = validateEstate(sampleEstate).filter(c => c.status !== 'pass')
    expect(notPassing.map(c => `${c.id}: ${c.detail}`)).toEqual([])
  })

  it('warn when a shop loses machines or a lane is too short', () => {
    const tender = (shop('wildland-shop').furniture ?? []).find(i => i.kind === 'water-tender')!
    expect(check(ok(applyOperations(sampleEstate, [{ op: 'removeFurniture', itemId: tender.id }])), 'fleet')).toMatchObject({ status: 'warn', elements: ['wl-bays'] })
    const short = shopBuilding({ ...SHOP_SPECS[0], depthFt: 80 })
    expect((short.furniture ?? []).filter(i => i.kind === 'engine-t3').length).toBe(25)
    expect(short.levels[0].rooms.find(r => r.id === 'wl-bays')!.rect.w).toBeGreaterThan(shop('wildland-shop').levels[0].rooms.find(r => r.id === 'wl-bays')!.rect.w)
  })

  it('drive the building outlines on the site', () => {
    const b = sampleEstate.buildings.find(x => x.id === 'forestry-shop')!
    expect(b.rect.x).toBe(ft(4500))
    expect(b.rect.w).toBeGreaterThan(ft(400))
  })
})

describe('shop drawings and the chat summary', () => {
  it('draw long shops at a smaller scale so they fit the sheet', () => {
    expect(scaleFor(sampleEstate.house).label).toBe('1/8" = 1\'-0"')
    expect(scaleFor(shop('forestry-shop')).label).toBe('1/32" = 1\'-0"')
    const set = drawingSet(focusHouse(sampleEstate, 'forestry-shop'), { revision: 0, date: '2026-11-09', projectName: 'House Project' })
    const plan = set.find(s => s.number === 'A-101')!
    for (const m of plan.marks) if (m.t === 'rect') expect(m.x + m.w, JSON.stringify(m).slice(0, 80)).toBeLessThanOrEqual(plan.width)
  })

  it('summarize rows of overhead doors and machines in one line each, and keep the chat summary short', () => {
    const text = summarizeEstate(sampleEstate, new Set(['wildland-shop']))
    expect(text).toMatch(/\d+ overhead doors, .* one at each end of every lane/)
    expect(text).toMatch(/furniture: 25 engine-t3, 25 engine-t6, 25 water-tender, 3 crew-carrier/)
    // By default the main house is in full and every other building lists its rooms only.
    expect(summarizeEstate(sampleEstate, new Set(['main-house'])).length).toBeLessThan(150000)
  })
})
