import type { Check, Estate, Pt, Rect, SecurityDevice } from './types'
import { ft, partsOf, samplePath, toFt } from './geometry'
import { ring, roadWidth } from './fireChecks'
import { UTILITY_BASIS, clearedRects, utilityRules } from './utilities'
import { levelWalls, placeOpenings } from './walls'

type Bad = { text: string; ids: string[] }
const BASIS = UTILITY_BASIS.replace('state and county rules, soil and well tests', 'a security consultant’s plan')
const warn = (id: string, label: string, bad: Bad[], okDetail: string): Check =>
  bad.length
    ? { id, label, status: 'warn', detail: `${bad.slice(0, 4).map(b => b.text).join('; ')}${bad.length > 4 ? `; and ${bad.length - 4} more` : ''}. ${BASIS}`, elements: [...new Set(bad.flatMap(b => b.ids))] }
    : { id, label, status: 'pass', detail: `${okDetail}. ${BASIS}` }

const CELL = ft(20)
const cache = new WeakMap<Estate, (p: Pt) => boolean>()

/**
 * Whether a point is open ground a camera can see across: cleared or thinned land, utilities, roads, the airstrip,
 * or outside the parcel. Anything else is forest. Built once per estate as a 20 ft grid.
 */
export function openGround(e: Estate): (p: Pt) => boolean {
  const hit = cache.get(e)
  if (hit) return hit
  const cells = Math.ceil(e.parcel.size / CELL)
  const grid = new Uint8Array(cells * cells)
  const fill = (r: Rect) => {
    const x0 = Math.max(0, Math.floor(r.x / CELL)), x1 = Math.min(cells - 1, Math.floor((r.x + r.w) / CELL))
    const y0 = Math.max(0, Math.floor(r.y / CELL)), y1 = Math.min(cells - 1, Math.floor((r.y + r.d) / CELL))
    for (let y = y0; y <= y1; y++) grid.fill(1, y * cells + x0, y * cells + x1 + 1)
  }
  for (const r of clearedRects(e)) fill(r)
  for (const z of e.zones.filter(z => z.kind === 'fuelbreak' || z.hardstand)) fill(z.rect)
  fill(e.runway.rect)
  for (const r of e.roads) {
    const half = roadWidth(r) / 2
    for (const p of samplePath(r.points, CELL / 2)) fill({ x: p.x - half, y: p.y - half, w: 2 * half, d: 2 * half })
  }
  const open = (p: Pt) => {
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL)
    return cx < 0 || cy < 0 || cx >= cells || cy >= cells || grid[cy * cells + cx] === 1
  }
  cache.set(e, open)
  return open
}

/** Angle from a to b in degrees, 0 east, 90 north. */
const bearing = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
const turn = (a: number, b: number) => Math.abs(((a - b) % 360 + 540) % 360 - 180)

/** Whether a camera sees a point: in range, inside its view, and not looking through more forest than the rule allows. */
export function sees(e: Estate, cam: SecurityDevice, p: Pt) {
  const d = Math.hypot(p.x - cam.at.x, p.y - cam.at.y)
  if (d > cam.range) return false
  if (d > ft(1) && turn(bearing(cam.at, p), cam.facing ?? 0) > (cam.fov ?? 360) / 2 + 1) return false
  const open = openGround(e)
  const steps = Math.ceil(d / ft(10))
  let forest = 0
  for (let i = 1; i < steps; i++) if (!open({ x: cam.at.x + (p.x - cam.at.x) * i / steps, y: cam.at.y + (p.y - cam.at.y) * i / steps })) forest += ft(10)
  return forest <= ft(utilityRules(e).cameraForestFt)
}

export const lit = (light: SecurityDevice, p: Pt) => Math.hypot(p.x - light.at.x, p.y - light.at.y) <= light.range

const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, d: r.d + 2 * by })

