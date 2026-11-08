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

export const translate = (r: Rect, dx: number, dy: number): Rect => ({ ...r, x: r.x + dx, y: r.y + dy })

export function bounds(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y))
  const x1 = Math.max(...rects.map(r => r.x + r.w)), y1 = Math.max(...rects.map(r => r.y + r.d))
  return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 }
}

/** Covers the union of the given rectangles with a small set of non-overlapping rectangles. */
export function mergeRects(rects: Rect[]): Rect[] {
  const uniq = (v: number[]) => [...new Set(v)].sort((a, b) => a - b)
  const xs = uniq(rects.flatMap(r => [r.x, r.x + r.w]))
  const ys = uniq(rects.flatMap(r => [r.y, r.y + r.d]))
  const covers = (x: number, y: number) => rects.some(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d)
  const out: Rect[] = []
  let open = new Map<string, Rect>()
  for (let j = 0; j < ys.length - 1; j++) {
    const y = ys[j], cy = (ys[j] + ys[j + 1]) / 2
    const next = new Map<string, Rect>()
    for (let i = 0; i < xs.length - 1;) {
      if (!covers((xs[i] + xs[i + 1]) / 2, cy)) { i++; continue }
      let k = i
      while (k < xs.length - 1 && covers((xs[k] + xs[k + 1]) / 2, cy)) k++
      const key = `${xs[i]}:${xs[k]}`
      const prev = open.get(key)
      if (prev) { prev.d = ys[j + 1] - prev.y; next.set(key, prev); open.delete(key) }
      else next.set(key, { x: xs[i], y, w: xs[k] - xs[i], d: ys[j + 1] - y })
      i = k
    }
    out.push(...open.values())
    open = next
  }
  out.push(...open.values())
  return out
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
