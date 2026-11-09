import { describe, expect, it } from 'vitest'
import { sampleEstate } from '../model/sampleEstate'
import { applyOperations } from '../model/edits'
import { levelWalls } from '../model/walls'
import { ft } from '../model/geometry'
import { floorPlanSheets, SCALE } from './floorPlanSheet'
import { ARCH_D, ftIn } from './sheet'
import type { Mark } from './sheet'

const info = { revision: 4, date: '2026-11-08', projectName: 'House Project' }
const sheets = floorPlanSheets(sampleEstate, info)
const texts = (marks: Mark[]) => marks.flatMap(m => m.t === 'text' ? [m.text] : [])

describe('floor plan sheets', () => {
  it('makes one sheet per level, numbered from the lowest', () => {
    expect(sheets.map(s => [s.number, s.title])).toEqual([['A-101', 'Walkout level plan'], ['A-102', 'Main floor plan'], ['A-103', 'Kids floor plan']])
    expect(sheets.every(s => s.width === ARCH_D.width && s.height === ARCH_D.height)).toBe(true)
  })

  it('carries the draft stamp, scale, revision, and date on every sheet', () => {
    for (const s of sheets) {
      const t = texts(s.marks)
      expect(t).toContain('DRAFT')
      expect(t.join(' ')).toMatch(/NOT FOR CONSTRUCTION UNTIL REVIEWED/)
      expect(t).toContain(`Scale ${SCALE.label}`)
      expect(t).toContain('Drawn from model revision 4')
      expect(t).toContain('Date 2026-11-08')
      expect(t.join(' ')).toMatch(/does not mean the design meets code/)
      expect(t.join(' ')).not.toMatch(/code compliant|permit ready/i)
    }
  })

  it('draws walls at true 1/8" scale', () => {
    expect(SCALE.ptPerInch).toBe(0.75)
    const main = sampleEstate.house.levels.find(l => l.id === 'main')!
    const wall = levelWalls(sampleEstate.house, main).find(s => s.sides.includes('kitchen') && s.sides.includes('dining'))!
    const rects = sheets[1].marks.filter((m): m is Extract<Mark, { t: 'rect' }> => m.t === 'rect' && m.fill === '#333')
    expect(rects.some(r => Math.abs(r.w - wall.thickness * 0.75) < 0.01 && Math.abs(r.h - (wall.to - wall.from + wall.thickness) * 0.75) < 0.01)).toBe(true)
  })

  it('dimensions the overall house on the main floor', () => {
    // The center bar; the turned wings are dimensioned by their room sizes.
    const t = texts(sheets[1].marks)
    expect(t).toContain(`136'-0"`)
    // North to south, including the entry's 4 ft step out at the front door.
    expect(t).toContain(`72'-0"`)
  })

  it('follows edits, because sheets are drawn from the model', () => {
    const r = applyOperations(sampleEstate, [{ op: 'moveWall', roomId: 'kitchen', side: 'w', distance: ft(2) }])
    if (!r.ok) throw new Error(r.error)
    const t = texts(floorPlanSheets(r.estate, info)[1].marks)
    expect(t).toContain(`35'-0" × 28'-0"`)
    expect(t).toContain(`15'-0" × 14'-0"`)
  })

  it('keeps the plan on the paper and clear of the title block', () => {
    const titleLeft = ARCH_D.width - 36 / 2 - 3.5 * 72
    for (const s of sheets) {
      for (const m of s.marks) {
        const xs = m.t === 'line' ? [m.x1, m.x2] : m.t === 'rect' ? [m.x, m.x + m.w] : m.t === 'text' ? [m.x] : []
        const ys = m.t === 'line' ? [m.y1, m.y2] : m.t === 'rect' ? [m.y, m.y + m.h] : m.t === 'text' ? [m.y] : []
        for (const x of xs) expect(x).toBeGreaterThanOrEqual(0)
        for (const x of xs) expect(x).toBeLessThanOrEqual(ARCH_D.width)
        for (const y of ys) expect(y).toBeGreaterThanOrEqual(0)
        for (const y of ys) expect(y).toBeLessThanOrEqual(ARCH_D.height)
      }
      const walls = s.marks.filter((m): m is Extract<Mark, { t: 'rect' }> => m.t === 'rect' && (m.fill === '#000' || m.fill === '#333' || m.fill === '#555'))
      expect(Math.max(...walls.map(r => r.x + r.w))).toBeLessThan(titleLeft)
    }
  })
})

describe('ftIn', () => {
  it('writes feet and inches the way drawings do', () => {
    expect(ftIn(240)).toBe(`20'-0"`)
    expect(ftIn(42)).toBe(`3'-6"`)
    expect(ftIn(4.5)).toBe(`0'-4 1/2"`)
    expect(ftIn(143.9)).toBe(`12'-0"`)
  })
})
