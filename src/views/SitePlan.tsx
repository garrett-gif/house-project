import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { EditOp } from '../model/edits'
import { buildingDragOp } from '../ui/dragOps'
import type { Estate, RoadKind, SecurityDevice, UtilityKind, ZoneKind } from '../model/types'
import { center, footprintOf, ft, partsOf, toFt } from '../model/geometry'
import { fireRules, roadWidth } from '../model/fireChecks'
import { UTILITY_UNIT } from '../model/utilities'

const FOCUS = {
  'Whole property': [0, 0, 6600, 6600],
  Estate: [150, 3500, 2500, 2500],
  Compound: [1800, 100, 4700, 2300],
} as const
type Focus = keyof typeof FOCUS

const ZONE: Record<ZoneKind, string> = {
  fuelbreak: '#b9c99b', estate: '#dfe3c4', recreation: '#d5c7a6', operations: '#d9d0c0', lodging: '#e2d3bd',
  training: '#c9c58f', aviation: '#d8d8d2', incident: '#d0cbc0', water: '#9cc3d5',
}
const ROAD: Record<RoadKind, [string, number, string?]> = {
  estate: ['#6d6455', 22], work: ['#55524c', 26], perimeter: ['#8d8473', 14, '50 28'], 'gated-link': ['#a4542f', 16, '18 24'],
}
const BUILDING = { private: '#2f6f62', work: '#a65a35', visitor: '#a65a35', shared: '#66635c' }
const FLAG = { fail: '#c0262d', warn: '#c98a14' }
const UTILITY: Record<UtilityKind, string> = {
  well: '#1f5fa0', storage: '#5b8fc7', septic: '#8a6d3b', service: '#6b4fa0', solar: '#2b3a55', generator: '#b5402a', propane: '#d08a1f',
}
/** Kinds whose runs to each building are drawn: the rest feed networks. */
const RUNS: UtilityKind[] = ['septic', 'generator', 'propane']

