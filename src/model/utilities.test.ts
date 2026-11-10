import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { applyOperations } from './edits'
import type { EditOp } from './edits'
import { toEditOp } from './editTools'
import { forestAcres, validateEstate } from './validate'
import { utilityChecks } from './utilityChecks'
import { securityChecks, sees } from './securityChecks'
import { demand, occupancy, systems } from './utilities'
import { withUtilityDefaults } from './migrate'
import { summarizeEstate } from './summary'
import { ft } from './geometry'
import type { Estate, Utility } from './types'

const ok = (r: ReturnType<typeof applyOperations>) => { if (!r.ok) throw new Error(r.error); return r.estate }
const check = (e: Estate, id: string) => validateEstate(e).find(c => c.id === id)!
const util = (id: string) => sampleEstate.utilities!.find(u => u.id === id)!
const UTILITY_IDS = ['utility-coverage', 'water-supply', 'septic-capacity', 'power-capacity', 'backup-power', 'utility-separation', 'solar-sun', 'trench-length', 'parking']
const SECURITY_IDS = ['gate-cameras', 'approach-visibility', 'building-cameras', 'lighting', 'security-power', 'safe-room']

describe('the sample utilities and security', () => {
  it('pass every utility and security check', () => {
    for (const c of [...utilityChecks(sampleEstate), ...securityChecks(sampleEstate)]) expect(c.status, `${c.id}: ${c.detail}`).toBe('pass')
    expect([...utilityChecks(sampleEstate), ...securityChecks(sampleEstate)].map(c => c.id)).toEqual([...UTILITY_IDS, ...SECURITY_IDS])
  })

  it('plan for about 150 people sleeping in the compound and 300 by day', () => {
    const compound = sampleEstate.buildings.filter(b => b.access !== 'private')
    expect(compound.reduce((s, b) => s + occupancy(sampleEstate, b).beds, 0)).toBe(150)
    // 300 working by day, plus 60 at entertainment shop events.
    expect(sampleEstate.buildings.reduce((s, b) => s + occupancy(sampleEstate, b).staff, 0)).toBe(360)
    // Two per bedroom in the main house: eleven bedrooms, counting the guest suite's bunk room.
    expect(occupancy(sampleEstate, sampleEstate.buildings.find(b => b.id === 'main-house')!).beds).toBe(22)
  })

  it('keep the working forest at 700 acres or more', () => {
    expect(forestAcres(sampleEstate)).toBeGreaterThanOrEqual(700)
  })

  it('group the two compound wells into one system', () => {
    const wells = systems(sampleEstate, 'well')
    expect(wells).toHaveLength(2)
    expect(wells.find(s => s.utilities.length === 2)!.capacity).toBe(40)
  })
})

