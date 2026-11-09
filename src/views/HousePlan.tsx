import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { HouseModel, Room, RoomType, Side } from '../model/types'
import type { EditOp } from '../model/edits'
import { ft, toFt } from '../model/geometry'
import { cursorFor, furnitureDragOp, grabRoom, openingDragOp, roomDragOp } from '../ui/dragOps'
import type { RoomGrab } from '../ui/dragOps'
import { houseBounds } from '../model/derive'
import { levelWalls, placeOpenings } from '../model/walls'
import { beamMarks, beamSize, beamsAbove } from '../model/beams'
import { planLabel } from './planLabel'
import { CATALOG, parts as furnitureParts } from '../model/furniture'
import type { FurnitureItem } from '../model/types'
import type { PlacedOpening, WallSegment } from '../model/walls'

export const ROOM_COLOR: Record<RoomType, string> = {
  bedroom: '#d9e3d0', bath: '#c9dde3', living: '#efe3cb', service: '#e6e0d6',
  circulation: '#f5f2ec', wellness: '#d9d4e8', garage: '#d3d0ca', pool: '#a9d0e0', outdoor: '#e9efdc',
}
const WALL = { exterior: '#2b2a26', interior: '#55524b', foundation: '#6d675c' }
const FLAG = { fail: '#c0262d', warn: '#c98a14' }
/** Direction into the host room from each of its sides, in plan coordinates (y north). */
const INWARD: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [-1, 0], w: [1, 0] }

type Grabbed = { kind: 'room'; room: Room; grab: RoomGrab } | { kind: 'opening'; opening: PlacedOpening } | { kind: 'furniture'; item: FurnitureItem }

interface Props {
  house: HouseModel
  levelId: string
  /** Ids of rooms and openings named by checks that do not pass, and how badly: red for fail, amber for warn. */
  flagged?: ReadonlyMap<string, 'warn' | 'fail'>
  /** When set, rooms, walls, doors, and windows can be dragged. The plan only reports the edit; the app applies it. */
  onDrag?: (op: EditOp | null) => void
  onDrop?: (op: EditOp | null) => void
}

