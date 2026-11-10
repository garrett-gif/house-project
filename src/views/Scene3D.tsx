import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Estate, Rect } from '../model/types'
import { Terrain } from '../model/parcel'
import { ft, partsOf, samplePath, toFt } from '../model/geometry'
import { houseBounds } from '../model/derive'
import { CATALOG, parts } from '../model/furniture'
import { levelWalls, placeOpenings } from '../model/walls'
import { roofPolygons } from '../model/roofs'
import { wingById } from '../model/wings'
import { allHouses } from '../model/houses'
import { ceilingOf, ceilingPolygons, ceilingTimber } from '../model/ceilings'
import { stairGeometry } from '../model/stairs'
import { roomDecor } from '../model/decor'
import { porchPosts, railings } from '../model/architecture'
import { landscape } from '../model/landscape'
import { gradeAt } from '../model/designGrade'
import { SEAT, bayOutline } from '../model/bays'
import { floorColor, paletteOf } from '../model/materials'
import { outwardSide } from '../model/walls'
import type { Palette } from '../model/materials'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { box as lookBox, makeLook, partModel, worldUV } from './look3d'
import type { Look, Quality, Surface } from './look3d'
import type { RoomType } from '../model/types'
import type { P3, Poly3 } from '../model/roofs'
import { flyoverKeyframes, step, walkStart } from '../ui/tour'

const COLORS = { private: 0x2f6f62, work: 0xa65a35, visitor: 0xa65a35, shared: 0x66635c }

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function addBox(group: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: number | string, opacity = 1, surface: Surface = 'plain', look?: Look) {
  const mesh = look
    ? lookBox(look, w, h, d, surface, typeof color === 'number' ? color : undefined, opacity)
    : new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity }))
  mesh.position.set(x, y, z)
  group.add(mesh)
  return mesh
}

/** Floor finish by room type. */
const floorSurface = (t: RoomType): Surface => t === 'bath' || t === 'wellness' || t === 'pool' ? 'tile' : t === 'garage' || t === 'service' ? 'slab' : t === 'outdoor' ? 'stone' : 'floor'

/** A straight timber from a to b (scene feet), w wide and d deep, its depth kept in the vertical plane through it. */
function addTimber(group: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, color: number, look?: Look) {
  const dir = b.clone().sub(a), len = dir.length()
  if (len < 0.05) return
  dir.normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const across = Math.abs(dir.dot(up)) > 0.99 ? new THREE.Vector3(1, 0, 0) : dir.clone().cross(up).normalize()
  const depth = across.clone().cross(dir).normalize()
  const mesh = look ? lookBox(look, w, d, len, 'timber', color) : new THREE.Mesh(new THREE.BoxGeometry(w, d, len), new THREE.MeshLambertMaterial({ color }))
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, depth, dir))
  mesh.position.copy(a.clone().add(b).multiplyScalar(0.5))
  group.add(mesh)
}

/** Flat polygons as one mesh. With `facing` 'down', each is wound to face down, so a ceiling shows from inside only. */
function addPolys(group: THREE.Object3D, polys: Poly3[], toScene: (p: P3) => number[], color: number, facing: 'down' | 'both', opacity = 1, surface: Surface = 'plain', look?: Look) {
  const verts: number[] = []
  for (const poly of polys) {
    let v = poly.pts.map(toScene)
    if (facing === 'down') {
      const [a, b, c] = v, ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2]
      // Scene y is up; the normal's y is uz*vx - ux*vz.
      if (uz * vx - ux * vz > 0) v = [...v].reverse()
    }
    for (let i = 1; i < v.length - 1; i++) verts.push(...v[0], ...v[i], ...v[i + 1])
  }
  if (!verts.length) return
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.computeVertexNormals()
  const side = facing === 'down' ? THREE.FrontSide : THREE.DoubleSide
  if (look) {
    if (look.detailed) worldUV(g, surface)
    const m = look.mat(surface, color, opacity).clone()
    m.side = side
    const mesh = new THREE.Mesh(g, m)
    if (look.detailed) { mesh.castShadow = opacity >= 1; mesh.receiveShadow = true }
    group.add(mesh)
    return
  }
  group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side, transparent: opacity < 1, opacity })))
}

/**
 * The ground around a house on its designed grade: up at the main floor where the land meets it, down at the walkout
 * in a dug courtyard. Under the building it drops below the lowest floor so every level shows from above.
 */
