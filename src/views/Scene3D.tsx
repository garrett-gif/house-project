import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Estate, Rect } from '../model/types'
import { Terrain } from '../model/parcel'
import { ft, partsOf, samplePath, toFt } from '../model/geometry'
import { ROOM_COLOR } from './HousePlan'
import { houseBounds } from '../model/derive'
import { CATALOG, parts } from '../model/furniture'
import { levelWalls, placeOpenings } from '../model/walls'
import { roofPolygons } from '../model/roofs'
import { wingById } from '../model/wings'
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

function addBox(group: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: number | string, opacity = 1) {
  const mat = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  group.add(mesh)
  return mesh
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
  estate.buildings.forEach(b => partsOf(b).forEach(part => rectBox(part, toFt(b.height), COLORS[b.access])))
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
function addRoofs(scene: THREE.Scene, estate: Estate, cx: number, cy: number) {
  const roofVerts: number[] = [], gableVerts: number[] = []
  for (const roof of estate.house.roofs) for (const poly of roofPolygons(estate.house, roof)) {
    const v = poly.pts.map(([x, y, z]) => [toFt(x) - cx, toFt(z), cy - toFt(y)])
    const out = poly.kind === 'roof' ? roofVerts : gableVerts
    for (let i = 1; i < v.length - 1; i++) out.push(...v[0], ...v[i], ...v[i + 1])
  }
  for (const [verts, color] of [[roofVerts, 0x5b5f63], [gableVerts, 0xe9e3d6]] as const) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.computeVertexNormals()
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })))
  }
}

function buildHouse(scene: THREE.Scene, estate: Estate, levelId: string, onlyThisLevel = false) {
  const levels = estate.house.levels
  const top = levels.findIndex(l => l.id === levelId)
  const visible = onlyThisLevel ? [levels[top < 0 ? 0 : top]] : levels.slice(0, (top < 0 ? 1 : top) + 1)
  const showRoofs = !onlyThisLevel && top === levels.length - 1
  const b = houseBounds(estate.house)
  const cx = toFt(b.x + b.w / 2), cy = toFt(b.y + b.d / 2)
  addBox(scene, 0, -12.5, 0, toFt(b.w) + 192, 1, toFt(b.d) + 152, 0xa9bb8c)
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
      addBox(frame(room.wingId), x + w / 2, base, z, w, 0.4, d, ROOM_COLOR[room.type])
    }
    // Walls follow the derived segments, with doors and windows cut out of them.
    const openings = placeOpenings(estate.house).filter(o => o.levelId === level.id && o.wall && !o.problem)
    const WALL_COLOR = { exterior: 0xe9e3d6, interior: 0xf6f2ea, foundation: 0xc9c2b4 }
    for (const seg of levelWalls(estate.house, level)) {
      const t = toFt(seg.thickness), color = WALL_COLOR[seg.kind], g = frame(seg.wingId)
      // Walls of two-story rooms rise through the floor above, up to the roof.
      const index = levels.indexOf(level)
      const tall = seg.sides.some(id => level.rooms.find(r => r.id === id)?.twoStory) && levels[index + 1] && visible.includes(levels[index + 1])
      const wall = toFt(level.floorHeight + (tall ? levels[index + 1].floorHeight : 0))
      // A piece of wall between positions a and b along the segment (inches), from height y0 to y1 (feet above the floor).
      const piece = (a: number, b: number, y0: number, y1: number, tint = color, opacity = 1) => {
        if (b - a < 0.5 || y1 - y0 < 0.05) return
        const len = toFt(b - a), m = (a + b) / 2, h = y1 - y0
        if (seg.orientation === 'h') addBox(g, toFt(m) - cx, base + y0 + h / 2, cy - toFt(seg.at), len, h, t, tint, opacity)
        else addBox(g, toFt(seg.at) - cx, base + y0 + h / 2, cy - toFt(m), t, h, len, tint, opacity)
      }
      const holes = openings.filter(o => o.wall!.id === seg.id).sort((a, b) => a.from - b.from)
      let cursor = seg.from
      for (const o of holes) {
        piece(cursor, o.from, 0, wall)
        const sill = toFt(o.sill), head = Math.min(wall, toFt(o.sill + o.height))
        piece(o.from, o.to, 0, sill)
        piece(o.from, o.to, head, wall)
        if (o.kind === 'window') piece(o.from, o.to, sill, head, 0x9fc4d6, 0.35)
        cursor = o.to
      }
      piece(cursor, seg.to, 0, wall)
    }
  }
  // Furniture and machines as plain blocks at their real heights.
  const FURNITURE_COLOR: Record<string, number> = { seating: 0x8d7b68, bed: 0xd8d2c4, table: 0x9c7b55, storage: 0xb59a78, kitchen: 0xd9d6cf, bath: 0xf4f4f2, equipment: 0x55595e, fixture: 0x6f8fa3, vehicle: 0x3d4a5c, outdoor: 0x8d7b68 }
  for (const level of visible) {
    const base = toFt(level.elevation) + 0.2
    const ids = new Set(level.rooms.map(r => r.id))
    for (const item of (estate.house.furniture ?? []).filter(i => ids.has(i.roomId) && CATALOG[i.kind])) {
      const c = CATALOG[item.kind], g = frame(level.rooms.find(r => r.id === item.roomId)?.wingId)
      for (const q of parts(item)) {
        const h = Math.max(0.1, toFt(q.h))
        addBox(g, toFt(q.x + q.w / 2) - cx, base + h / 2, cy - toFt(q.y + q.d / 2), toFt(q.w), h, toFt(q.d), item.kind === 'pool-basin' ? 0x4a9cc4 : FURNITURE_COLOR[c.category] ?? 0x8d7b68)
      }
    }
  }
  if (showRoofs) addRoofs(scene, estate, cx, cy)
}