describe('utility checks', () => {
  it('flag a well too close to a drainfield', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveUtility', utilityId: 'estate-well', dx: ft(1080), dy: ft(-1010) }]))
    const c = check(e, 'utility-separation')
    expect(c.status).toBe('warn')
    expect(c.elements).toEqual(expect.arrayContaining(['estate-well', 'estate-septic']))
  })

  it('flag a septic system once more people sleep there than it was designed for', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'setOccupancy', buildingId: 'guest-house', beds: 20, staff: 0, backupPower: true }]))
    expect(check(e, 'septic-capacity')).toMatchObject({ status: 'warn', elements: ['estate-septic'] })
    expect(check(e, 'water-supply').status).toBe('pass')
  })

  it('flag a drainfield too small for its design flow', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'resizeUtility', utilityId: 'estate-septic', w: ft(50), d: ft(50), anchor: 'sw' }]))
    expect(check(e, 'septic-capacity').detail).toMatch(/2,500 sq ft of drainfield, 13,333 needed/)
  })

  it('flag a drainfield under a road', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveUtility', utilityId: 'estate-septic', dx: ft(-100), dy: 0 }]))
    expect(check(e, 'utility-separation').detail).toMatch(/runs under Guest and transporter road/)
  })

  it('size propane clearance by the tank', () => {
    // 60 ft from the commons: enough for 2,000 gallons, not for 40,000.
    const e = ok(applyOperations(sampleEstate, [{ op: 'setUtility', utilityId: 'lodging-propane', capacity: 40000, serves: util('lodging-propane').serves }]))
    expect(check(sampleEstate, 'utility-separation').status).toBe('pass')
    expect(check(e, 'utility-separation').elements).toEqual(expect.arrayContaining(['lodging-propane', 'commons']))
  })

  it('flag a solar array with forest to the south', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveUtility', utilityId: 'compound-solar', dx: 0, dy: ft(-200) }]))
    expect(check(e, 'solar-sun')).toMatchObject({ status: 'warn', elements: ['compound-solar'] })
  })

  it('flag buildings left without backup power', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'removeUtility', utilityId: 'estate-generator' }]))
    const c = check(e, 'utility-coverage')
    expect(c.elements).toEqual(['main-house', 'guest-house'])
    expect(c.detail).toMatch(/Main house has no backup generator/)
  })

  it('flag an undersized generator and service', () => {
    const e = ok(applyOperations(sampleEstate, [
      { op: 'setUtility', utilityId: 'estate-generator', capacity: 50, serves: ['main-house', 'guest-house'] },
      { op: 'setUtility', utilityId: 'estate-service', capacity: 100, serves: util('estate-service').serves },
    ]))
    expect(check(e, 'backup-power').elements).toEqual(['estate-generator'])
    expect(check(e, 'power-capacity').elements).toEqual(['estate-service'])
  })

  it('flag long sewer and generator runs', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveUtility', utilityId: 'aviation-generator', dx: ft(-2000), dy: 0 }]))
    expect(check(e, 'trench-length')).toMatchObject({ status: 'warn', elements: ['aviation-generator', 'hangars'] })
  })

  it('flag too little parking', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'setOccupancy', buildingId: 'classroom', beds: 0, staff: 1500, backupPower: false }]))
    expect(check(e, 'parking')).toMatchObject({ status: 'warn', elements: ['fun-parking', 'parking'] })
  })

  it('let the owner replace a planning value', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'setUtilityRule', rule: 'wellToSepticFt', value: 5000 }]))
    expect(e.utilityRules).toEqual({ wellToSepticFt: 5000 })
    expect(check(e, 'utility-separation').detail).toMatch(/under 5000 ft/)
  })

  it('count water and power demand from beds, staff, and floor area', () => {
    const lodge = sampleEstate.buildings.find(b => b.id === 'lodge-1')!
    // 22 beds at 100 gallons a day; 108 x 54 ft on two floors, from its rooms, at 4 W per sq ft.
    expect(demand(sampleEstate, lodge)).toEqual({ waterGpd: 2200, sewageGpd: 1650, kw: 108 * 54 * 2 * 4 / 1000 })
  })
})