function addGround(scene: THREE.Scene, house: Estate['house'], cx: number, cy: number, W: number, D: number, look: Look) {
  const step = 5, nx = Math.ceil(W / step), nz = Math.ceil(D / step)
  const geo = new THREE.PlaneGeometry(W, D, nx, nz)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const lowest = Math.min(0, ...house.levels.map(l => l.elevation))
  const boxes = house.levels.flatMap(l => l.rooms.filter(r => r.type !== 'outdoor' && !r.wingId).map(r => r.rect))
  for (let i = 0; i < pos.count; i++) {
    const hx = ft(pos.getX(i) + cx), hy = ft(cy - pos.getZ(i))
    const under = boxes.some(r => hx > r.x + 6 && hx < r.x + r.w - 6 && hy > r.y + 6 && hy < r.y + r.d - 6)
    pos.setY(i, toFt(under ? lowest - 12 : gradeAt(house, hx, hy)) - 0.4)
  }
  geo.computeVertexNormals()
  if (look.detailed) worldUV(geo, 'grass')
  const mesh = new THREE.Mesh(geo, look.mat('grass', look.detailed ? 0x6f8f4a : 0xa9bb8c))
  mesh.receiveShadow = look.detailed
  scene.add(mesh)
}

/** Paths and drive aprons, planting beds, conifers, door sconces, and fire pits from the model's landscape. */
function addLandscape(scene: THREE.Scene, house: Estate['house'], cx: number, cy: number, look: Look) {
  const { paving, plants, fixtures } = landscape(house)
  const X = (x: number) => toFt(x) - cx, Z = (y: number) => cy - toFt(y)
  for (const p of paving) addBox(scene, X(p.rect.x + p.rect.w / 2), toFt(p.z) - 0.25, Z(p.rect.y + p.rect.d / 2), toFt(p.rect.w), 0.3, toFt(p.rect.d), p.kind === 'apron' ? 0x9a9a96 : 0xb3aa98, 1, p.kind === 'apron' ? 'slab' : 'stone', look)
  for (const p of plants) {
    if (p.kind === 'shrub') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(toFt(p.r), 10, 8), look.mat('plain', 0x4d6b3c))
      m.scale.y = 0.7; m.position.set(X(p.x), toFt(p.z) + toFt(p.r) * 0.5, Z(p.y)); m.castShadow = look.detailed
      scene.add(m)
      continue
    }
    // A conifer: a trunk and two stacked cones.
    const h = toFt(p.h), r = toFt(p.r)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, h * 0.3, 8), look.mat('timber', 0x5a4232))
    trunk.position.set(X(p.x), toFt(p.z) + h * 0.15, Z(p.y)); scene.add(trunk)
    for (const [k, s] of [[0.45, 1], [0.75, 0.65]] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * s, h * 0.55, 10), look.mat('plain', 0x2f4a2e))
      cone.position.set(X(p.x), toFt(p.z) + h * k, Z(p.y)); cone.castShadow = look.detailed
      scene.add(cone)
    }
  }
  for (const f of fixtures) {
    if (f.kind === 'sconce') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc982, emissiveIntensity: look.detailed ? 0.8 : 0.2 }))
      m.position.set(X(f.x), toFt(f.z), Z(f.y)); scene.add(m)
      continue
    }
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(toFt(f.r), toFt(f.r), 1.4, 20), look.mat('stone'))
    ring.position.set(X(f.x), toFt(f.z) + 0.7, Z(f.y)); ring.castShadow = look.detailed; scene.add(ring)
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(toFt(f.r) - 0.8, toFt(f.r) - 0.8, 0.1, 20), look.mat('plain', 0x1d1612))
    pit.position.set(X(f.x), toFt(f.z) + 1.45, Z(f.y)); scene.add(pit)
  }
}

