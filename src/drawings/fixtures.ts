import type { Rect } from '../model/types'

/**
 * Plan symbols for fixtures, the way drawings show them: a toilet bowl, sink basins, a shower's crossed lines, a tub's
 * inner edge, a range's burners, a bed's pillows. Shapes are in model inches over the part's rectangle, so the plan
 * view and the sheets draw the same thing.
 */
export type Symbol =
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'rect'; x: number; y: number; w: number; d: number }

export function fixtureSymbols(name: string, r: Rect): Symbol[] {
  const n = name.toLowerCase(), cx = r.x + r.w / 2, cy = r.y + r.d / 2, small = Math.min(r.w, r.d)
  if (/toilet/.test(n)) return [{ t: 'ellipse', cx, cy, rx: r.w * 0.38, ry: r.d * 0.32 }]
  if (/double vanity|vanity-double|two sinks/.test(n)) return [-1, 1].map(k => ({ t: 'ellipse' as const, cx: cx + k * r.w / 4, cy, rx: Math.min(9, r.w / 8), ry: Math.min(7, r.d * 0.3) }))
  if (/sink|vanity|lavatory/.test(n)) return [{ t: 'ellipse', cx, cy, rx: Math.min(10, r.w * 0.3), ry: Math.min(7, r.d * 0.3) }]
  if (/shower/.test(n)) return [{ t: 'line', x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.d }, { t: 'line', x1: r.x, y1: r.y + r.d, x2: r.x + r.w, y2: r.y }]
  if (/tub/.test(n)) return [{ t: 'rect', x: r.x + 3, y: r.y + 3, w: r.w - 6, d: r.d - 6 }, { t: 'ellipse', cx, cy, rx: r.w / 2 - 6, ry: r.d / 2 - 6 }]
  if (/range|cooktop/.test(n)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([i, j]) => ({ t: 'ellipse' as const, cx: cx + i * r.w / 4, cy: cy + j * r.d / 4, rx: small * 0.16, ry: small * 0.16 }))
  if (/fridge|refrigerator/.test(n)) return [{ t: 'line', x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.d }]
  if (/\bbed\b|bunk|mattress/.test(n) && !/nightstand/.test(n) && small > 30) {
    // Pillows along the shorter end nearest the back, and the fold of the covers.
    const along = r.w <= r.d
    return along
      ? [{ t: 'rect', x: r.x + 4, y: r.y + 4, w: r.w / 2 - 6, d: 14 }, { t: 'rect', x: cx + 2, y: r.y + 4, w: r.w / 2 - 6, d: 14 }, { t: 'line', x1: r.x, y1: r.y + r.d * 0.35, x2: r.x + r.w, y2: r.y + r.d * 0.35 }]
      : [{ t: 'rect', x: r.x + 4, y: r.y + 4, w: 14, d: r.d / 2 - 6 }, { t: 'rect', x: r.x + 4, y: cy + 2, w: 14, d: r.d / 2 - 6 }, { t: 'line', x1: r.x + r.w * 0.35, y1: r.y, x2: r.x + r.w * 0.35, y2: r.y + r.d }]
  }
  return []
}