describe('utility edits', () => {
  const tank: Utility = { id: 'new-tank', name: 'New tank', kind: 'propane', rect: { x: ft(1300), y: ft(5650), w: ft(20), d: ft(6) }, capacity: 500, serves: ['main-house'] }

  it('add a utility, and clear its ground', () => {
    const forest = ok(applyOperations(sampleEstate, [{ op: 'addUtility', utility: { ...tank, id: 'forest-array', kind: 'solar', rect: { x: ft(100), y: ft(3000), w: ft(209), d: ft(209) }, capacity: 200, serves: [] } }]))
    expect(forestAcres(forest)).toBeCloseTo(forestAcres(sampleEstate) - 1, 1)
    expect(ok(applyOperations(sampleEstate, [{ op: 'addUtility', utility: tank }])).utilities).toHaveLength(sampleEstate.utilities!.length + 1)
  })

  it('reject a utility on a building or on another utility', () => {
    const onHouse = applyOperations(sampleEstate, [{ op: 'addUtility', utility: { ...tank, rect: { x: ft(1100), y: ft(5420), w: ft(20), d: ft(6) } } }])
    expect(onHouse).toMatchObject({ ok: false, error: expect.stringMatching(/would sit on Main house/) })
    const onWell = applyOperations(sampleEstate, [{ op: 'addUtility', utility: { ...tank, rect: { x: ft(865), y: ft(5625), w: ft(10), d: ft(10) } } }])
    expect(onWell).toMatchObject({ ok: false, error: expect.stringMatching(/Estate well \(estate-well\) and New tank \(new-tank\) would overlap/) })
  })

  it('reject unknown buildings, kinds, and duplicate ids', () => {
    expect(applyOperations(sampleEstate, [{ op: 'addUtility', utility: { ...tank, serves: ['barn'] } }])).toMatchObject({ ok: false, error: 'No building with id "barn".' })
    expect(applyOperations(sampleEstate, [{ op: 'addUtility', utility: { ...tank, kind: 'wind' as never } }])).toMatchObject({ ok: false })
    expect(applyOperations(sampleEstate, [{ op: 'addUtility', utility: { ...tank, id: 'estate-well' } }])).toMatchObject({ ok: false })
  })

  it('move cameras and lights with the building they are on', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'moveBuilding', buildingId: 'classroom', dx: ft(10), dy: 0 }]))
    const before = sampleEstate.security!.find(d => d.id === 'cam-classroom-sw')!, after = e.security!.find(d => d.id === 'cam-classroom-sw')!
    expect(after.at.x - before.at.x).toBe(ft(10))
    expect(e.security!.find(d => d.id === 'cam-estate-gate')!.at).toEqual(sampleEstate.security!.find(d => d.id === 'cam-estate-gate')!.at)
  })

  it('convert chat tools in feet, including lists of building ids', () => {
    const r = toEditOp('addUtility', { id: 'barn-well', name: 'Barn well', kind: 'well', xFt: 100, yFt: 200, widthFt: 20, depthFt: 20, capacity: 10, serves: ['main-house'], pumped: false })
    expect(r).toEqual({ ok: true, op: { op: 'addUtility', utility: { id: 'barn-well', name: 'Barn well', kind: 'well', rect: { x: 1200, y: 2400, w: 240, d: 240 }, capacity: 10, serves: ['main-house'] } } })
    expect(toEditOp('setUtility', { utilityId: 'estate-well', capacity: 10, serves: [1, 2] })).toMatchObject({ ok: false, error: 'Field "serves" must be array.' })
    const cam = toEditOp('addDevice', { id: 'c1', name: 'Cam', kind: 'camera', xFt: 10, yFt: 20, rangeFt: 100, facingDeg: 90, fovDeg: 60, power: 'solar', onBuilding: null })
    expect(cam).toEqual({ ok: true, op: { op: 'addDevice', device: { id: 'c1', name: 'Cam', kind: 'camera', at: { x: 120, y: 240 }, range: 1200, facing: 90, fov: 60, power: 'solar' } } })
  })
})