function buildSite(scene: THREE.Scene, estate: Estate) {
  const terrain = new Terrain(estate.parcel)
  const S = toFt(estate.parcel.size)
  const elev = (xFt: number, yFt: number) => toFt(terrain.at(ft(xFt), ft(yFt))) - 3600
  const inCleared = (x: number, y: number) => estate.zones.some(z => z.cleared &&
    x >= toFt(z.rect.x) && x <= toFt(z.rect.x + z.rect.w) && y >= toFt(z.rect.y) && y <= toFt(z.rect.y + z.rect.d))

  const n = estate.parcel.gridSize
  const geo = new THREE.PlaneGeometry(S, S, n, n)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const forest = new THREE.Color(0x60784a), clear = new THREE.Color(0xc5bf97)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + S / 2, y = S / 2 - pos.getZ(i)
    pos.setY(i, elev(x, y))
    const c = inCleared(x, y) ? clear : forest
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })))

  const X = (x: number) => x - S / 2
  const Z = (y: number) => S / 2 - y

  const random = rng(estate.parcel.seed)
  const trees: THREE.Matrix4[] = []
  for (let i = 0; i < 9000 && trees.length < 4200; i++) {
    const x = random() * S, y = random() * S
    if (inCleared(x, y)) continue
    const h = 48 + random() * 34
    trees.push(new THREE.Matrix4().compose(new THREE.Vector3(X(x), elev(x, y) + h / 2, Z(y)), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)))
  }
  const treeMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(15, 1, 6), new THREE.MeshLambertMaterial({ color: 0x344f2f }), trees.length)
  trees.forEach((m, i) => treeMesh.setMatrixAt(i, m))
  scene.add(treeMesh)

  const ribbon = (points: { x: number; y: number }[], width: number, color: number, lift: number) => {
    const path = samplePath(points, ft(40)).map(q => ({ x: toFt(q.x), y: toFt(q.y) }))
    const verts: number[] = [], index: number[] = []
    path.forEach((q, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)]
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const nx = -(b.y - a.y) / len * width / 2, ny = (b.x - a.x) / len * width / 2
      verts.push(X(q.x + nx), elev(q.x + nx, q.y + ny) + lift, Z(q.y + ny), X(q.x - nx), elev(q.x - nx, q.y - ny) + lift, Z(q.y - ny))
      if (i < path.length - 1) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.setIndex(index)
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })))
  }
  estate.roads.forEach(r => ribbon(r.points, r.kind === 'perimeter' ? 18 : 30, r.kind === 'gated-link' ? 0xa4542f : 0x56524a, 4))
  estate.walkways.forEach(w => ribbon(w.points, 12, 0x2f6f62, 8))
  const rw = estate.runway.rect
  ribbon([{ x: rw.x + rw.w / 2, y: rw.y }, { x: rw.x + rw.w / 2, y: rw.y + rw.d }], 75, 0x33322f, 5)

  const rectBox = (r: Rect, height: number, color: number) => {
    const cx = toFt(r.x + r.w / 2), cy = toFt(r.y + r.d / 2)
    addBox(scene, X(cx), elev(cx, cy) + height / 2, Z(cy), toFt(r.w), height, toFt(r.d), color)
  }
  // Detailed buildings show their own look: a stone base, siding walls, and a roof cap in the palette's colors. Simple site
  // boxes keep the access colors.
  estate.buildings.forEach(b => {
    const house = allHouses(estate).find(h => h.buildingId === b.id)
    if (!house) return partsOf(b).forEach(part => rectBox(part, toFt(b.height), COLORS[b.access]))
    const pal = paletteOf(house), H = toFt(b.height), base = Math.min(H * 0.25, toFt(pal.baseHeight) || 0), cap = Math.min(4, H * 0.2)
    for (const r of partsOf(b)) {
      const cx = toFt(r.x + r.w / 2), cy = toFt(r.y + r.d / 2), g = elev(cx, cy)
      if (base) addBox(scene, X(cx), g + base / 2, Z(cy), toFt(r.w), base, toFt(r.d), pal.stone)
      addBox(scene, X(cx), g + base + (H - base - cap) / 2, Z(cy), toFt(r.w), H - base - cap, toFt(r.d), pal.siding)
      addBox(scene, X(cx), g + H - cap / 2, Z(cy), toFt(r.w) + 3, cap, toFt(r.d) + 3, pal.roof)
    }
  })
  const pond = estate.zones.find(z => z.kind === 'water')
  if (pond) {
    const cx = toFt(pond.rect.x + pond.rect.w / 2), cy = toFt(pond.rect.y + pond.rect.d / 2)
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 40), new THREE.MeshBasicMaterial({ color: 0x5c9ab5 }))
    water.scale.set(toFt(pond.rect.w) / 2, 5, toFt(pond.rect.d) / 2)
    water.position.set(X(cx), elev(cx, cy) + 8, Z(cy))
    scene.add(water)
  }
  return S
}

/** Roof planes and gable walls as flat polygons, fanned into triangles. Plan x east, y north, z up; scene y is up. */
function addRoofs(scene: THREE.Scene, estate: Estate, cx: number, cy: number, pal: Palette = paletteOf(estate.house), look?: Look) {
  const roofVerts: number[] = [], gableVerts: number[] = []
  for (const roof of estate.house.roofs) for (const poly of roofPolygons(estate.house, roof)) {
    const v = poly.pts.map(([x, y, z]) => [toFt(x) - cx, toFt(z), cy - toFt(y)])
    const out = poly.kind === 'roof' ? roofVerts : gableVerts
    for (let i = 1; i < v.length - 1; i++) out.push(...v[0], ...v[i], ...v[i + 1])
  }
  for (const [verts, color, surface] of [[roofVerts, pal.roof, 'roof'], [gableVerts, pal.siding, 'siding']] as const) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.computeVertexNormals()
    if (look?.detailed) {
      worldUV(g, surface)
      const m = look.mat(surface, color).clone()
      m.side = THREE.DoubleSide
      const mesh = new THREE.Mesh(g, m)
      mesh.castShadow = true; mesh.receiveShadow = true
      scene.add(mesh)
    } else scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })))
  }
}