export function HousePlan({ house, levelId, flagged = new Map(), onDrag, onDrop }: Props) {
  const level = house.levels.find(l => l.id === levelId) ?? house.levels[1]
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ start: [number, number]; what: Grabbed; op: EditOp | null } | null>(null)
  // The view frame stays put while dragging, so a room growing past the outline does not rescale under the pointer.
  const [frozen, setFrozen] = useState<ReturnType<typeof houseBounds> | null>(null)
  // Beams are structure for the engineer; they stay hidden unless asked for, so the plan reads as rooms.
  const [showBeams, setShowBeams] = useState(false)
  const [showFurniture, setShowFurniture] = useState(true)
  const [hover, setHover] = useState<string | null>(null)
  const b = frozen ?? houseBounds(house)
  const x0 = toFt(b.x), x1 = toFt(b.x + b.w), y0 = toFt(b.y), y1 = toFt(b.y + b.d)
  const minX = x0 - 4, maxX = x1 + 4, top = y1 + 4, mid = (x0 + x1) / 2
  // Plan inches to SVG feet, with north up.
  const P = (x: number, y: number): [number, number] => [toFt(x), top - toFt(y)]
  const walls = levelWalls(house, level)
  const openings = placeOpenings(house).filter(o => o.levelId === level.id && o.wall)
  const editable = !!onDrag && !!onDrop

  /** Pointer position in model inches, house-local, y north. */
  const toModel = (e: { clientX: number; clientY: number }): [number, number] => {
    const el = svg.current!, pt = el.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(el.getScreenCTM()!.inverse())
    return [ft(p.x), ft(top - p.y)]
  }
  const begin = (e: ReactPointerEvent, what: Grabbed) => {
    if (!editable || e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    drag.current = { start: toModel(e), what, op: null }
    setFrozen(houseBounds(house))
    svg.current!.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const [x, y] = toModel(e), dx = x - d.start[0], dy = y - d.start[1]
    d.op = d.what.kind === 'room' ? roomDragOp(d.what.room, d.what.grab, dx, dy) : d.what.kind === 'furniture' ? furnitureDragOp(d.what.item, dx, dy) : openingDragOp(d.what.opening, dx, dy)
    onDrag!(d.op)
  }
  const end = (cancel: boolean) => {
    const d = drag.current
    drag.current = null
    setFrozen(null)
    if (d) onDrop!(cancel ? null : d.op)
  }
  /** The wall a segment belongs to, as the side of one of the rooms it bounds. */
  const wallGrab = (s: WallSegment): Grabbed | null => {
    const id = s.sides[0] ?? s.sides[1]
    const room = level.rooms.find(r => r.id === id)
    if (!room) return null
    const side: Side = s.orientation === 'h' ? (s.sides[0] ? 'n' : 's') : (s.sides[0] ? 'e' : 'w')
    return { kind: 'room', room, grab: { kind: 'wall', side } }
  }

  const wallRect = (s: WallSegment) => {
    const half = s.thickness / 2
    const [ax, ay] = s.orientation === 'h' ? P(s.from - half, s.at + half) : P(s.at - half, s.to + half)
    const [bx, by] = s.orientation === 'h' ? P(s.to + half, s.at - half) : P(s.at + half, s.from - half)
    const grab = editable ? wallGrab(s) : null
    return <rect key={s.id} x={ax} y={ay} width={bx - ax} height={by - ay} fill={WALL[s.kind]}
      style={grab ? { cursor: s.orientation === 'h' ? 'ns-resize' : 'ew-resize' } : undefined}
      onPointerDown={grab ? e => begin(e, grab) : undefined} />
  }

  const opening = (o: PlacedOpening) => {
    const t = o.wall!.thickness, half = t / 2 + 0.5
    const [ax, ay] = o.orientation === 'h' ? P(o.from, o.at + half) : P(o.at - half, o.to)
    const [bx, by] = o.orientation === 'h' ? P(o.to, o.at - half) : P(o.at + half, o.from)
    const flag = flagged.get(o.id)
    const color = flag ? FLAG[flag] : '#3c3a35'
    const handlers = editable ? { onPointerDown: (e: ReactPointerEvent) => begin(e, { kind: 'opening', opening: o }), style: { cursor: o.orientation === 'h' ? 'ew-resize' : 'ns-resize' } } : {}
    const gap = <rect x={ax} y={ay} width={bx - ax} height={by - ay} fill="#fffdf8" />
    const along = (p: number): [number, number] => o.orientation === 'h' ? [p, o.at] : [o.at, p]
    if (o.kind === 'window' || o.kind === 'garage-door') {
      const [sx, sy] = P(...along(o.from)), [ex, ey] = P(...along(o.to))
      const off = toFt(t) / 4, [nx, ny] = o.orientation === 'h' ? [0, off] : [off, 0]
      return (
        <g key={o.id} {...handlers}>
          {gap}
          {o.kind === 'window'
            ? <><line x1={sx - nx} y1={sy - ny} x2={ex - nx} y2={ey - ny} stroke={color} strokeWidth={0.18} /><line x1={sx + nx} y1={sy + ny} x2={ex + nx} y2={ey + ny} stroke={color} strokeWidth={0.18} /></>
            : <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={0.3} strokeDasharray="0.8 0.5" />}
        </g>
      )
    }
    if (o.kind === 'opening') return <g key={o.id} {...handlers}>{gap}</g>
    // A door: the leaf drawn open at 90 degrees, with its swing arc. Hinged at the west or south end.
    const [ix, iy] = INWARD[o.side]
    const dir = o.swing === 'out' ? -1 : 1
    const hinge = along(o.from), closed = along(o.to)
    const open: [number, number] = [hinge[0] + ix * dir * o.width, hinge[1] + iy * dir * o.width]
    const [hx, hy] = P(...hinge), [cx, cy] = P(...closed), [ox, oy] = P(...open)
    const sweep = (cx - hx) * (oy - hy) - (cy - hy) * (ox - hx) > 0 ? 1 : 0
    const r = toFt(o.width)
    return (
      <g key={o.id} {...handlers}>
        {gap}
        <line x1={hx} y1={hy} x2={ox} y2={oy} stroke={color} strokeWidth={0.22} />
        <path d={`M ${cx} ${cy} A ${r} ${r} 0 0 ${sweep} ${ox} ${oy}`} fill="none" stroke={color} strokeWidth={0.12} strokeDasharray="0.5 0.35" />
      </g>
    )
  }

  const beams = showBeams ? beamsAbove(house, level.id) : []
  return (
    <div className="plan">
      <div className="plan-tools" role="group" aria-label="Plan layers">
        <button className={showFurniture ? 'active' : ''} onClick={() => setShowFurniture(v => !v)} aria-pressed={showFurniture} title="Furniture, fixtures, appliances, and machines">Furniture</button>
        <button className={showBeams ? 'active' : ''} onClick={() => setShowBeams(v => !v)} aria-pressed={showBeams} title="Beams in this floor's ceiling, carrying walls of the floor above">Beams</button>
        <span className="hover">{hover ?? 'Hover a room for its full name'}</span>
      </div>
      <svg ref={svg} viewBox={`${minX} -2 ${maxX - minX} ${y1 - y0 + 16}`} role="img" aria-label={`${level.name} floor plan`}
        onPointerMove={move} onPointerUp={() => end(false)} onPointerCancel={() => end(true)} style={{ touchAction: editable ? 'none' : undefined }}>
        {level.rooms.map(room => {
          const x = toFt(room.rect.x), w = toFt(room.rect.w), d = toFt(room.rect.d), y = top - toFt(room.rect.y) - d
          return (
            <g key={room.id} onMouseEnter={() => setHover(`${room.name}, ${w}′ × ${d}′`)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={y} width={w} height={d} fill={ROOM_COLOR[room.type]} stroke={room.type === 'outdoor' ? '#8c8473' : 'none'} strokeWidth={0.2} strokeDasharray={room.type === 'outdoor' ? '0.8 0.6' : undefined}
                onPointerMove={editable && !drag.current ? e => { const [mx, my] = toModel(e); (e.currentTarget as SVGRectElement).style.cursor = cursorFor(grabRoom(room, mx, my)) } : undefined}
                onPointerDown={editable ? e => { const [mx, my] = toModel(e); begin(e, { kind: 'room', room, grab: grabRoom(room, mx, my) }) } : undefined} />
              {flagged.has(room.id) && <rect x={x + 0.7} y={y + 0.7} width={Math.max(0, w - 1.4)} height={Math.max(0, d - 1.4)} fill="none" stroke={FLAG[flagged.get(room.id)!]} strokeWidth={flagged.get(room.id) === 'fail' ? 0.6 : 0.35} strokeDasharray={flagged.get(room.id) === 'fail' ? undefined : '1 0.6'} />}
            </g>
          )
        })}
        {walls.map(wallRect)}
        {openings.map(opening)}
        {showFurniture && (house.furniture ?? []).filter(i => level.rooms.some(r => r.id === i.roomId) && CATALOG[i.kind]).map(item => (
          <g key={item.id} onMouseEnter={() => setHover(`${CATALOG[item.kind].name} (${item.id})`)} onMouseLeave={() => setHover(null)}
            onPointerDown={editable ? e => begin(e, { kind: 'furniture', item }) : undefined} style={editable ? { cursor: 'move' } : undefined}>
            {furnitureParts(item).map((q, i) => (
              <rect key={i} x={toFt(q.x)} y={top - toFt(q.y) - toFt(q.d)} width={toFt(q.w)} height={toFt(q.d)} rx={0.25}
                fill={item.kind === 'pool-basin' ? '#7fc0dd' : '#fbfaf7'} fillOpacity={0.92} stroke={flagged.has(item.id) ? FLAG[flagged.get(item.id)!] : '#8a7a66'} strokeWidth={flagged.has(item.id) ? 0.35 : 0.12} />
            ))}
          </g>
        ))}
        {beams.map(bm => {
          const [a, c] = bm.orientation === 'h' ? [P(bm.from, bm.at), P(bm.to, bm.at)] : [P(bm.at, bm.from), P(bm.at, bm.to)]
          const color = flagged.has(bm.id) ? FLAG[flagged.get(bm.id)!] : '#7a3b1d'
          return (
            <g key={bm.id} pointerEvents="none">
              <line x1={a[0]} y1={a[1]} x2={c[0]} y2={c[1]} stroke={color} strokeWidth={0.45} strokeDasharray="1.6 0.5 0.3 0.5" />
              {(bm.posts ?? []).map(p => { const q = bm.orientation === 'h' ? P(p, bm.at) : P(bm.at, p); return <rect key={p} x={q[0] - 0.6} y={q[1] - 0.6} width={1.2} height={1.2} fill={color} /> })}
              <text x={(a[0] + c[0]) / 2 + (bm.orientation === 'v' ? 0.5 : 0)} y={(a[1] + c[1]) / 2 - (bm.orientation === 'h' ? 0.5 : 0)} fontSize={1.1} fill={color} textAnchor={bm.orientation === 'h' ? 'middle' : 'start'}><title>{beamSize(bm)} above</title>{beamMarks(house).get(bm.id)}</text>
            </g>
          )
        })}
        {level.rooms.map(room => {
          const x = toFt(room.rect.x), w = toFt(room.rect.w), d = toFt(room.rect.d), y = top - toFt(room.rect.y) - d
          const label = planLabel(room.name, w, d)
          if (!label) return null
          const block = label.lines.length * label.size * 1.25 + (label.showSize ? label.size : 0)
          const top0 = y + d / 2 - block / 2 + label.size
          return (
            <g key={`label-${room.id}`} pointerEvents="none">
              {label.lines.map((t, i) => <text key={t} x={x + w / 2} y={top0 + i * label.size * 1.25} fontSize={label.size} textAnchor="middle" className="room-name">{t}</text>)}
              {label.showSize && <text x={x + w / 2} y={top0 + label.lines.length * label.size * 1.25} fontSize={label.size * 0.75} textAnchor="middle" className="room-size">{w}′ × {d}′</text>}
            </g>
          )
        })}
        <text x={mid} y={top - y1 - 2} fontSize={2.2} textAnchor="middle" className="room-size">North</text>
        <text x={mid} y={top - y0 + 6} fontSize={2.2} textAnchor="middle" className="room-size">South</text>
      </svg>
      <div className="legend">
        <span>{level.name}</span>
        <span>Room sizes are to wall centerlines</span>
        {showBeams && <span>BM: beam above, sizes on sheet A-602</span>}
        {editable && <span>Drag a room to move it, its edge to move a wall, or a door or window to slide it</span>}
        <span>Walls: exterior {house.wallThickness.exterior}″, interior {house.wallThickness.interior}″, foundation {house.wallThickness.foundation}″</span>
        <span style={{ color: FLAG.fail }}>Red: failing check</span>
        <span style={{ color: FLAG.warn }}>Amber dashed: warning</span>
        <span>Placeholder massing used to test the model, not a finished floor plan</span>
      </div>
    </div>
  )
}
