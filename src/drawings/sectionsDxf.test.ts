import { describe, expect, it } from 'vitest'
import DxfParser from 'dxf-parser'
import { sampleEstate } from '../model/sampleEstate'
import { applyOperations } from '../model/edits'
import { placeOpenings } from '../model/walls'
import { ft } from '../model/geometry'
import { sectionCuts, sectionMarks } from './sections'
import { floorPlansDxf } from './dxf'
import { drawingSet } from './drawingSet'
import type { Mark } from './sheet'

const info = { revision: 0, date: '2026-11-09', projectName: 'House Project' }
const texts = (marks: Mark[]) => marks.flatMap(m => m.t === 'text' ? [m.text] : [])

describe('building sections', () => {
  it('cut north-south and east-west through the two-story great room, clear of wall lines', () => {
    // The middle of the great room falls on a walkout wall line, so each cut moves 2 ft to pass through rooms instead.
    expect(sectionCuts(sampleEstate.house)).toEqual([{ id: 'A', axis: 'x', at: ft(122) }, { id: 'B', axis: 'y', at: ft(78) }])
  })

  it('show cut walls, floors, the roof profile, and room names', () => {
    const a = sectionMarks(sampleEstate, sectionCuts(sampleEstate.house)[0], 0, 0)
    const t = texts(a.marks)
    expect(t).toEqual(expect.arrayContaining(['GREAT ROOM', 'STEAM ROOM', 'SAUNA', `MAIN FLOOR 0'-0"`]))
    // The bar roof crosses the cut twice, once per slope.
    expect(a.marks.filter(m => m.t === 'line' && m.w === 3).length).toBeGreaterThanOrEqual(2)
    expect(a.marks.filter(m => m.t === 'path' && m.fill === '#000').length).toBeGreaterThan(3)
  })

  it('appear on sheet A-401 and are marked on every floor plan', () => {
    const set = drawingSet(sampleEstate, info)
    expect(set.map(s => s.number)).toEqual(['G-001', 'A-101', 'A-102', 'A-103', 'A-201', 'A-202', 'A-301', 'A-401', 'A-601'])
    const sections = set.find(s => s.number === 'A-401')!
    expect(texts(sections.marks)).toEqual(expect.arrayContaining(['SECTION A', 'SECTION B', 'BUILDING SECTIONS']))
    for (const n of ['A-101', 'A-102', 'A-103']) {
      const t = texts(set.find(s => s.number === n)!.marks)
      expect(t.filter(x => x === 'A-401').length, n).toBe(4)
    }
  })
})

describe('DXF floor plans', () => {
  const dxf = floorPlansDxf(sampleEstate)
  const parsed = new DxfParser().parseSync(dxf)!

  it('is readable by an independent DXF parser', () => {
    expect(parsed).toBeTruthy()
    expect(dxf.endsWith('EOF\r\n')).toBe(true)
  })

  it('puts each level on its own layers', () => {
    const names = Object.keys(parsed.tables.layer.layers)
    for (const level of ['WALKOUT', 'MAIN', 'UPPER']) {
      expect(names).toEqual(expect.arrayContaining([`A-WALL-${level}`, `A-DOOR-${level}`, `A-GLAZ-${level}`, `A-AREA-IDEN-${level}`]))
    }
  })

  it('draws a swing arc for every door and names every room', () => {
    const doors = placeOpenings(sampleEstate.house).filter(o => !o.problem && o.kind === 'door')
    const arcs = parsed.entities.filter(e => e.type === 'ARC')
    expect(arcs).toHaveLength(doors.length)
    const words = parsed.entities.filter(e => e.type === 'TEXT').map(e => (e as unknown as { text: string }).text)
    for (const r of sampleEstate.house.levels.flatMap(l => l.rooms)) expect(words).toContain(r.name.toUpperCase().replace(/[^\x20-\x7e]/g, '-'))
  })

  it('is in inches, at true size', () => {
    const lines = parsed.entities.filter(e => e.type === 'LINE' && e.layer === 'A-WALL-MAIN') as unknown as { vertices: { x: number }[] }[]
    const xs = lines.flatMap(l => l.vertices.map(v => v.x))
    // The main floor sits second from the left; its walls span 228 ft plus wall thickness.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(ft(228))
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(ft(229))
  })

  it('follows edits', () => {
    const r = applyOperations(sampleEstate, [{ op: 'renameRoom', roomId: 'library', name: 'Reading room' }])
    if (!r.ok) throw new Error(r.error)
    expect(floorPlansDxf(r.estate)).toContain('READING ROOM')
  })
})

describe('section sheet layout', () => {
  it('keeps both sections clear of the title block', () => {
    const titleLeft = 36 * 72 - 18 - 3.5 * 72
    const sheet = drawingSet(sampleEstate, info).find(s => s.number === 'A-401')!
    for (const m of sheet.marks) {
      if (m.t === 'text' && m.x > titleLeft) continue
      if (m.t === 'line' && m.x1 >= titleLeft && m.x2 >= titleLeft) continue
      const xs = m.t === 'line' ? [m.x1, m.x2] : m.t === 'text' ? [m.x] : []
      for (const x of xs) expect(x, JSON.stringify(m).slice(0, 80)).toBeLessThan(titleLeft)
    }
  })
})