function buildHouse(scene: THREE.Scene, estate: Estate, levelId: string, onlyThisLevel = false, look: Look = makeLook('fast', paletteOf(estate.house))) {
  const levels = estate.house.levels
  const top = levels.findIndex(l => l.id === levelId)
  const visible = onlyThisLevel ? [levels[top < 0 ? 0 : top]] : levels.slice(0, (top < 0 ? 1 : top) + 1)
  const showRoofs = !onlyThisLevel && top === levels.length - 1
  const b = houseBounds(estate.house)
  const pal = paletteOf(estate.house)
  const cx = toFt(b.x + b.w / 2), cy = toFt(b.y + b.d / 2)
  addGround(scene, estate.house, cx, cy, toFt(b.w) + 192, toFt(b.d) + 152, look)
  addLandscape(scene, estate.house, cx, cy, look)
  // Each wing is a group turned about its pivot; inside it, rooms, walls, and furniture use the wing's own inches.
  const frames = new Map<string, THREE.Object3D>()
  const frame = (wingId?: string): THREE.Object3D => {
    const w = wingById(estate.house, wingId)
    if (!w) return scene
    if (!frames.has(w.id)) {
      const outer = new THREE.Group(), inner = new THREE.Group()
      outer.position.set(toFt(w.pivot.x) - cx, 0, cy - toFt(w.pivot.y))
      outer.rotation.y = w.angle * Math.PI / 180
      inner.position.set(cx, 0, -cy)
      outer.add(inner); scene.add(outer); frames.set(w.id, inner)
    }
    return frames.get(w.id)!
  }
  for (const level of visible) {
    const base = toFt(level.elevation)
    for (const room of level.rooms) {
      const x = toFt(room.rect.x) - cx, w = toFt(room.rect.w), d = toFt(room.rect.d), z = cy - toFt(room.rect.y) - d / 2
      const lawn = room.type === 'outdoor' && /lawn/i.test(room.name)
      addBox(frame(room.wingId), x + w / 2, base, z, w, 0.4, d, lawn ? 0x6f8f4a : floorColor(pal, room.type), 1, lawn ? 'grass' : floorSurface(room.type), look)
    }
    // Walls follow the derived segments, with doors and windows cut out of them.
    const openings = placeOpenings(estate.house).filter(o => o.levelId === level.id && o.wall && !o.problem)
    for (const seg of levelWalls(estate.house, level)) {
      const t = toFt(seg.thickness), g = frame(seg.wingId)
      // Outside walls have two faces: siding over a stone base outside, the interior finish inside.
      const out = seg.kind === 'interior' ? null : outwardSide(seg)
      const sign = out === 'n' || out === 'e' ? 1 : -1, stoneTop = toFt(pal.baseHeight)
      // Walls of two-story rooms rise through the floor above, up to the roof.
      const index = levels.indexOf(level)
      const tall = seg.sides.some(id => level.rooms.find(r => r.id === id)?.twoStory) && levels[index + 1] && visible.includes(levels[index + 1])
      const wall = toFt(level.floorHeight + (tall ? levels[index + 1].floorHeight : 0))
      // A piece of wall between positions a and b along the segment (inches), from height y0 to y1 (feet above the floor).
      const slab = (a: number, b: number, y0: number, y1: number, off: number, thick: number, tint: number, opacity = 1, surface: Surface = 'interior') => {
        if (b - a < 0.5 || y1 - y0 < 0.05) return
        const len = toFt(b - a), m = (a + b) / 2, h = y1 - y0
        if (seg.orientation === 'h') addBox(g, toFt(m) - cx, base + y0 + h / 2, cy - toFt(seg.at) - off, len, h, thick, tint, opacity, surface, look)
        else addBox(g, toFt(seg.at) - cx + off, base + y0 + h / 2, cy - toFt(m), thick, h, len, tint, opacity, surface, look)
      }
      const piece = (a: number, b: number, y0: number, y1: number, tint?: number, opacity = 1, surface: Surface = 'interior') => {
        if (tint !== undefined || !out) return slab(a, b, y0, y1, 0, t, tint ?? pal.interior, opacity, surface)
        // slab() moves a positive offset north (scene -z) or east (+x), so the outer half sits at +t/4 on the outside.
        const o = sign * t / 4
        slab(a, b, y0, y1, -o, t / 2, pal.interior)
        const stoneOut = seg.kind === 'foundation' || level.elevation < 0
        slab(a, b, Math.max(y0, Math.min(y1, stoneTop)), y1, o, t / 2, stoneOut ? pal.stone : pal.siding, 1, stoneOut ? 'stone' : 'siding')
        slab(a, b, y0, Math.min(y1, stoneTop), o, t / 2, pal.stone, 1, 'stone')
      }
      const holes = openings.filter(o => o.wall!.id === seg.id).sort((a, b) => a.from - b.from)
      let cursor = seg.from
      for (const o of holes) {
        piece(cursor, o.from, 0, wall)
        const sill = toFt(o.sill), head = Math.min(wall, toFt(o.sill + o.height))
        piece(o.from, o.to, 0, sill)
        piece(o.from, o.to, head, wall)
        if (o.kind === 'window' && !o.bay) {
          piece(o.from, o.to, sill, head, pal.glass, 0.35, 'glass')
          // Wide glass reads as panels: dark mullions about every 4 ft, as black window frames.
          const panels = Math.round((o.to - o.from) / 48)
          for (let j = 1; j < panels; j++) { const m = o.from + (o.to - o.from) * j / panels; piece(m - 1.5, m + 1.5, sill, head, pal.frame, 1, 'frame') }
        }
        if (look.detailed) {
          // Casings stand a little proud of both faces: black window frames, timber door casings.
          const trim = o.kind === 'window' ? pal.frame : pal.timber, proud = t + 0.12, cw = 3.5
          slab(o.from - cw, o.from, 0 + (o.kind === 'window' ? sill - 0.25 : 0), head + 0.3, 0, proud, trim, 1, o.kind === 'window' ? 'frame' : 'timber')
          slab(o.to, o.to + cw, 0 + (o.kind === 'window' ? sill - 0.25 : 0), head + 0.3, 0, proud, trim, 1, o.kind === 'window' ? 'frame' : 'timber')
          slab(o.from - cw, o.to + cw, head, head + 0.3, 0, proud, trim, 1, o.kind === 'window' ? 'frame' : 'timber')
          if (o.kind === 'window' && sill > 0.3) slab(o.from - cw, o.to + cw, sill - 0.25, sill, 0, proud + 0.15, trim, 1, 'frame')
        }
        cursor = o.to
      }
      piece(cursor, seg.to, 0, wall)
    }
  }
  // Bays: the floor carried out, solid below the sill and glass above on each face, a window seat, and a little roof.
  for (const level of visible) {
    const base = toFt(level.elevation)
    for (const o of placeOpenings(estate.house).filter(o => o.bay && !o.problem && o.wall && o.levelId === level.id)) {
      const g = frame(o.wall!.wingId), pts = bayOutline(o)
      const toBay = (p: P3) => [toFt(p[0]) - cx, base + toFt(p[2]), cy - toFt(p[1])]
      const flat = (z: number): Poly3 => ({ kind: 'roof', pts: pts.map(p => [p.x, p.y, z] as P3) })
      const head = o.sill + o.height
      addPolys(g, [flat(2)], toBay, pal.floor, 'both', 1, 'floor', look)
      addPolys(g, [flat(head + 2)], toBay, pal.roof, 'both', 1, 'roof', look)
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1]
        const face = (z0: number, z1: number): Poly3 => ({ kind: 'gable', pts: [[p.x, p.y, z0], [q.x, q.y, z0], [q.x, q.y, z1], [p.x, p.y, z1]] })
        addPolys(g, [face(0, o.sill)], toBay, pal.siding, 'both', 1, 'siding', look)
        addPolys(g, [face(o.sill, head)], toBay, pal.glass, 'both', 0.35, 'glass', look)
      }
      if (o.bay!.seat) addPolys(g, [flat(Math.min(o.sill, SEAT.height))], toBay, pal.timber, 'both', 1, 'timber', look)
    }
  }
  // Furniture and machines as plain blocks at their real heights.
  const FURNITURE_COLOR: Record<string, number> = { seating: 0x8d7b68, bed: 0xd8d2c4, table: 0x9c7b55, storage: 0xb59a78, kitchen: 0xd9d6cf, bath: 0xf4f4f2, equipment: 0x55595e, fixture: 0x6f8fa3, vehicle: 0x3d4a5c, outdoor: 0x8d7b68 }
  for (const level of visible) {
    const base = toFt(level.elevation) + 0.2
    const ids = new Set(level.rooms.map(r => r.id))
    for (const item of (estate.house.furniture ?? []).filter(i => ids.has(i.roomId) && CATALOG[i.kind])) {
      const c = CATALOG[item.kind], g = frame(level.rooms.find(r => r.id === item.roomId)?.wingId)
      const color = item.kind === 'pool-basin' ? 0x4a9cc4 : c.material ? pal[c.material] : FURNITURE_COLOR[c.category] ?? 0x8d7b68
      // Each piece's back, in scene x and z: it faces north at rotation 0, so its back is south (+z).
      const back: [number, number] = item.rotation === 0 ? [0, 1] : item.rotation === 180 ? [0, -1] : item.rotation === 90 ? [1, 0] : [-1, 0]
      for (const q of parts(item)) {
        const h = Math.max(0.1, toFt(q.h))
        if (look.detailed) {
          const m = partModel(look, { w: toFt(q.w), d: toFt(q.d), h, name: q.name, kind: item.kind, entry: c, back, color })
          m.position.set(toFt(q.x + q.w / 2) - cx, base, cy - toFt(q.y + q.d / 2))
          g.add(m)
        } else addBox(g, toFt(q.x + q.w / 2) - cx, base + h / 2, cy - toFt(q.y + q.d / 2), toFt(q.w), h, toFt(q.d), color)
      }
    }
  }
  // Porch posts in timber from the floor to the eave, and railings: a timber top rail on posts every 6 ft.
  const onLevel = (z: number) => visible.find(l => l.elevation === z)
  for (const pt of porchPosts(estate.house)) {
    if (!onLevel(pt.z)) continue
    addBox(frame(pt.wingId), toFt(pt.x) - cx, toFt(pt.z) + toFt(pt.h) / 2, cy - toFt(pt.y), toFt(pt.size), toFt(pt.h), toFt(pt.size), pal.timber, 1, 'timber', look)
  }
  for (const rl of railings(estate.house)) {
    if (!onLevel(rl.z)) continue
    const g = frame(rl.wingId), len = toFt(Math.hypot(rl.x2 - rl.x1, rl.y2 - rl.y1)), along = rl.y1 === rl.y2
    const mx = toFt((rl.x1 + rl.x2) / 2) - cx, mz = cy - toFt((rl.y1 + rl.y2) / 2), base = toFt(rl.z), h = toFt(rl.h)
    addBox(g, mx, base + h, mz, along ? len : 0.3, 0.3, along ? 0.3 : len, pal.timber, 1, 'timber', look)
    // Steel cable infill reads as a light glass panel at this scale.
    addBox(g, mx, base + h / 2, mz, along ? len : 0.05, h, along ? 0.05 : len, pal.glass, 0.25, 'glass', look)
    const n = Math.max(1, Math.round(len / 6))
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = toFt(rl.x1 + (rl.x2 - rl.x1) * t) - cx, pz = cy - toFt(rl.y1 + (rl.y2 - rl.y1) * t)
      addBox(g, px, base + h / 2, pz, 0.3, h, 0.3, pal.timber, 1, 'timber', look)
    }
  }
  // Room touches: rugs, lamps, art, TVs, and plants. Fast mode keeps the rugs and art as flat color.
  for (const d of roomDecor(estate.house)) {
    const level = visible.find(l => l.rooms.some(r => r.id === d.roomId))
    if (!level) continue
    const g = frame(d.wingId), base = toFt(level.elevation) + 0.2
    const x = toFt(d.rect.x + d.rect.w / 2) - cx, z = cy - toFt(d.rect.y + d.rect.d / 2), w = toFt(d.rect.w), dd = toFt(d.rect.d), h = toFt(d.h), y0 = base + toFt(d.z)
    if (d.kind === 'rug' || d.kind === 'art' || d.kind === 'tv') { addBox(g, x, y0 + h / 2, z, w, h, dd, d.color, 1, d.kind === 'rug' ? 'fabric' : 'plain', look); continue }
    if (!look.detailed) continue
    if (d.kind === 'plant') {
      addBox(g, x, y0 + 0.6, z, w * 0.7, 1.2, dd * 0.7, 0x6b4a33, 1, 'plain', look)
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, dd) * 0.75, 12, 10), look.mat('plain', d.color))
      leaves.position.set(x, y0 + h - Math.min(w, dd) * 0.6, z); leaves.castShadow = true; g.add(leaves)
      continue
    }
    // Lamps: a slim stand and a glowing shade.
    addBox(g, x, y0 + (h - 0.9) / 2, z, 0.12, h - 0.9, 0.12, 0x2b2b2b, 1, 'metal', look)
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 0.9, 16, 1, true), new THREE.MeshStandardMaterial({ color: d.color, emissive: 0xffd9a0, emissiveIntensity: 0.35, side: THREE.DoubleSide }))
    shade.position.set(x, y0 + h - 0.45, z); g.add(shade)
  }
  // Stairs: each tread a solid step up from the lower floor, and the landing.
  for (const st of estate.house.stairs) {
    const lower = visible.find(l => l.rooms.some(r => r.id === st.roomId))
    const geo = lower && stairGeometry(estate.house, st)
    if (!lower || !geo) continue
    const g = frame(geo.wingId), base = toFt(lower.elevation)
    for (const q of [...geo.treads.map(t => ({ r: t.rect, top: t.top })), ...(geo.landing ? [{ r: geo.landing.rect, top: geo.landing.top }] : [])]) {
      const h = toFt(q.top)
      addBox(g, toFt(q.r.x + q.r.w / 2) - cx, base + h / 2, cy - toFt(q.r.y + q.r.d / 2), toFt(q.r.w), h, toFt(q.r.d), pal.timber, 1, 'timber', look)
    }
  }
  // Ceilings, seen from inside only so the plan from above stays open, and their timber trusses and beams.
  const toScene = (p: P3) => [toFt(p[0]) - cx, toFt(p[2]), cy - toFt(p[1])]
  for (const level of visible) for (const room of level.rooms.filter(r => r.ceiling)) {
    const g = frame(room.wingId), polys = ceilingPolygons(estate.house, room)
    addPolys(g, polys.filter(p => p.kind === 'roof'), toScene, pal.ceiling, 'down', 1, 'ceiling', look)
    const glass = new Set(ceilingOf(estate.house, room).glassEnds ?? [])
    addPolys(g, polys.filter(p => p.kind === 'gable' && !(p.side && glass.has(p.side))), toScene, pal.interior, 'both', 1, 'interior', look)
    addPolys(g, polys.filter(p => p.kind === 'gable' && p.side && glass.has(p.side)), toScene, pal.glass, 'both', 0.35, 'glass', look)
    for (const t of ceilingTimber(estate.house, room)) {
      const [a, b] = [t.a, t.b].map(p => new THREE.Vector3(...toScene(p)))
      addTimber(g, a, b, toFt(t.w), toFt(t.d), pal.timber, look)
    }
  }
  if (showRoofs) addRoofs(scene, estate, cx, cy, pal, look)
  return { w: toFt(b.w), d: toFt(b.d) }
}

