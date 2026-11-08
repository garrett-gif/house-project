import type { Parcel } from './types'
import { ft } from './geometry'

function hash(seed: number, x: number, y: number) {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function valueNoise(seed: number, x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fade = (t: number) => t * t * (3 - 2 * t)
  const u = fade(x - xi), v = fade(y - yi)
  const a = hash(seed, xi, yi), b = hash(seed, xi + 1, yi)
  const c = hash(seed, xi, yi + 1), d = hash(seed, xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Terrain is regenerated from the seed, so the same seed always returns the same land. */
export class Terrain {
  readonly heights: Float32Array
  readonly n: number
  readonly size: number

  constructor(parcel: Parcel) {
    this.n = parcel.gridSize
    this.size = parcel.size
    const count = this.n + 1
    this.heights = new Float32Array(count * count)
    for (let j = 0; j < count; j++) {
      for (let i = 0; i < count; i++) {
        const x = i / this.n, y = j / this.n
        let amp = 1, freq = 2.4, sum = 0
        for (let o = 0; o < 4; o++) {
          sum += amp * valueNoise(parcel.seed + o, x * freq, y * freq)
          amp *= 0.5
          freq *= 2
        }
        // Land rises gently toward the northwest, as a foothill parcel might.
        const rise = (1 - x) * 0.25 + y * 0.45
        this.heights[j * count + i] = ft(3550 + 220 * rise + 190 * sum / 1.875)
      }
    }
  }

  /** Elevation in inches at a site coordinate, by bilinear interpolation. */
  at(x: number, y: number) {
    const count = this.n + 1
    const gx = Math.min(this.n - 1e-6, Math.max(0, x / this.size * this.n))
    const gy = Math.min(this.n - 1e-6, Math.max(0, y / this.size * this.n))
    const i = Math.floor(gx), j = Math.floor(gy)
    const u = gx - i, v = gy - j
    const h = this.heights
    const a = h[j * count + i], b = h[j * count + i + 1]
    const c = h[(j + 1) * count + i], d = h[(j + 1) * count + i + 1]
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
  }
}
