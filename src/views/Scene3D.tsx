import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Estate, Rect } from '../model/types'
import { Terrain } from '../model/parcel'
import { ft, partsOf, samplePath, toFt } from '../model/geometry'
import { ROOM_COLOR } from './HousePlan'

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

function buildHouse(scene: THREE.Scene, estate: Estate, levelId: string) {
  const levels = estate.house.levels
  const top = levels.findIndex(l => l.id === levelId)
  const visible = levels.slice(0, (top < 0 ? 1 : top) + 1)
  addBox(scene, 0, -12.5, 0, 420, 1, 260, 0xa9bb8c)
  for (const level of visible) {
    const base = toFt(level.elevation)
    const wall = toFt(level.floorHeight)
    for (const room of level.rooms) {
      const x = toFt(room.rect.x) - 76, w = toFt(room.rect.w), d = toFt(room.rect.d), z = 54 - toFt(room.rect.y) - d / 2
      addBox(scene, x + w / 2, base, z, w, 0.4, d, ROOM_COLOR[room.type])
      const t = 0.5, y = base + wall / 2, color = 0xf4f0e7
      addBox(scene, x + w / 2, y, z + d / 2, w, wall, t, color)
      addBox(scene, x + w / 2, y, z - d / 2, w, wall, t, color)
      addBox(scene, x, y, z, t, wall, d, color)
      addBox(scene, x + w, y, z, t, wall, d, color)
    }
  }
}

export function Scene3D({ estate, mode, levelId }: { estate: Estate; mode: 'site' | 'house'; levelId: string }) {
  const host = useRef<HTMLDivElement>(null)

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

    const camera = new THREE.PerspectiveCamera(42, 1, mode === 'site' ? 10 : 1, mode === 'site' ? 40000 : 3000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.49
    if (mode === 'site') {
      const S = buildSite(scene, estate)
      camera.position.set(-S * 0.25, S * 0.72, S * 1.02)
      controls.target.set(0, 120, 0)
    } else {
      buildHouse(scene, estate, levelId)
      camera.position.set(-90, 210, 290)
      controls.target.set(0, 0, 0)
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
    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
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
  }, [estate, mode, levelId])

  return <div className="scene" ref={host} aria-label="3D view. Drag to orbit, scroll to zoom." />
}