type Tour = 'none' | 'fly' | 'walk'
const FLIGHT_SECONDS = 45
const EYE_FT = 5.5
const WALK_FT_PER_S = 6

export function Scene3D({ estate, mode, levelId }: { estate: Estate; mode: 'site' | 'house'; levelId: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [tour, setTour] = useState<Tour>('none')
  const [quality, setQuality] = useState<Quality>(() => { try { return localStorage.getItem('house3d-quality') === 'fast' ? 'fast' : 'detailed' } catch { return 'detailed' } })
  const pickQuality = (q: Quality) => { setQuality(q); try { localStorage.setItem('house3d-quality', q) } catch { /* storage may be off */ } }
  useEffect(() => { setTour('none') }, [mode])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const cleanups: (() => void)[] = []
    const scene = new THREE.Scene()
    const detailed = mode === 'house' && quality === 'detailed'
    scene.background = new THREE.Color(detailed ? 0xc4d6e4 : 0xdfe7ea)
    // Detailed views get a brighter sky fill when walking, standing in for light bouncing around the rooms.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7d66, detailed ? (tour === 'walk' ? 1.6 : 1.0) : 1.7))
    const sun = new THREE.DirectionalLight(0xfff1d6, detailed ? 3.2 : 2.1)
    sun.position.set(-2, 3, 2)
    scene.add(sun)
    if (detailed) {
      // Soft afternoon sun from the southwest with shadows, filmic tone, and soft reflections from a studio environment.
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      const pmrem = new THREE.PMREMGenerator(renderer)
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      scene.environment = env
      scene.environmentIntensity = 0.45
      cleanups.push(() => { env.dispose(); pmrem.dispose() })
      sun.castShadow = true
      sun.shadow.mapSize.set(4096, 4096)
      sun.shadow.bias = -0.0004
      sun.shadow.normalBias = 0.4
      scene.add(sun.target)
    }

    const walking = mode === 'house' && tour === 'walk'
    const camera = new THREE.PerspectiveCamera(walking ? 70 : 42, 1, walking ? 0.3 : mode === 'site' ? 10 : 1, mode === 'site' ? 40000 : 3000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.49
    /** Runs every frame during a tour. */
    let animate: ((dt: number) => void) | null = null

    if (mode === 'site') {
      const S = buildSite(scene, estate)
      camera.position.set(-S * 0.25, S * 0.72, S * 1.02)
      controls.target.set(0, 120, 0)
      if (tour === 'fly') {
        // The flight path from the model, lifted over the terrain, smoothed into curves.
        const terrain = new Terrain(estate.parcel)
        const ground = (x: number, y: number) => toFt(terrain.at(ft(x), ft(y))) - 3600
        const keys = flyoverKeyframes(estate)
        const toScene = (x: number, y: number, z: number) => new THREE.Vector3(x - S / 2, ground(x, y) + z, S / 2 - y)
        const path = new THREE.CatmullRomCurve3(keys.map(k => toScene(k.x, k.y, k.z)))
        const look = new THREE.CatmullRomCurve3(keys.map(k => toScene(k.lookX, k.lookY, k.lookZ)))
        controls.enabled = false
        let t = 0
        animate = dt => {
          t = Math.min(1, t + dt / FLIGHT_SECONDS)
          // Both curves are timed by keyframe, not by length, so the camera and what it looks at stay in step.
          camera.position.copy(path.getPoint(t))
          camera.lookAt(look.getPoint(t))
          if (t >= 1) setTour('none')
        }
      }
    } else {
      const size = buildHouse(scene, estate, levelId, walking, makeLook(detailed ? 'detailed' : 'fast', paletteOf(estate.house)))
      if (detailed) {
        // The shadow camera covers the house and its yard.
        const r = Math.max(size.w, size.d) * 0.75 + 20
        sun.position.set(-r * 0.8, r * 1.4, r * 0.9)
        Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: r * 5 })
        sun.shadow.camera.updateProjectionMatrix()
      }
      camera.position.set(-90, 210, 290)
      controls.target.set(0, 0, 0)
      if (walking) {
        // First person on the selected level. Walls block, doors and openings let you through.
        const b = houseBounds(estate.house)
        const cx = toFt(b.x + b.w / 2), cy = toFt(b.y + b.d / 2)
        const level = estate.house.levels.find(l => l.id === levelId) ?? estate.house.levels[0]
        let pos = walkStart(estate.house, level.id)
        let yaw = -Math.PI / 2, pitch = 0
        const keys = new Set<string>()
        controls.enabled = false
        const down = (e: KeyboardEvent) => { if (!(e.target instanceof Element && e.target.closest('input, textarea'))) { keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow')) e.preventDefault() } }
        const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
        const look = (e: PointerEvent) => { if (e.buttons) { yaw -= e.movementX * 0.005; pitch = Math.max(-1, Math.min(1, pitch - e.movementY * 0.004)) } }
        window.addEventListener('keydown', down)
        window.addEventListener('keyup', up)
        renderer.domElement.addEventListener('pointermove', look)
        cleanups.push(() => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); renderer.domElement.removeEventListener('pointermove', look) })
        animate = dt => {
          if (keys.has('arrowleft')) yaw += 1.6 * dt
          if (keys.has('arrowright')) yaw -= 1.6 * dt
          const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
          const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
          const speed = WALK_FT_PER_S * 12 * dt * (keys.has('shift') ? 2 : 1)
          const dx = (Math.cos(yaw) * fwd + Math.sin(yaw) * side) * speed
          const dy = (Math.sin(yaw) * fwd - Math.cos(yaw) * side) * speed
          if (dx || dy) pos = step(estate.house, level.id, pos, dx, dy)
          const eye = new THREE.Vector3(toFt(pos.x) - cx, toFt(level.elevation) + EYE_FT, cy - toFt(pos.y))
          camera.position.copy(eye)
          camera.lookAt(eye.x + Math.cos(yaw) * Math.cos(pitch), eye.y + Math.sin(pitch), eye.z - Math.sin(yaw) * Math.cos(pitch))
        }
      }
    }

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    resize()

    let frame = 0
    let last = performance.now()
    const tick = (now = performance.now()) => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (animate) animate(dt)
      else controls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      cleanups.forEach(c => c())
      observer.disconnect()
      controls.dispose()
      scene.traverse(o => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const m = mesh.material as THREE.Material | undefined
        m?.dispose?.()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [estate, mode, levelId, tour, quality])

  return (
    <div className="scene-wrap">
      <div className="scene" ref={host} aria-label={tour === 'walk' ? 'Walkthrough. W A S D or arrow keys to move, drag to look.' : '3D view. Drag to orbit, scroll to zoom.'} />
      <div className="scene-tools">
        {mode === 'site' && <button className={tour === 'fly' ? 'active' : ''} onClick={() => setTour(t => t === 'fly' ? 'none' : 'fly')}>{tour === 'fly' ? 'Stop flyover' : 'Fly over'}</button>}
        {mode === 'house' && <button className={tour === 'walk' ? 'active' : ''} onClick={() => setTour(t => t === 'walk' ? 'none' : 'walk')}>{tour === 'walk' ? 'Stop walking' : 'Walk through'}</button>}
        {mode === 'house' && (
          <span role="group" aria-label="3D quality">
            <button className={quality === 'detailed' ? 'active' : ''} aria-pressed={quality === 'detailed'} onClick={() => pickQuality('detailed')} title="Materials, textures, shaped furniture, sun and shadows">Detailed</button>
            <button className={quality === 'fast' ? 'active' : ''} aria-pressed={quality === 'fast'} onClick={() => pickQuality('fast')} title="Plain blocks, quick on any computer">Fast</button>
          </span>
        )}
        {tour === 'walk' && <span>W A S D or arrows to move, Shift to hurry, drag to look. Pick a floor above to change levels.</span>}
      </div>
    </div>
  )
}