type Tour = 'none' | 'fly' | 'walk'
const FLIGHT_SECONDS = 45
const EYE_FT = 5.5
const WALK_FT_PER_S = 6

export function Scene3D({ estate, mode, levelId }: { estate: Estate; mode: 'site' | 'house'; levelId: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [tour, setTour] = useState<Tour>('none')
  useEffect(() => { setTour('none') }, [mode])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xdfe7ea)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6250, 1.7))
    const sun = new THREE.DirectionalLight(0xfff4df, 2.1)
    sun.position.set(-2, 3, 2)
    scene.add(sun)

    const walking = mode === 'house' && tour === 'walk'
    const camera = new THREE.PerspectiveCamera(walking ? 70 : 42, 1, walking ? 0.3 : mode === 'site' ? 10 : 1, mode === 'site' ? 40000 : 3000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.49
    /** Runs every frame during a tour. */
    let animate: ((dt: number) => void) | null = null
    const cleanups: (() => void)[] = []

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
      buildHouse(scene, estate, levelId, walking)
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
  }, [estate, mode, levelId, tour])

  return (
    <div className="scene-wrap">
      <div className="scene" ref={host} aria-label={tour === 'walk' ? 'Walkthrough. W A S D or arrow keys to move, drag to look.' : '3D view. Drag to orbit, scroll to zoom.'} />
      <div className="scene-tools">
        {mode === 'site' && <button className={tour === 'fly' ? 'active' : ''} onClick={() => setTour(t => t === 'fly' ? 'none' : 'fly')}>{tour === 'fly' ? 'Stop flyover' : 'Fly over'}</button>}
        {mode === 'house' && <button className={tour === 'walk' ? 'active' : ''} onClick={() => setTour(t => t === 'walk' ? 'none' : 'walk')}>{tour === 'walk' ? 'Stop walking' : 'Walk through'}</button>}
        {tour === 'walk' && <span>W A S D or arrows to move, Shift to hurry, drag to look. Pick a floor above to change levels.</span>}
      </div>
    </div>
  )
}
