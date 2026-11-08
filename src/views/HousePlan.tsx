import type { HouseModel, RoomType } from '../model/types'
import { toFt } from '../model/geometry'
import { houseBounds } from '../model/derive'

export const ROOM_COLOR: Record<RoomType, string> = {
  bedroom: '#d9e3d0', bath: '#c9dde3', living: '#efe3cb', service: '#e6e0d6',
  circulation: '#f5f2ec', wellness: '#d9d4e8', garage: '#d3d0ca', pool: '#a9d0e0', outdoor: '#e9efdc',
}

export function HousePlan({ house, levelId }: { house: HouseModel; levelId: string }) {
  const level = house.levels.find(l => l.id === levelId) ?? house.levels[1]
  const b = houseBounds(house)
  const x0 = toFt(b.x), x1 = toFt(b.x + b.w), y0 = toFt(b.y), y1 = toFt(b.y + b.d)
  const minX = x0 - 4, maxX = x1 + 4, top = y1 + 4, mid = (x0 + x1) / 2
  return (
    <div className="plan">
      <svg viewBox={`${minX} -2 ${maxX - minX} ${y1 - y0 + 16}`} role="img" aria-label={`${level.name} floor plan`}>
        {level.rooms.map(room => {
          const x = toFt(room.rect.x), w = toFt(room.rect.w), d = toFt(room.rect.d), y = top - toFt(room.rect.y) - d
          const compact = w < 14 || d < 12
          const words = room.name.split(' ')
          const lines = w < 24 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [room.name]
          return (
            <g key={room.id}>
              <rect x={x} y={y} width={w} height={d} fill={ROOM_COLOR[room.type]} stroke="#3c3a35" strokeWidth={0.45} />
              {lines.map((t, i) => <text key={t} x={x + w / 2} y={y + d / 2 + (i - (lines.length - 1) / 2) * 2.5 - (compact ? 0 : 0.8)} fontSize={compact ? 1.45 : 1.9} textAnchor="middle" className="room-name">{t}</text>)}
              {!compact && <text x={x + w / 2} y={y + d / 2 + lines.length * 1.9 + 0.5} fontSize={1.45} textAnchor="middle" className="room-size">{w}′ × {d}′</text>}
            </g>
          )
        })}
        <text x={mid} y={top - y1 - 2} fontSize={2.2} textAnchor="middle" className="room-size">North, formal entry and road</text>
        <text x={mid} y={top - y0 + 6} fontSize={2.2} textAnchor="middle" className="room-size">South, courtyard</text>
      </svg>
      <div className="legend"><span>{level.name}</span><span>Placeholder massing used to test the model, not a finished floor plan</span></div>
    </div>
  )
}