export function securityChecks(e: Estate): Check[] {
  const rules = utilityRules(e)
  const devices = e.security ?? []
  const cameras = devices.filter(d => d.kind === 'camera'), lights = devices.filter(d => d.kind === 'light')
  const seen = (p: Pt) => cameras.some(c => sees(e, c, p))
  const checks: Check[] = []
  const gates = e.roads.filter(r => r.gate)

  // Gates and the approach to them.
  const gateGaps: Bad[] = gates.flatMap(r => seen(r.points[0]) ? [] : [{ text: `${r.gate} has no camera on it`, ids: [r.id] }])
  checks.push(warn('gate-cameras', 'A camera watches every gate', gateGaps, `${gates.length} gates covered`))

  const approach: Bad[] = gates.flatMap(r => {
    const pts: Pt[] = []
    let walked = 0
    for (const p of samplePath(r.points, ft(20))) {
      if (pts.length) walked += Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y)
      if (walked > ft(rules.approachFt)) break
      pts.push(p)
    }
    const share = pts.filter(seen).length / pts.length
    return share < 0.9 ? [{ text: `${r.name}: ${Math.round(share * 100)}% of the first ${rules.approachFt} ft inside ${r.gate} is on camera`, ids: [r.id] }] : []
  })
  checks.push(warn('approach-visibility', `The first ${rules.approachFt} ft inside each gate is on camera`, approach, `${gates.length} approaches covered`))

  // Buildings: at least a quarter of the ground just outside the walls is on camera.
  const ringOf = (b: Estate['buildings'][number]) => partsOf(b).flatMap(r => ring(grow(r, ft(10)), ft(20)))
  const blind: Bad[] = e.buildings.flatMap(b => {
    const pts = ringOf(b)
    const share = pts.filter(seen).length / pts.length
    return share < 0.25 ? [{ text: `${b.name}: ${Math.round(share * 100)}% of its outside walls on camera`, ids: [b.id] }] : []
  })
  checks.push(warn('building-cameras', 'Cameras see the outside of every building', blind, `${cameras.length} cameras cover every building`))

  // Lighting: gates, work and visitor buildings, and parking. The private estate stays dark by design.
  const dark: Bad[] = []
  for (const r of gates) if (!lights.some(l => lit(l, r.points[0]))) dark.push({ text: `${r.gate} is unlit`, ids: [r.id] })
  for (const b of e.buildings.filter(b => b.access !== 'private')) {
    const pts = ringOf(b)
    const share = pts.filter(p => lights.some(l => lit(l, p))).length / pts.length
    if (share < 0.25) dark.push({ text: `${b.name}: ${Math.round(share * 100)}% of its outside walls lit`, ids: [b.id] })
  }
  for (const z of e.zones.filter(z => z.parking)) {
    const pts: Pt[] = []
    for (let x = z.rect.x + ft(10); x < z.rect.x + z.rect.w; x += ft(40)) for (let y = z.rect.y + ft(10); y < z.rect.y + z.rect.d; y += ft(40)) pts.push({ x, y })
    const share = pts.filter(p => lights.some(l => lit(l, p))).length / Math.max(pts.length, 1)
    if (share < 0.8) dark.push({ text: `${z.name}: ${Math.round(share * 100)}% lit`, ids: [z.id] })
  }
  checks.push(warn('lighting', 'Gates, work buildings, and parking are lit', dark, `${lights.length} lights; the private estate is left dark on purpose`))

  // Power: cameras and gate lights keep working in an outage.
  const backed = [...(e.utilities ?? []).filter(u => u.kind === 'generator').map(u => u.rect), ...e.buildings.filter(b => b.backupPower).flatMap(b => partsOf(b))]
  const feed = ft(rules.backupFeedFt)
  const near = (p: Pt) => backed.some(r => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.d)) <= feed)
  const atGate = (d: SecurityDevice) => gates.some(r => Math.hypot(r.points[0].x - d.at.x, r.points[0].y - d.at.y) <= ft(100))
  const outage: Bad[] = devices.filter(d => d.kind === 'camera' || atGate(d)).flatMap(d =>
    d.power === 'grid' ? [{ text: `${d.name} is on grid power only`, ids: [d.id] }]
      : d.power === 'backup' && !near(d.at) ? [{ text: `${d.name} is more than ${rules.backupFeedFt.toLocaleString('en-US')} ft from a generator`, ids: [d.id] }] : [])
  checks.push(warn('security-power', 'Cameras and gates keep power in an outage', outage, `${cameras.length} cameras on backup or solar power`))

  // Safe room in the main house: no windows, no door outside, no framed outside walls.
  const placed = placeOpenings(e.house)
  const safe = e.house.levels.flatMap(l => l.rooms.filter(r => r.safeRoom).map(r => ({ l, r })))
  const unsafe: Bad[] = safe.flatMap(({ l, r }) => {
    const touching = placed.filter(o => !o.problem && (o.roomId === r.id || o.leadsTo === r.id))
    const walls = levelWalls(e.house, l).filter(s => s.sides.includes(r.id))
    const issues = [
      touching.some(o => o.kind === 'window') ? 'has windows' : '',
      touching.some(o => o.kind !== 'window' && o.roomId === r.id && o.leadsTo === 'outside') ? 'opens outside' : '',
      walls.some(s => s.kind === 'exterior') ? 'has framed outside walls' : '',
      touching.some(o => o.kind === 'door') ? '' : 'has no door from inside the house',
    ].filter(Boolean)
    return issues.length ? [{ text: `${r.name} ${issues.join(', ')}`, ids: [r.id] }] : []
  })
  if (!safe.length) unsafe.push({ text: 'The main house has no safe room', ids: [] })
  const where = safe.map(({ l, r }) => `${r.name} on the ${l.name.toLowerCase()}, ${Math.round(toFt(r.rect.w))} x ${Math.round(toFt(r.rect.d))} ft`).join('; ')
  checks.push(warn('safe-room', 'The main house has a safe room', unsafe, `${where}, inside the house with no windows and no framed outside walls`))
  return checks
}
