import type { Pt, Rect } from './types'

export const ft = (n: number) => n * 12
export const toFt = (n: number) => n / 12
export const SQ_IN_PER_ACRE = 43560 * 144

/** Rectangle from a center and size, all given in feet. */
export const box = (cx: number, cy: number, w: number, d: number): Rect => ({
  x: ft(cx - w / 2), y: ft(cy - d / 2), w: ft(w), d: ft(d),
})
export const p = (x: number, y: number): Pt => ({ x: ft(x), y: ft(y) })

export const partsOf = (b: { rect: Rect; parts?: Rect[] }) => b.parts ?? [b.rect]
export const area = (r: Rect) => r.w * r.d
export const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.d / 2 })

export function overlaps(a: Rect, b: Rect, tolerance = 0.01) {
  return a.x + a.w > b.x + tolerance && b.x + b.w > a.x + tolerance &&
    a.y + a.d > b.y + tolerance && b.y + b.d > a.y + tolerance
}

export function rectDistance(a: Rect, b: Rect) {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w))
  const dy = Math.max(0, a.y - (b.y + b.d), b.y - (a.y + a.d))
  return Math.hypot(dx, dy)
}

export function pointToRect(pt: Pt, r: Rect) {
  const dx = Math.max(r.x - pt.x, 0, pt.x - (r.x + r.w))
  const dy = Math.max(r.y - pt.y, 0, pt.y - (r.y + r.d))
  return Math.hypot(dx, dy)
}

/** Evenly samples a polyline so it can be draped on terrain or measured against rectangles. */
export function samplePath(points: Pt[], step: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n })
  }
  out.push(points[points.length - 1])
  return out
}

export function pathLength(points: Pt[]) {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  return total
}

export function bezier(a: Pt, b: Pt, c: Pt, d: Pt, steps = 24): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t
    return {
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    }
  })
}
