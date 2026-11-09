import type { Check, Estate, Rect } from './types'
import { levelOf, roomById } from './walls'

/** True when two rectangles share a stretch of edge at least `min` inches long. */
export function touches(a: Rect, b: Rect, min = 12) {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const overlapY = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y)
  const sideBySide = (Math.abs(a.x + a.w - b.x) < 0.5 || Math.abs(b.x + b.w - a.x) < 0.5) && overlapY >= min
  const stacked = (Math.abs(a.y + a.d - b.y) < 0.5 || Math.abs(b.y + b.d - a.y) < 0.5) && overlapX >= min
  return sideBySide || stacked
}

const sqft = (r: Rect) => (r.w * r.d) / 144

/** Layout fit: how well the rooms match the brief. A warning, as the brief guides the design rather than limits it. */
export function programChecks(e: Estate): Check[] {
  const program = e.house.program ?? []
  if (program.length === 0) return []
  const unmet: { text: string; id: string }[] = []
  for (const item of program) {
    const room = roomById(e.house, item.roomId)
    if (!room) { unmet.push({ text: `${item.need}: no room "${item.roomId}"`, id: item.roomId }); continue }
    const issues: string[] = []
    const level = levelOf(e.house, room.id)
    if (item.levelId && level?.id !== item.levelId) issues.push(`on the ${level?.name.toLowerCase() ?? '?'} instead of the ${e.house.levels.find(l => l.id === item.levelId)?.name.toLowerCase() ?? item.levelId}`)
    if (item.minArea && sqft(room.rect) < item.minArea) issues.push(`${Math.round(sqft(room.rect))} sq ft, brief wants ${item.minArea}`)
    if (item.minWidth && Math.min(room.rect.w, room.rect.d) / 12 < item.minWidth) issues.push(`${Math.round(Math.min(room.rect.w, room.rect.d) / 12)} ft wide, brief wants ${item.minWidth}`)
    for (const other of item.near ?? []) {
      const o = roomById(e.house, other)
      if (!o || levelOf(e.house, other)?.id !== level?.id || (room.wingId ?? '') !== (o.wingId ?? '') || !touches(room.rect, o.rect)) issues.push(`not beside ${o?.name ?? other}`)
    }
    if (issues.length) unmet.push({ text: `${room.name}: ${issues.join(', ')}`, id: room.id })
  }
  const met = program.length - unmet.length
  const shown = unmet.slice(0, 4).map(u => u.text).join('; ') + (unmet.length > 4 ? `; and ${unmet.length - 4} more` : '')
  return [unmet.length
    ? { id: 'program', label: 'Rooms match the brief', status: 'warn', detail: `${met} of ${program.length} brief items met. ${shown}`, elements: [...new Set(unmet.map(u => u.id))] }
    : { id: 'program', label: 'Rooms match the brief', status: 'pass', detail: `All ${program.length} brief items met` }]
}
