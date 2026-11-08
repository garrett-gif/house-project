import { useState } from 'react'
import type { Estate, RoadKind, ZoneKind } from '../model/types'
import { partsOf, toFt } from '../model/geometry'

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

export function SitePlan({ estate }: { estate: Estate }) {
  const [focus, setFocus] = useState<Focus>('Whole property')
  const [hover, setHover] = useState<string | null>(null)
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
        <span className="hover">{hover ?? 'Hover a building for its name'}</span>
      </div>
      <svg viewBox={`${vx} ${S - vy - vh} ${vw} ${vh}`} role="img" aria-label="Site plan of the 1,000-acre estate and compound">
        <rect x="0" y="0" width={S} height={S} fill="#a9bb8c" />
        {estate.zones.map(z => {
          const x = toFt(z.rect.x), w = toFt(z.rect.w), d = toFt(z.rect.d), y = Y(z.rect.y) - d
          const dashed = z.kind === 'fuelbreak'
          return z.round
            ? <ellipse key={z.id} cx={x + w / 2} cy={y + d / 2} rx={w / 2} ry={d / 2} fill={ZONE[z.kind]} stroke="#7b7464" strokeWidth={scale} onMouseEnter={() => setHover(z.name)} />
            : <rect key={z.id} x={x} y={y} width={w} height={d} fill={ZONE[z.kind]} fillOpacity={dashed ? 0.55 : 0.9} stroke={dashed ? '#55702f' : '#8c8473'} strokeWidth={scale * (dashed ? 2 : 1)} strokeDasharray={dashed ? `${12 * scale} ${8 * scale}` : undefined} onMouseEnter={() => setHover(z.name)} />
        })}
        {estate.walkways.map(w => <polyline key={w.id} points={pts(w.points)} fill="none" stroke="#2f6f62" strokeWidth={Math.max(8, 2 * scale)} onMouseEnter={() => setHover(w.name)} />)}
        {estate.roads.map(r => {
          const [color, width, dash] = ROAD[r.kind]
          return <polyline key={r.id} points={pts(r.points)} fill="none" stroke={color} strokeWidth={Math.max(width, 2 * scale)} strokeDasharray={dash} strokeLinejoin="round" onMouseEnter={() => setHover(r.name)} />
        })}
        <rect x={toFt(estate.runway.rect.x)} y={Y(estate.runway.rect.y) - toFt(estate.runway.rect.d)} width={toFt(estate.runway.rect.w)} height={toFt(estate.runway.rect.d)} fill="#46443f" onMouseEnter={() => setHover(estate.runway.name)} />
        {estate.buildings.map(b => {
          const x = toFt(b.rect.x), w = toFt(b.rect.w), d = toFt(b.rect.d), y = Y(b.rect.y) - d
          return (
            <g key={b.id} onMouseEnter={() => setHover(b.name)}>
              {partsOf(b).map((part, i) => <rect key={i} x={toFt(part.x)} y={Y(part.y) - toFt(part.d)} width={toFt(part.w)} height={toFt(part.d)} fill={BUILDING[b.access]} />)}
              {showLabels && <text x={x + w / 2} y={y - 5 * scale} fontSize={label} textAnchor="middle" className="site-label">{b.name}</text>}
            </g>
          )
        })}
        {showLabels && estate.zones.filter(z => ['kart-track', 'training', 'incident-camp', 'pond', 'parking', 'equipment-yard'].includes(z.id)).map(z => (
          <text key={z.id} x={toFt(z.rect.x + z.rect.w / 2)} y={Y(z.rect.y + z.rect.d / 2)} fontSize={label} textAnchor="middle" className="site-label">{z.name}</text>
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ background: BUILDING.private }} />Private</span>
        <span><i style={{ background: BUILDING.work }} />Work and visitor</span>
        <span><i style={{ background: BUILDING.shared }} />Shared aviation</span>
        <span><i style={{ background: '#a4542f' }} />Gated link</span>
        <span>North is up · building sizes are placeholders</span>
      </div>
    </div>
  )
}