/** `flagged` maps ids of elements named by checks that do not pass to how badly: red for fail, amber for warn. */
export function SitePlan({ estate, flagged = new Map(), onDrag, onDrop }: { estate: Estate; flagged?: ReadonlyMap<string, 'warn' | 'fail'>; onDrag?: (op: EditOp | null) => void; onDrop?: (op: EditOp | null) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ start: [number, number]; building: Estate['buildings'][number]; op: EditOp | null } | null>(null)
  const editable = !!onDrag && !!onDrop
  /** Pointer position in site inches, y north. */
  const toSite = (e: { clientX: number; clientY: number }): [number, number] => {
    const el = svg.current!, pt = el.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(el.getScreenCTM()!.inverse())
    return [ft(p.x), ft(6600 - p.y)]
  }
  const begin = (e: ReactPointerEvent, building: Estate['buildings'][number]) => {
    if (!editable || e.button !== 0) return
    e.preventDefault()
    drag.current = { start: toSite(e), building, op: null }
    svg.current!.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const [x, y] = toSite(e)
    d.op = buildingDragOp(d.building, x - d.start[0], y - d.start[1])
    onDrag!(d.op)
  }
  const end = (cancel: boolean) => { const d = drag.current; drag.current = null; if (d) onDrop!(cancel ? null : d.op) }
  const flagColor = (id: string) => FLAG[flagged.get(id) ?? 'fail']
  const [focus, setFocus] = useState<Focus>('Whole property')
  const [hover, setHover] = useState<string | null>(null)
  const [fire, setFire] = useState(false)
  const [utilities, setUtilities] = useState(false)
  const [security, setSecurity] = useState(false)
  const rules = fireRules(estate)
  const [vx, vy, vw, vh] = FOCUS[focus]
  const S = 6600
  const Y = (y: number) => S - toFt(y)
  const scale = vw / 660
  const label = 11 * scale
  const pts = (list: { x: number; y: number }[]) => list.map(q => `${toFt(q.x)},${Y(q.y)}`).join(' ')
  const showLabels = focus !== 'Whole property'

  return (
    <div className="plan">
      <div className="plan-tools" role="group" aria-label="Map focus">
        {(Object.keys(FOCUS) as Focus[]).map(f => <button key={f} className={f === focus ? 'active' : ''} onClick={() => setFocus(f)}>{f}</button>)}
        <button className={fire ? 'active' : ''} onClick={() => setFire(v => !v)} aria-pressed={fire} title="Defensible space and fire water">Fire layer</button>
        <button className={utilities ? 'active' : ''} onClick={() => setUtilities(v => !v)} aria-pressed={utilities} title="Wells, septic, power, solar, generators, propane">Utilities</button>
        <button className={security ? 'active' : ''} onClick={() => setSecurity(v => !v)} aria-pressed={security} title="Cameras and lights">Security</button>
        <span className="hover">{hover ?? 'Hover a building for its name'}</span>
      </div>
      <svg ref={svg} viewBox={`${vx} ${S - vy - vh} ${vw} ${vh}`} role="img" aria-label="Site plan of the 1,000-acre estate and compound"
        onPointerMove={move} onPointerUp={() => end(false)} onPointerCancel={() => end(true)} style={{ touchAction: editable ? 'none' : undefined }}>
        <rect x="0" y="0" width={S} height={S} fill="#a9bb8c" />
        {estate.zones.map(z => {
          const x = toFt(z.rect.x), w = toFt(z.rect.w), d = toFt(z.rect.d), y = Y(z.rect.y) - d
          const dashed = z.kind === 'fuelbreak'
          return z.round
            ? <ellipse key={z.id} cx={x + w / 2} cy={y + d / 2} rx={w / 2} ry={d / 2} fill={ZONE[z.kind]} stroke={flagged.has(z.id) ? flagColor(z.id) : '#7b7464'} strokeWidth={scale * (flagged.has(z.id) ? 3 : 1)} onMouseEnter={() => setHover(z.name)} />
            : <rect key={z.id} x={x} y={y} width={w} height={d} fill={ZONE[z.kind]} fillOpacity={dashed ? 0.55 : 0.9} stroke={flagged.has(z.id) ? flagColor(z.id) : dashed ? '#55702f' : '#8c8473'} strokeWidth={scale * (flagged.has(z.id) ? 3 : dashed ? 2 : 1)} strokeDasharray={dashed ? `${12 * scale} ${8 * scale}` : undefined} onMouseEnter={() => setHover(z.name)} />
        })}
        {estate.walkways.map(w => <polyline key={w.id} points={pts(w.points)} fill="none" stroke={flagged.has(w.id) ? flagColor(w.id) : '#2f6f62'} strokeWidth={Math.max(flagged.has(w.id) ? 14 : 8, (flagged.has(w.id) ? 4 : 2) * scale)} onMouseEnter={() => setHover(w.name)} />)}
        {estate.roads.map(r => {
          const [color, , dash] = ROAD[r.kind]
          const stroke = flagged.has(r.id) ? flagColor(r.id) : color
          return <polyline key={r.id} points={pts(r.points)} fill="none" stroke={stroke} strokeWidth={Math.max(toFt(roadWidth(r)), 2 * scale)} strokeDasharray={dash} strokeLinejoin="round" onMouseEnter={() => setHover(`${r.name}, ${Math.round(toFt(roadWidth(r)))} ft wide${r.turnaround ? ', turnaround at end' : ''}`)} />
        })}
        <rect x={toFt(estate.runway.rect.x)} y={Y(estate.runway.rect.y) - toFt(estate.runway.rect.d)} width={toFt(estate.runway.rect.w)} height={toFt(estate.runway.rect.d)} fill="#46443f" onMouseEnter={() => setHover(estate.runway.name)} />
        {estate.buildings.map(b => {
          const x = toFt(b.rect.x), w = toFt(b.rect.w), d = toFt(b.rect.d), y = Y(b.rect.y) - d
          return (
            <g key={b.id} onMouseEnter={() => setHover(b.name)} onPointerDown={editable ? e => begin(e, b) : undefined} style={editable ? { cursor: 'move' } : undefined}>
              {b.footprint && footprintOf(b).map((part, i) => <rect key={`f${i}`} x={toFt(part.x)} y={Y(part.y) - toFt(part.d)} width={toFt(part.w)} height={toFt(part.d)} fill={BUILDING[b.access]} fillOpacity={0.3} />)}
              {partsOf(b).map((part, i) => <rect key={i} x={toFt(part.x)} y={Y(part.y) - toFt(part.d)} width={toFt(part.w)} height={toFt(part.d)} fill={BUILDING[b.access]} />)}
              {flagged.has(b.id) && footprintOf(b).map((part, i) => <rect key={`x${i}`} x={toFt(part.x)} y={Y(part.y) - toFt(part.d)} width={toFt(part.w)} height={toFt(part.d)} fill="none" stroke={flagColor(b.id)} strokeWidth={Math.max(4, 2 * scale)} />)}
              {showLabels && <text x={x + w / 2} y={y - 5 * scale} fontSize={label} textAnchor="middle" className="site-label">{b.name}</text>}
            </g>
          )
        })}
        {fire && estate.buildings.flatMap(b => partsOf(b).flatMap((part, i) => [rules.zones[1], rules.zones[2]].map((dist, k) => {
          const by = ft(dist)
          return <rect key={`${b.id}-z${i}-${k}`} x={toFt(part.x - by)} y={Y(part.y + part.d + by)} width={toFt(part.w + 2 * by)} height={toFt(part.d + 2 * by)} fill="none" stroke={k === 0 ? '#c0262d' : '#e07b1a'} strokeWidth={Math.max(1.5, scale)} strokeDasharray={`${6 * scale} ${4 * scale}`} pointerEvents="none" />
        })))}
        {fire && (estate.waterSources ?? []).map(w => (
          <g key={w.id} onMouseEnter={() => setHover(`${w.name}, ${w.gallons.toLocaleString('en-US')} gallons`)}>
            <circle cx={toFt(w.at.x)} cy={Y(w.at.y)} r={Math.max(14, 6 * scale)} fill="#2d78b8" stroke="#fff" strokeWidth={Math.max(2, scale)} />
            {showLabels && <text x={toFt(w.at.x)} y={Y(w.at.y) + 18 * scale} fontSize={label * 0.85} textAnchor="middle" className="site-label">{(w.gallons / 1000).toLocaleString('en-US')}k gal</text>}
          </g>
        ))}
        {fire && estate.roads.filter(r => r.turnaround).map(r => {
          const end = r.points[r.points.length - 1]
          return <circle key={`t-${r.id}`} cx={toFt(end.x)} cy={Y(end.y)} r={48} fill="none" stroke="#55524c" strokeWidth={Math.max(3, scale)} pointerEvents="none" />
        })}
        {utilities && (estate.utilities ?? []).flatMap(u => RUNS.includes(u.kind) ? u.serves.flatMap(id => {
          const b = estate.buildings.find(x => x.id === id)
          if (!b) return []
          const a = center(u.rect), c = center(b.rect)
          return [<line key={`run-${u.id}-${id}`} x1={toFt(a.x)} y1={Y(a.y)} x2={toFt(c.x)} y2={Y(c.y)} stroke={UTILITY[u.kind]} strokeWidth={Math.max(1.5, 0.8 * scale)} strokeDasharray={`${5 * scale} ${4 * scale}`} opacity={0.7} pointerEvents="none" />]
        }) : [])}
        {utilities && (estate.utilities ?? []).map(u => {
          const x = toFt(u.rect.x), w = toFt(u.rect.w), d = toFt(u.rect.d), y = Y(u.rect.y) - d
          const small = Math.max(w, d) < 6 * scale
          return (
            <g key={u.id} onMouseEnter={() => setHover(`${u.name}, ${u.capacity.toLocaleString('en-US')} ${UTILITY_UNIT[u.kind]}`)}>
              {small
                ? <circle cx={x + w / 2} cy={y + d / 2} r={Math.max(10, 4 * scale)} fill={UTILITY[u.kind]} stroke={flagged.has(u.id) ? flagColor(u.id) : '#fff'} strokeWidth={Math.max(2, (flagged.has(u.id) ? 2 : 0.8) * scale)} />
                : <rect x={x} y={y} width={w} height={d} fill={UTILITY[u.kind]} fillOpacity={u.kind === 'septic' ? 0.45 : 0.85} stroke={flagged.has(u.id) ? flagColor(u.id) : UTILITY[u.kind]} strokeWidth={Math.max(2, (flagged.has(u.id) ? 3 : 1) * scale)} />}
              {showLabels && <text x={x + w / 2} y={y - 4 * scale} fontSize={label * 0.8} textAnchor="middle" className="site-label">{u.name}</text>}
            </g>
          )
        })}
        {security && (estate.security ?? []).map(d => <Device key={d.id} d={d} Y={Y} scale={scale} flag={flagged.has(d.id) ? flagColor(d.id) : undefined} onHover={setHover} />)}
        {showLabels && estate.zones.filter(z => ['kart-track', 'training', 'incident-camp', 'pond', 'parking', 'equipment-yard'].includes(z.id)).map(z => (
          <text key={z.id} x={toFt(z.rect.x + z.rect.w / 2)} y={Y(z.rect.y + z.rect.d / 2)} fontSize={label} textAnchor="middle" className="site-label">{z.name}</text>
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ background: BUILDING.private }} />Private</span>
        <span><i style={{ background: BUILDING.work }} />Work and visitor</span>
        <span><i style={{ background: BUILDING.shared }} />Shared aviation</span>
        <span><i style={{ background: '#a4542f' }} />Gated link</span>
        <span><i style={{ background: BUILDING.private, opacity: 0.3 }} />Below grade only</span>
        <span><i style={{ background: 'none', outline: `2px solid ${FLAG.fail}`, outlineOffset: -2 }} />Failing check</span>
        <span><i style={{ background: 'none', outline: `2px solid ${FLAG.warn}`, outlineOffset: -2 }} />Warning</span>
        {fire && <span><i style={{ background: 'none', outline: '2px dashed #c0262d', outlineOffset: -2 }} />{rules.zones[1]} ft zone</span>}
        {fire && <span><i style={{ background: 'none', outline: '2px dashed #e07b1a', outlineOffset: -2 }} />{rules.zones[2]} ft zone</span>}
        {fire && <span><i style={{ background: '#2d78b8', borderRadius: '50%' }} />Fire water</span>}
        {fire && <span><i style={{ background: 'none', outline: '2px solid #55524c', borderRadius: '50%', outlineOffset: -2 }} />Turnaround</span>}
        {utilities && (Object.keys(UTILITY) as UtilityKind[]).map(k => <span key={k}><i style={{ background: UTILITY[k] }} />{k === 'service' ? 'Power service' : k[0].toUpperCase() + k.slice(1)}</span>)}
        {security && <span><i style={{ background: 'rgba(192,38,45,0.25)', outline: '1px solid #c0262d', outlineOffset: -1 }} />Camera view</span>}
        {security && <span><i style={{ background: 'rgba(240,200,60,0.35)', borderRadius: '50%' }} />Light</span>}
        <span>North is up · building sizes are placeholders{editable ? ' · drag a building to move it' : ''}</span>
      </div>
    </div>
  )
}

/** A camera's view as a wedge, or a light's reach as a circle. */
function Device({ d, Y, scale, flag, onHover }: { d: SecurityDevice; Y: (y: number) => number; scale: number; flag?: string; onHover: (text: string) => void }) {
  const cx = toFt(d.at.x), cy = Y(d.at.y), r = toFt(d.range)
  const hover = () => onHover(`${d.name}, ${Math.round(r)} ft, ${d.power === 'grid' ? 'grid power only' : d.power === 'backup' ? 'on backup power' : 'solar and battery'}`)
  if (d.kind === 'light') {
    return <circle cx={cx} cy={cy} r={r} fill="rgba(240,200,60,0.22)" stroke={flag ?? 'rgba(200,150,20,0.5)'} strokeWidth={Math.max(1, (flag ? 3 : 0.5) * scale)} onMouseEnter={hover} />
  }
  const fov = Math.min(d.fov ?? 360, 359.9), a0 = ((d.facing ?? 0) - fov / 2) * Math.PI / 180, a1 = ((d.facing ?? 0) + fov / 2) * Math.PI / 180
  const p0 = [cx + r * Math.cos(a0), cy - r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy - r * Math.sin(a1)]
  return (
    <g onMouseEnter={hover}>
      <path d={`M ${cx} ${cy} L ${p0[0]} ${p0[1]} A ${r} ${r} 0 ${fov > 180 ? 1 : 0} 0 ${p1[0]} ${p1[1]} Z`} fill="rgba(192,38,45,0.12)" stroke={flag ?? 'rgba(192,38,45,0.45)'} strokeWidth={Math.max(1, (flag ? 3 : 0.5) * scale)} />
      <circle cx={cx} cy={cy} r={Math.max(6, 2.5 * scale)} fill="#c0262d" stroke="#fff" strokeWidth={Math.max(1, 0.5 * scale)} />
    </g>
  )
}