describe('security checks', () => {
  const gate = sampleEstate.roads.find(r => r.id === 'estate-drive')!.points[0]

  it('flag a gate with no camera', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'removeDevice', deviceId: 'cam-estate-gate' }, { op: 'removeDevice', deviceId: 'cam-estate-gate-back' }]))
    expect(check(e, 'gate-cameras')).toMatchObject({ status: 'warn', elements: ['estate-drive'] })
    expect(check(e, 'approach-visibility')).toMatchObject({ status: 'warn', elements: ['estate-drive'] })
  })

  it('flag an approach the camera looks away from', () => {
    const e = ok(applyOperations(sampleEstate, [
      { op: 'aimCamera', deviceId: 'cam-estate-gate', facing: 0, fov: 30, range: ft(400) },
      { op: 'removeDevice', deviceId: 'cam-estate-gate-back' },
    ]))
    expect(check(e, 'approach-visibility').status).toBe('warn')
    expect(check(e, 'gate-cameras').status).toBe('pass')
  })

  it('do not see through forest', () => {
    const cam = { id: 'c', name: 'Cam', kind: 'camera' as const, at: { x: gate.x, y: gate.y + ft(5) }, range: ft(2000), facing: 0, fov: 20, power: 'solar' as const }
    // East along the south edge of the parcel: 300 ft of forest in the way.
    expect(sees(sampleEstate, cam, { x: gate.x + ft(300), y: gate.y + ft(5) })).toBe(false)
    expect(sees(sampleEstate, cam, { x: gate.x + ft(40), y: gate.y + ft(5) })).toBe(true)
  })

  it('flag cameras on grid power only', () => {
    const e = ok(applyOperations(sampleEstate, [{ op: 'addDevice', device: { id: 'cam-x', name: 'Test camera', kind: 'camera', at: { x: ft(2400), y: ft(1300) }, range: ft(100), facing: 0, fov: 90, power: 'grid' } }]))
    expect(check(e, 'security-power')).toMatchObject({ status: 'warn', elements: ['cam-x'] })
  })

  it('flag unlit parking and buildings without cameras', () => {
    const lights = sampleEstate.security!.filter(d => d.id.startsWith('light-parking')).map(d => ({ op: 'removeDevice', deviceId: d.id }) as EditOp)
    expect(check(ok(applyOperations(sampleEstate, lights)), 'lighting')).toMatchObject({ status: 'warn', elements: ['parking'] })
    const blind = ok(applyOperations(sampleEstate, [{ op: 'removeDevice', deviceId: 'cam-fuel-sw' }, { op: 'removeDevice', deviceId: 'cam-fuel-ne' }]))
    expect(check(blind, 'building-cameras').elements).toContain('fuel')
  })

  it('check the safe room is inside, windowless, and reachable', () => {
    expect(check(ok(applyOperations(sampleEstate, [{ op: 'setSafeRoom', roomId: 'safe-room', safeRoom: false }])), 'safe-room').detail).toMatch(/no safe room/)
    const gym = check(ok(applyOperations(sampleEstate, [{ op: 'setSafeRoom', roomId: 'gym', safeRoom: true }])), 'safe-room')
    expect(gym).toMatchObject({ status: 'warn', elements: ['gym'] })
    expect(gym.detail).toMatch(/Gym .* opens outside, has framed outside walls/)
  })
})

describe('older saves', () => {
  it('get the sample utilities, security, and occupancy', () => {
    const old = structuredClone(sampleEstate)
    delete old.utilities
    delete old.security
    old.buildings = old.buildings.map(({ beds: _b, staff: _s, backupPower: _p, fuelStorage: _f, loadKw: _l, ...b }) => b)
    const e = withUtilityDefaults(old)
    expect(e.utilities).toEqual(sampleEstate.utilities)
    expect(e.security).toEqual(sampleEstate.security)
    expect(e.buildings).toEqual(sampleEstate.buildings)
    expect(withUtilityDefaults(sampleEstate)).toBe(sampleEstate)
  })

  it('leave out utilities that would land on a moved building', () => {
    const old = structuredClone(sampleEstate)
    delete old.utilities
    // The RV sites were moved onto ground the sample uses for the estate drainfield.
    old.buildings.find(b => b.id === 'rv')!.rect = { x: ft(1920), y: ft(4470), w: ft(70), d: ft(45) }
    expect(withUtilityDefaults(old).utilities!.some(u => u.id === 'estate-septic')).toBe(false)
  })
})

describe('the chat summary', () => {
  it('lists utilities, devices, occupancy, and the safe room', () => {
    const text = summarizeEstate(sampleEstate)
    expect(text).toMatch(/- estate-septic: Estate septic and drainfield, septic, at 1900,4450 size 100x134, 4,000 gallons a day, serves main-house/)
    expect(text).toMatch(/- lodge-1: Lodge 1, .* sleeps 22, 47 kW, on backup power/)
    expect(text).toMatch(/- cam-estate-gate: camera at 1000,0, facing \d+ deg, 60 deg view, 400 ft, solar/)
    expect(text).toMatch(/- safe-room: Safe room, service, .*, safe room/)
    expect(text).toMatch(/Utility rules \(planning values\): waterGpdPerBed 100/)
  })
})
