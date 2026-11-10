import * as THREE from 'three'
import type { CatalogEntry } from '../model/furniture'
import type { Palette } from '../model/materials'

/**
 * How the 3D views look. "Fast" draws flat-shaded blocks, as the views always have. "Detailed" uses physically based
 * materials with procedural textures (timber siding, dry-stack stone, standing-seam roofing, wide-plank floors, tile,
 * grass), soft sun shadows, and shaped furniture. Everything here only draws: sizes and positions come from the model.
 */
export type Quality = 'fast' | 'detailed'

/** Surfaces the views ask for. Each has a texture in detailed mode and a flat color in fast mode. */
export type Surface = 'siding' | 'stone' | 'roof' | 'floor' | 'tile' | 'slab' | 'interior' | 'ceiling' | 'timber' | 'glass' | 'frame' | 'grass' | 'water' | 'fabric' | 'metal' | 'plain'

/** Feet of surface one texture tile covers. */
const TILE_FT: Partial<Record<Surface, number>> = { siding: 8, stone: 6, roof: 6, floor: 8, tile: 4, slab: 12, timber: 4, grass: 20, interior: 12, ceiling: 12 }

/** A seeded random source, so textures look the same every time. */
function rng(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
}
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`
const shade = (c: number, k: number) => {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)))
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)))
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)))
  return `rgb(${r},${g},${b})`
}

/** Draws a texture for a surface in its base color, on a 256 px canvas covering one tile. */
function paint(surface: Surface, base: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const S = 256, c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  if (!g) return null
  const r = rng(surface.length * 977 + base % 9973)
  g.fillStyle = hex(base)
  g.fillRect(0, 0, S, S)
  switch (surface) {
    case 'siding': {
      // Rough-sawn vertical boards, about 8 in wide, with battens and grain.
      const n = 12
      for (let i = 0; i < n; i++) {
        g.fillStyle = shade(base, 0.85 + r() * 0.3)
        g.fillRect(i * S / n, 0, S / n, S)
        for (let k = 0; k < 30; k++) { g.fillStyle = shade(base, 0.7 + r() * 0.5); g.fillRect(i * S / n + r() * S / n, r() * S, 1, 8 + r() * 30) }
        g.fillStyle = shade(base, 0.45)
        g.fillRect(i * S / n, 0, 2, S)
      }
      break
    }
    case 'stone': {
      // Dry-stack stone: irregular courses of rectangles with dark joints.
      let y = 0
      while (y < S) {
        const h = 14 + r() * 22
        let x = -r() * 30
        while (x < S) {
          const w = 24 + r() * 46
          g.fillStyle = shade(base, 0.7 + r() * 0.55)
          g.fillRect(x + 2, y + 2, w - 3, h - 3)
          x += w
        }
        y += h
      }
      break
    }
    case 'roof': {
      // Standing seam: panels about 16 in with raised seams.
      const n = 4
      for (let i = 0; i < n; i++) {
        g.fillStyle = shade(base, 0.95 + r() * 0.1)
        g.fillRect(i * S / n, 0, S / n, S)
        g.fillStyle = shade(base, 1.6)
        g.fillRect(i * S / n, 0, 3, S)
        g.fillStyle = shade(base, 0.6)
        g.fillRect(i * S / n + 3, 0, 2, S)
      }
      break
    }
    case 'floor': case 'timber': {
      // Wide-plank oak, or heavy timber grain.
      const n = surface === 'floor' ? 12 : 4
      for (let i = 0; i < n; i++) {
        let y = -r() * S
        while (y < S) {
          const len = S * (0.5 + r() * 0.8)
          g.fillStyle = shade(base, 0.82 + r() * 0.3)
          g.fillRect(0, i * S / n, S, S / n)
          for (let k = 0; k < 14; k++) { g.fillStyle = shade(base, 0.75 + r() * 0.4); g.fillRect(r() * S, i * S / n + r() * S / n, 20 + r() * 60, 1) }
          g.fillStyle = shade(base, 0.6)
          g.fillRect(y + len, i * S / n, 2, S / n)
          y += len
        }
        g.fillStyle = shade(base, 0.6)
        g.fillRect(0, i * S / n, S, 1)
      }
      break
    }
    case 'tile': {
      const n = 4
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade(base, 0.92 + r() * 0.12); g.fillRect(i * S / n + 1, j * S / n + 1, S / n - 2, S / n - 2) }
      break
    }
    case 'grass': {
      for (let k = 0; k < 4000; k++) { g.fillStyle = shade(base, 0.75 + r() * 0.5); g.fillRect(r() * S, r() * S, 2, 2) }
      break
    }
    case 'slab': case 'interior': case 'ceiling': {
      for (let k = 0; k < 1500; k++) { g.fillStyle = shade(base, 0.94 + r() * 0.1); g.fillRect(r() * S, r() * S, 3, 3) }
      break
    }
    default: return null
  }
  return c
}

/** Materials for one view, cached by surface and color so a scene shares them. */
export function makeLook(quality: Quality, pal: Palette) {
  const cache = new Map<string, THREE.Material>()
  const detailed = quality === 'detailed'
  const mat = (surface: Surface, color?: number, opacity = 1): THREE.Material => {
    const base = color ?? defaultColor(surface, pal)
    const key = `${surface}:${base}:${opacity}`
    const hit = cache.get(key)
    if (hit) return hit
    let m: THREE.Material
    if (!detailed) {
      m = new THREE.MeshLambertMaterial({ color: base, transparent: opacity < 1, opacity })
    } else if (surface === 'glass') {
      m = new THREE.MeshStandardMaterial({ color: base, metalness: 0.2, roughness: 0.05, transparent: true, opacity: Math.min(opacity, 0.35), envMapIntensity: 1.5 })
    } else if (surface === 'water') {
      m = new THREE.MeshStandardMaterial({ color: 0x2f8fb8, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.8 })
    } else {
      const canvas = paint(surface, base)
      const map = canvas ? new THREE.CanvasTexture(canvas) : null
      if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4 }
      const rough: Partial<Record<Surface, number>> = { roof: 0.45, metal: 0.35, tile: 0.35, frame: 0.5, floor: 0.55, stone: 0.95, siding: 0.9 }
      const metal: Partial<Record<Surface, number>> = { roof: 0.6, metal: 0.8, frame: 0.3 }
      m = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : base, map, roughness: rough[surface] ?? 0.85, metalness: metal[surface] ?? 0, transparent: opacity < 1, opacity })
    }
    cache.set(key, m)
    return m
  }
  return { quality, detailed, mat, pal }
}
export type Look = ReturnType<typeof makeLook>

function defaultColor(s: Surface, p: Palette): number {
  switch (s) {
    case 'siding': return p.siding
    case 'stone': return p.stone
    case 'roof': return p.roof
    case 'floor': return p.floor
    case 'tile': return p.tile
    case 'slab': return p.slab
    case 'interior': return p.interior
    case 'ceiling': return p.ceiling
    case 'timber': return p.timber
    case 'glass': return p.glass
    case 'frame': return p.frame
    case 'grass': return 0x7d9a5a
    case 'water': return 0x2f8fb8
    case 'fabric': return 0x8d7b68
    case 'metal': return 0x55595e
    default: return 0xcccccc
  }
}

/**
 * Sets texture coordinates from positions in feet, so a texture tiles at real size on any box or polygon instead of
 * stretching. Each face takes the two axes it does not face.
 */
export function worldUV(geometry: THREE.BufferGeometry, surface: Surface) {
  const tile = TILE_FT[surface] ?? 8
  const pos = geometry.getAttribute('position'), nor = geometry.getAttribute('normal')
  if (!pos || !nor) return
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i))
    const [u, v] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y]
    uv[i * 2] = u / tile
    uv[i * 2 + 1] = v / tile
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** A box in feet centered at (x, y, z), textured at real scale. */
export function box(look: Look, w: number, h: number, d: number, surface: Surface, color?: number, opacity = 1) {
  const geo = new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d))
  if (look.detailed) worldUV(geo, surface)
  const mesh = new THREE.Mesh(geo, look.mat(surface, color, opacity))
  if (look.detailed) { mesh.castShadow = opacity >= 1; mesh.receiveShadow = true }
  return mesh
}

/** One furniture part as a shaped model, in feet, with its back toward `back` (scene x or z). */
export interface PartShape { w: number; d: number; h: number; name: string; kind: string; entry: CatalogEntry; back: [number, number]; color: number }

/**
 * A furniture part drawn as a recognizable shape: beds with a mattress, headboard, and pillows; sofas and chairs with a
 * seat, back, and arms; tables and desks on legs; counters and islands as cabinets with a stone top; vehicles with a
 * cabin and wheels; fireplaces in stone with a dark firebox. Anything else is a block. The group's origin is the
 * part's footprint center on the floor; w runs along scene x, d along scene z.
 */
export function partModel(look: Look, s: PartShape): THREE.Object3D {
  const g = new THREE.Group()
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); g.add(m) }
  const n = `${s.name} ${s.kind} ${s.entry.name}`.toLowerCase()
  const [bx, bz] = s.back
  // Along the back: a slab against the back edge of depth t. Across: the long side perpendicular to the back.
  const backSlab = (t: number, h: number, y0: number, surface: Surface, color?: number) => {
    const across = bx !== 0 ? s.d : s.w
    const m = box(look, bx !== 0 ? t : across, h, bx !== 0 ? across : t, surface, color)
    add(m, bx * (s.w / 2 - t / 2), y0 + h / 2, bz * (s.d / 2 - t / 2))
  }
  const sides = (t: number, h: number, surface: Surface, color?: number) => {
    // Arms on the two sides that are not front or back.
    for (const k of [-1, 1]) {
      if (bx !== 0) add(box(look, s.w, h, t, surface, color), 0, h / 2, k * (s.d / 2 - t / 2))
      else add(box(look, t, h, s.d, surface, color), k * (s.w / 2 - t / 2), h / 2, 0)
    }
  }
  const legs = (top: number, inset: number, surface: Surface) => {
    for (const [i, j] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) add(box(look, 0.2, top, 0.2, surface), i * (s.w / 2 - inset), top / 2, j * (s.d / 2 - inset))
  }
  if (!look.detailed) { add(box(look, s.w, s.h, s.d, 'plain', s.color), 0, s.h / 2, 0); return g }

  if (s.entry.material === 'stone' || /fireplace|firebox|chimney|hearth/.test(n)) {
    add(box(look, s.w, s.h, s.d, 'stone'), 0, s.h / 2, 0)
    if (/chimney|surround|firebox|fireplace/.test(n) && s.h > 4) {
      // The firebox: a dark opening on the front face.
      const fw = Math.min(3.5, (bx !== 0 ? s.d : s.w) * 0.5), fh = Math.min(3, s.h * 0.35)
      const m = box(look, bx !== 0 ? 0.3 : fw, fh, bx !== 0 ? fw : 0.3, 'plain', 0x1a1612)
      add(m, -bx * (s.w / 2), 1.6 + fh / 2, -bz * (s.d / 2))
    }
    return g
  }
  if (/pool basin|pool-basin/.test(n)) { add(box(look, s.w, 0.3, s.d, 'water'), 0, 0.15, 0); return g }
  const porcelain = 0xf6f6f2
  if (/toilet/.test(s.name.toLowerCase()) && s.h < 4) {
    // A bowl in front, a tank against the back wall.
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(s.w, s.d) * 0.38, Math.min(s.w, s.d) * 0.3, 1.25, 20), look.mat('plain', porcelain))
    bowl.castShadow = true
    add(bowl, -bx * 0.25, 0.62, -bz * 0.25)
    backSlab(0.7, 2.5, 0, 'plain', porcelain)
    return g
  }
  if (/^tub$|tub\b/.test(s.name.toLowerCase()) && s.h < 3) {
    add(box(look, s.w, s.h, s.d, 'plain', porcelain), 0, s.h / 2, 0)
    add(box(look, s.w - 0.6, 0.05, s.d - 0.6, 'water'), 0, s.h - 0.2, 0)
    return g
  }
  if (/shower/.test(s.name.toLowerCase())) {
    add(box(look, s.w, 0.25, s.d, 'tile'), 0, 0.12, 0)
    // Glass on the open sides, the tile wall at the back.
    backSlab(0.2, Math.min(7, s.h), 0, 'tile')
    for (const k of [-1, 1]) {
      if (bx !== 0) add(box(look, s.w, Math.min(7, s.h), 0.05, 'glass'), 0, Math.min(7, s.h) / 2, k * s.d / 2)
      else add(box(look, 0.05, Math.min(7, s.h), s.d, 'glass'), k * s.w / 2, Math.min(7, s.h) / 2, 0)
    }
    return g
  }
  if (/sink|vanity|lavatory/.test(s.name.toLowerCase()) && s.h <= 3.5) {
    add(box(look, s.w, s.h - 0.15, s.d, 'timber'), 0, (s.h - 0.15) / 2, 0)
    add(box(look, s.w, 0.15, s.d, 'stone', 0xe7e4dc), 0, s.h - 0.075, 0)
    const basins = /double/.test(n) ? [-s.w / 4, s.w / 4] : [0]
    for (const o of basins) add(box(look, Math.min(1.5, s.w * 0.4), 0.05, Math.min(1.2, s.d * 0.5), 'plain', porcelain), bx !== 0 ? 0 : o, s.h + 0.01, bx !== 0 ? o : 0)
    return g
  }
  if (/fridge|refrigerator/.test(n)) { add(box(look, s.w, s.h, s.d, 'metal', 0xc9ccd0), 0, s.h / 2, 0); return g }
  if (/\brange\b/.test(s.name.toLowerCase())) {
    add(box(look, s.w, s.h - 0.1, s.d, 'metal', 0xb8bbbf), 0, (s.h - 0.1) / 2, 0)
    add(box(look, s.w, 0.1, s.d, 'plain', 0x1d1d1d), 0, s.h - 0.05, 0)
    return g
  }
  if (/\bbed\b|bunk|twin|king|queen|mattress/.test(n) && !/nightstand/.test(n)) {
    const frameH = Math.min(1.1, s.h * 0.45)
    add(box(look, s.w, frameH, s.d, 'timber'), 0, frameH / 2, 0)
    add(box(look, s.w * 0.96, 0.8, s.d * 0.94, 'plain', 0xf2efe8), 0, frameH + 0.4, 0)
    backSlab(0.35, Math.max(3.5, s.h), 0, 'timber')
    // Pillows near the head.
    const pw = (bx !== 0 ? s.d : s.w) * 0.4
    for (const k of [-1, 1]) {
      const m = box(look, bx !== 0 ? 1.2 : pw, 0.45, bx !== 0 ? pw : 1.2, 'plain', 0xffffff)
      const along = k * (bx !== 0 ? s.d : s.w) * 0.24
      add(m, bx !== 0 ? bx * (s.w / 2 - 1.1) : along, frameH + 1, bx !== 0 ? along : bz * (s.d / 2 - 1.1))
    }
    if (/bunk/.test(n)) add(box(look, s.w * 0.96, 0.6, s.d * 0.94, 'plain', 0xe9e4da), 0, Math.min(s.h - 0.6, 5), 0)
    return g
  }
  if (/sofa|sectional|couch|living|armchair|chair|seat|bench|banquette|cushion|lounge/.test(n) && s.h <= 4) {
    const seatH = Math.min(1.5, s.h * 0.55)
    add(box(look, s.w, seatH, s.d, 'fabric', s.color), 0, seatH / 2, 0)
    if (s.h > 2 && Math.min(s.w, s.d) > 1.2) { backSlab(Math.min(0.8, Math.min(s.w, s.d) * 0.3), Math.max(s.h, 2.6) - seatH, seatH, 'fabric', s.color); if (Math.max(s.w, s.d) > 2.5) sides(0.5, Math.min(2.2, s.h * 0.8), 'fabric', s.color) }
    return g
  }
  if (/table|desk|dining|conference/.test(n) && !/prep|counter|island/.test(n)) {
    add(box(look, s.w, 0.15, s.d, 'timber'), 0, s.h - 0.075, 0)
    legs(s.h - 0.15, 0.3, 'timber')
    return g
  }
  if (/counter|island|vanity|cabinet|range|sink|bar|kitchen/.test(n) && s.h <= 4) {
    add(box(look, s.w * 0.98, s.h - 0.15, s.d * 0.94, 'timber'), 0, (s.h - 0.15) / 2, 0)
    add(box(look, s.w, 0.15, s.d, 'stone', 0xd9d6cf), 0, s.h - 0.075, 0)
    return g
  }
  if (s.entry.category === 'vehicle') {
    const bodyH = s.h * 0.45, cabH = s.h * 0.45
    add(box(look, s.w, bodyH, s.d, 'metal', s.color), 0, 0.6 + bodyH / 2, 0)
    const long = s.w >= s.d
    add(box(look, long ? s.w * 0.5 : s.w * 0.9, cabH, long ? s.d * 0.9 : s.d * 0.5, 'glass', 0x26323d, 0.9), 0, 0.6 + bodyH + cabH / 2, 0)
    for (const [i, j] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 16), look.mat('plain', 0x1d1d1d))
      wheel.rotation.set(long ? Math.PI / 2 : 0, 0, long ? 0 : Math.PI / 2)
      wheel.castShadow = true
      add(wheel, i * (s.w / 2 - (long ? 1.6 : 0.3)), 0.9, j * (s.d / 2 - (long ? 0.3 : 1.6)))
    }
    return g
  }
  if (/shelves|bookshelf|built-in|wine|pantry|lockers|cubbies/.test(n)) {
    add(box(look, s.w, s.h, s.d, s.entry.material === 'timber' || /built-in|bookshelf/.test(n) ? 'timber' : 'plain', s.color), 0, s.h / 2, 0)
    return g
  }
  add(box(look, s.w, s.h, s.d, s.entry.material === 'timber' ? 'timber' : 'plain', s.color), 0, s.h / 2, 0)
  return g
}
