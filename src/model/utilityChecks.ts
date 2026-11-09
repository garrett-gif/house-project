import type { Building, Check, Estate, Pt, Rect, Utility } from './types'
import { area, footprintOf, ft, pointToRect, rectDistance, samplePath, toFt } from './geometry'
import { roadWidth } from './fireChecks'
import { UTILITY_BASIS, clearedRects, demand, drainfieldNeed, occupancy, systems, utilityRules } from './utilities'

type Bad = { text: string; ids: string[] }
const n = (v: number) => Math.round(v).toLocaleString('en-US')
const warn = (id: string, label: string, bad: Bad[], okDetail: string): Check =>
  bad.length
    ? { id, label, status: 'warn', detail: `${bad.slice(0, 4).map(b => b.text).join('; ')}${bad.length > 4 ? `; and ${bad.length - 4} more` : ''}. ${UTILITY_BASIS}`, elements: [...new Set(bad.flatMap(b => b.ids))] }
    : { id, label, status: 'pass', detail: `${okDetail}. ${UTILITY_BASIS}` }

const inside = (p: Pt, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.d
const toBuilding = (r: Rect, b: Building) => Math.min(...footprintOf(b).map(f => rectDistance(r, f)))

/** Required clearance from a propane tank to buildings, by tank size, after the common NFPA 58 table. */
export const propaneClearanceFt = (gallons: number) => gallons <= 500 ? 10 : gallons <= 2000 ? 25 : gallons <= 30000 ? 50 : 75

export function utilityChecks(e: Estate): Check[] {
  const rules = utilityRules(e)
  const list = e.utilities ?? []
  const of = (kind: Utility['kind']) => list.filter(u => u.kind === kind)
  const sum = (bs: Building[], key: 'waterGpd' | 'sewageGpd' | 'kw') => bs.reduce((s, b) => s + demand(e, b)[key], 0)
  const checks: Check[] = []

  // Every building gets what it needs from some system.
  const servedBy = (kind: Utility['kind'], b: Building) => of(kind).some(u => u.serves.includes(b.id))
  const unserved: Bad[] = e.buildings.flatMap(b => {
    const d = demand(e, b)
    const missing = [
      d.waterGpd > 0 && !servedBy('well', b) ? 'well' : '',
      d.waterGpd > 0 && !servedBy('storage', b) ? 'water storage' : '',
      d.sewageGpd > 0 && !servedBy('septic', b) ? 'septic' : '',
      d.kw > 0 && !servedBy('service', b) ? 'power' : '',
      b.backupPower && !servedBy('generator', b) ? 'backup generator' : '',
    ].filter(Boolean)
    return missing.length ? [{ text: `${b.name} has no ${missing.join(', ')}`, ids: [b.id] }] : []
  })
  const unknown = list.flatMap(u => u.serves.filter(id => !e.buildings.some(b => b.id === id)).map(id => ({ text: `${u.name} serves a building that is not on the site (${id})`, ids: [u.id] })))
  const people = e.buildings.reduce((s, b) => { const o = occupancy(e, b); return { beds: s.beds + o.beds, staff: s.staff + o.staff } }, { beds: 0, staff: 0 })
  checks.push(warn('utility-coverage', 'Every building has water, septic, and power', [...unserved, ...unknown], `${n(people.beds)} people sleeping and ${n(people.staff)} more by day are all served`))

  // Water: wells pumping part of the day, and a day of storage.
  const water: Bad[] = []
  for (const s of systems(e, 'well')) {
    const need = sum(s.buildings, 'waterGpd'), have = s.capacity * 60 * rules.wellPumpHours
    if (have < need) water.push({ text: `${s.utilities.map(u => u.name).join(' and ')}: ${n(s.capacity)} gpm gives ${n(have)} gallons in ${rules.wellPumpHours} hours, ${n(need)} needed`, ids: s.utilities.map(u => u.id) })
  }
  for (const s of systems(e, 'storage')) {
    const need = sum(s.buildings, 'waterGpd') * rules.storageDays
    if (s.capacity < need) water.push({ text: `${s.utilities.map(u => u.name).join(' and ')}: ${n(s.capacity)} gallons stored, ${n(need)} needed`, ids: s.utilities.map(u => u.id) })
  }
  const waterNeed = sum(e.buildings, 'waterGpd')
  checks.push(warn('water-supply', 'Wells and storage meet peak water demand', water, `${n(waterNeed)} gallons a day at peak, from ${of('well').length} wells and ${n(of('storage').reduce((s, u) => s + u.capacity, 0))} gallons of storage`))

  // Septic: design flow covers the sewage, and each drainfield is big enough for its flow.
  const septic: Bad[] = []
  for (const s of systems(e, 'septic')) {
    const need = sum(s.buildings, 'sewageGpd')
    if (s.capacity < need) septic.push({ text: `${s.utilities.map(u => u.name).join(' and ')}: designed for ${n(s.capacity)} gallons a day, ${n(need)} expected`, ids: s.utilities.map(u => u.id) })
  }
  for (const u of of('septic')) {
    const need = drainfieldNeed(e, u), have = area(u.rect) / 144
    if (have < need) septic.push({ text: `${u.name}: ${n(have)} sq ft of drainfield, ${n(need)} needed for ${n(u.capacity)} gallons a day with a reserve field`, ids: [u.id] })
  }
  checks.push(warn('septic-capacity', 'Septic systems and drainfields fit the sewage flow', septic, `${n(sum(e.buildings, 'sewageGpd'))} gallons a day at peak across ${of('septic').length} systems`))

  // Power.
  const power: Bad[] = []
  for (const s of systems(e, 'service')) {
    const need = sum(s.buildings, 'kw')
    if (s.capacity < need) power.push({ text: `${s.utilities.map(u => u.name).join(' and ')}: ${n(s.capacity)} kW for ${n(need)} kW of load`, ids: s.utilities.map(u => u.id) })
  }
  const solar = of('solar').reduce((s, u) => s + u.capacity, 0), load = sum(e.buildings, 'kw')
  checks.push(warn('power-capacity', 'Grid service meets peak electrical demand', power, `${n(load)} kW peak; ${n(solar)} kW of solar, about ${Math.round(solar / Math.max(load, 1) * 100)}% of peak`))

  const backup: Bad[] = []
  for (const s of systems(e, 'generator')) {
    const need = sum(s.buildings, 'kw') * rules.backupShare
    if (s.capacity < need) backup.push({ text: `${s.utilities.map(u => u.name).join(' and ')}: ${n(s.capacity)} kW for ${n(need)} kW (${Math.round(rules.backupShare * 100)}% of the load it backs up)`, ids: s.utilities.map(u => u.id) })
  }
  checks.push(warn('backup-power', 'Generators carry the buildings they back up', backup, `${of('generator').length} generators, ${n(of('generator').reduce((s, u) => s + u.capacity, 0))} kW`))

  // Separation distances.
  const sep: Bad[] = []
  const parcel: Rect = { x: 0, y: 0, w: e.parcel.size, d: e.parcel.size }
  for (const u of list) {
    if (u.rect.x < 0 || u.rect.y < 0 || u.rect.x + u.rect.w > parcel.w || u.rect.y + u.rect.d > parcel.d) sep.push({ text: `${u.name} is outside the parcel`, ids: [u.id] })
  }
  for (const w of of('well')) {
    for (const s of of('septic')) {
      const d = rectDistance(w.rect, s.rect)
      if (d < ft(rules.wellToSepticFt)) sep.push({ text: `${w.name} is ${n(toFt(d))} ft from ${s.name}, under ${rules.wellToSepticFt} ft`, ids: [w.id, s.id] })
    }
    for (const b of e.buildings.filter(b => b.fuelStorage)) {
      const d = toBuilding(w.rect, b)
      if (d < ft(rules.wellToFuelFt)) sep.push({ text: `${w.name} is ${n(toFt(d))} ft from fuel at ${b.name}, under ${rules.wellToFuelFt} ft`, ids: [w.id, b.id] })
    }
  }
  const roadSamples = e.roads.map(r => ({ r, pts: samplePath(r.points, ft(10)) }))
  for (const s of of('septic')) {
    for (const b of e.buildings) {
      const d = toBuilding(s.rect, b)
      if (d < ft(rules.septicToBuildingFt)) sep.push({ text: `${s.name} is ${n(toFt(d))} ft from ${b.name}, under ${rules.septicToBuildingFt} ft`, ids: [s.id, b.id] })
    }
    for (const z of e.zones.filter(z => z.kind === 'water')) {
      const d = rectDistance(s.rect, z.rect)
      if (d < ft(rules.septicToWaterFt)) sep.push({ text: `${s.name} is ${n(toFt(d))} ft from ${z.name}, under ${rules.septicToWaterFt} ft`, ids: [s.id, z.id] })
    }
    const under = roadSamples.filter(({ r, pts }) => pts.some(p => pointToRect(p, s.rect) < roadWidth(r) / 2)).map(({ r }) => r)
    const paved = e.zones.filter(z => z.hardstand && rectDistance(z.rect, s.rect) === 0 && area(z.rect) > 0)
    for (const x of [...under, ...paved]) sep.push({ text: `${s.name} runs under ${x.name}; drainfields need open, undriven ground`, ids: [s.id, x.id] })
  }
  for (const t of of('propane')) {
    const need = propaneClearanceFt(t.capacity)
    for (const b of e.buildings) {
      const d = toBuilding(t.rect, b)
      if (d < ft(need)) sep.push({ text: `${t.name} (${n(t.capacity)} gallons) is ${n(toFt(d))} ft from ${b.name}, under ${need} ft`, ids: [t.id, b.id] })
    }
  }
  checks.push(warn('utility-separation', 'Wells, septic, and propane keep their distances', sep,
    `Wells ${rules.wellToSepticFt} ft from septic and ${rules.wellToFuelFt} ft from fuel, drainfields ${rules.septicToBuildingFt} ft from buildings and ${rules.septicToWaterFt} ft from surface water and off roads, propane by tank size`))

  // Sun: open ground to the south of each array, so trees do not shade it.
  const open = clearedRects(e)
  const shaded: Bad[] = of('solar').flatMap(u => {
    const band: Rect = { x: u.rect.x, y: u.rect.y - ft(rules.solarShadeFt), w: u.rect.w, d: ft(rules.solarShadeFt) }
    const pts: Pt[] = []
    for (let x = band.x; x <= band.x + band.w; x += ft(20)) for (let y = band.y; y < band.y + band.d; y += ft(20)) pts.push({ x, y })
    const inParcel = pts.filter(p => inside(p, parcel))
    const blocked = inParcel.filter(p => !open.some(r => inside(p, r))).length / Math.max(inParcel.length, 1)
    return blocked > 0.05 ? [{ text: `${u.name}: ${Math.round(blocked * 100)}% of the ground within ${rules.solarShadeFt} ft to the south is forest`, ids: [u.id] }] : []
  })
  checks.push(warn('solar-sun', 'Solar arrays have open ground to the south', shaded, `${of('solar').length} arrays with ${rules.solarShadeFt} ft of open ground to the south`))

  // Runs where length matters: sewer lines to a drainfield, generator feeders, and propane lines, each from a
  // building to the nearest unit of the system that serves it. Water mains and grid power are networks and are left out.
  let trench = 0
  const long: Bad[] = []
  for (const kind of ['septic', 'generator', 'propane'] as const) for (const s of systems(e, kind)) for (const b of s.buildings) {
    const nearest = s.utilities.map(u => ({ u, d: toBuilding(u.rect, b) })).sort((x, y) => x.d - y.d)[0]
    trench += nearest.d
    if (nearest.d > ft(rules.maxTrenchFt)) long.push({ text: `${nearest.u.name} to ${b.name}: ${n(toFt(nearest.d))} ft`, ids: [nearest.u.id, b.id] })
  }
  checks.push(warn('trench-length', `Sewer, generator, and propane runs are ${n(rules.maxTrenchFt)} ft or shorter`, long, `About ${n(toFt(trench))} ft of these runs, measured straight`))

  // Parking for everyone there by day.
  const spaces = e.zones.filter(z => z.parking).reduce((s, z) => s + area(z.rect) / 144 / rules.sqFtPerParkingSpace, 0)
  const parkers = e.buildings.filter(b => b.access !== 'private').reduce((s, b) => s + occupancy(e, b).staff, 0)
  checks.push(warn('parking', 'Parking for every daytime worker and visitor', spaces >= parkers ? [] : [{ text: `About ${n(spaces)} spaces for ${n(parkers)} people`, ids: e.zones.filter(z => z.parking).map(z => z.id) }],
    `About ${n(spaces)} spaces at ${rules.sqFtPerParkingSpace} sq ft each for ${n(parkers)} people`))
  return checks
}
