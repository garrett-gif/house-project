import type { HouseModel, RoomType, Side } from '../model/types'
import { toFt } from '../model/geometry'
import { houseBounds } from '../model/derive'
import { levelWalls, placeOpenings } from '../model/walls'
import type { PlacedOpening, WallSegment } from '../model/walls'

export const ROOM_COLOR: Record<RoomType, string> = {
  bedroom: '#d9e3d0', bath: '#c9dde3', living: '#efe3cb', service: '#e6e0d6',
  circulation: '#f5f2ec', wellness: '#d9d4e8', garage: '#d3d0ca', pool: '#a9d0e0', outdoor: '#e9efdc',
}
const WALL = { exterior: '#2b2a26', interior: '#55524b', foundation: '#6d675c' }
const FLAG = { fail: '#c0262d', warn: '#c98a14' }
/** Direction into the host room from each of its sides, in plan coordinates (y north). */
const INWARD: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [-1, 0], w: [1, 0] }

/** `flagged` maps ids of rooms and openings named by checks that do not pass to how badly: red for fail, amber for warn. */
export function HousePlan({ house, levelId, flagged = new Map() }: { house: HouseModel; levelId: string; flagged?: ReadonlyMap<string, 'warn' | 'fail'> }) {
  const level = house.levels.find(l => l.id === levelId) ?? house.levels[1]
  const b = houseBounds(house)
  const x0 = toFt(b.x), x1 = toFt(b.x + b.w), y0 = toFt(b.y), y1 = toFt(b.y + b.d)
  const minX = x0 - 4, maxX = x1 + 4, top = y1 + 4, mid = (x0 + x1) / 2
  // Plan inches to SVG feet, with north up.
  const P = (x: number, y: number): [number, number] => [toFt(x), top - toFt(y)]
  const walls = levelWalls(house, level)
  const openings = placeOpenings(house).filter(o => o.levelId === level.id && o.wall)

  const wallRect = (s: WallSegment) => {
    const half = s.thickness / 2
    const [ax, ay] = s.orientation === 'h' ? P(s.from - half, s.at + half) : P(s.at - half, s.to + half)
    const [bx, by] = s.orientation === 'h' ? P(s.to + half, s.at - half) : P(s.at + half, s.from - half)
    return <rect key={s.id} x={ax} y={ay} width={bx - ax} height={by - ay} fill={WALL[s.kind]} />
  }

  const opening = (o: PlacedOpening) => {
    const t = o.wall!.thickness, half = t / 2 + 0.5
    const [ax, ay] = o.orientation === 'h' ? P(o.from, o.at + half) : P(o.at - half, o.to)
    const [bx, by] = o.orientation === 'h' ? P(o.to, o.at - half) : P(o.at + half, o.from)
    const flag = flagged.get(o.id)
    const color = flag ? FLAG[flag] : '#3c3a35'
    const gap = <rect x={ax} y={ay} width={bx - ax} height={by - ay} fill="#fffdf8" />
    const along = (p: number): [number, number] => o.orientation === 'h' ? [p, o.at] : [o.at, p]
    if (o.kind === 'window' || o.kind === 'garage-door') {
      const [sx, sy] = P(...along(o.from)), [ex, ey] = P(...along(o.to))
      const off = toFt(t) / 4, [nx, ny] = o.orientation === 'h' ? [0, off] : [off, 0]
      return (
        <g key={o.id}>
          {gap}
          {o.kind === 'window'
            ? <><line x1={sx - nx} y1={sy - ny} x2={ex - nx} y2={ey - ny} stroke={color} strokeWidth={0.18} /><line x1={sx + nx} y1={sy + ny} x2={ex + nx} y2={ey + ny} stroke={color} strokeWidth={0.18} /></>
            : <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={0.3} strokeDasharray="0.8 0.5" />}
        </g>
      )
    }
    if (o.kind === 'opening') return <g key={o.id}>{gap}</g>
    // A door: the leaf drawn open at 90 degrees, with its swing arc. Hinged at the west or south end.
    const [ix, iy] = INWARD[o.side]
    const dir = o.swing === 'out' ? -1 : 1
    const hinge = along(o.from), closed = along(o.to)
    const open: [number, number] = [hinge[0] + ix * dir * o.width, hinge[1] + iy * dir * o.width]
    const [hx, hy] = P(...hinge), [cx, cy] = P(...closed), [ox, oy] = P(...open)
    const sweep = (cx - hx) * (oy - hy) - (cy - hy) * (ox - hx) > 0 ? 1 : 0
    const r = toFt(o.width)
    return (
      <g key={o.id}>
        {gap}
        <line x1={hx} y1={hy} x2={ox} y2={oy} stroke={color} strokeWidth={0.22} />
        <path d={`M ${cx} ${cy} A ${r} ${r} 0 0 ${sweep} ${ox} ${oy}`} fill="none" stroke={color} strokeWidth={0.12} strokeDasharray="0.5 0.35" />
      </g>
    )
  }

  return (
    <div className="plan">
      <svg viewBox={`${minX} -2 ${maxX - minX} ${y1 - y0 + 16}`} role="img" aria-label={`${level.name} floor plan`}>
        {level.rooms.map(room => {
          const x = toFt(room.rect.x), w = toFt(room.rect.w), d = toFt(room.rect.d), y = top - toFt(room.rect.y) - d
          return (
            <g key={room.id}>
              <rect x={x} y={y} width={w} height={d} fill={ROOM_COLOR[room.type]} stroke={room.type === 'outdoor' ? '#8c8473' : 'none'} strokeWidth={0.2} strokeDasharray={room.type === 'outdoor' ? '0.8 0.6' : undefined} />
              {flagged.has(room.id) && <rect x={x + 0.7} y={y + 0.7} width={Math.max(0, w - 1.4)} height={Math.max(0, d - 1.4)} fill="none" stroke={FLAG[flagged.get(room.id)!]} strokeWidth={flagged.get(room.id) === 'fail' ? 0.6 : 0.35} strokeDasharray={flagged.get(room.id) === 'fail' ? undefined : '1 0.6'} />}
            </g>
          )
        })}
        {walls.map(wallRect)}
        {openings.map(opening)}
        {level.rooms.map(room => {
          const x = toFt(room.rect.x), w = toFt(room.rect.w), d = toFt(room.rect.d), y = top - toFt(room.rect.y) - d
          const compact = w < 14 || d < 12
          const words = room.name.split(' ')
          const lines = w < 24 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [room.name]
          return (
            <g key={`label-${room.id}`}>
              {lines.map((t, i) => <text key={t} x={x + w / 2} y={y + d / 2 + (i - (lines.length - 1) / 2) * 2.5 - (compact ? 0 : 0.8)} fontSize={compact ? 1.45 : 1.9} textAnchor="middle" className="room-name">{t}</text>)}
              {!compact && <text x={x + w / 2} y={y + d / 2 + lines.length * 1.9 + 0.5} fontSize={1.45} textAnchor="middle" className="room-size">{w}′ × {d}′</text>}
            </g>
          )
        })}
        <text x={mid} y={top - y1 - 2} fontSize={2.2} textAnchor="middle" className="room-size">North, formal entry and road</text>
        <text x={mid} y={top - y0 + 6} fontSize={2.2} textAnchor="middle" className="room-size">South, courtyard</text>
      </svg>
      <div className="legend">
        <span>{level.name}</span>
        <span>Room sizes are to wall centerlines</span>
        <span>Walls: exterior {house.wallThickness.exterior}″, interior {house.wallThickness.interior}″, foundation {house.wallThickness.foundation}″</span>
        <span style={{ color: FLAG.fail }}>Red: failing check</span>
        <span style={{ color: FLAG.warn }}>Amber dashed: warning</span>
        <span>Placeholder massing used to test the model, not a finished floor plan</span>
      </div>
    </div>
  )
}
