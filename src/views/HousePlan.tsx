import type { HouseModel, RoomType } from '../model/types'
import { toFt } from '../model/geometry'

export const ROOM_COLOR: Record<RoomType, string> = {
  bedroom: '#d9e3d0', bath: '#c9dde3', living: '#efe3cb', service: '#e6e0d6',
  circulation: '#f5f2ec', wellness: '#d9d4e8', garage: '#d3d0ca', pool: '#a9d0e0',
}

export function HousePlan({ house, levelId }: { house: HouseModel; levelId: string }) {
  const level = house.levels.find(l => l.id === levelId) ?? house.levels[1]
  const minX = -74, maxX = 160, top = 74
  return (
    <div className="plan">
      <svg viewBox={`${minX} -4 ${maxX - minX} 86`} role="img" aria-label={`${level.name} floor plan`}>
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
        <text x={40} y={80} fontSize={2} textAnchor="middle" className="room-size">South, front of house</text>
      </svg>
      <div className="legend"><span>{level.name}</span><span>Placeholder massing used to test the model, not a finished floor plan</span></div>
    </div>
  )
}
