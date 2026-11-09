import { describe, expect, it } from 'vitest'
import { sampleEstate } from '../model/sampleEstate'
import { applyOperations } from '../model/edits'
import { placeOpenings } from '../model/walls'
import { drawingSet } from './drawingSet'
import { openingMarks } from './marks'
import { ARCH_D } from './sheet'
import type { Mark } from './sheet'

const info = { revision: 2, date: '2026-11-09', projectName: 'House Project' }
const set = drawingSet(sampleEstate, info)
const texts = (marks: Mark[]) => marks.flatMap(m => m.t === 'text' ? [m.text] : [])
const sheet = (n: string) => set.find(s => s.number === n)!

describe('drawing set', () => {
  it('has a cover, plans, elevations, a roof plan, and schedules, numbered in order', () => {
    expect(set.map(s => s.number)).toEqual(['G-001', 'A-101', 'A-102', 'A-103', 'A-201', 'A-202', 'A-301', 'A-401', 'A-601'])
    set.forEach((s, i) => expect(texts(s.marks)).toContain(`Sheet ${i + 1} of 9`))
  })

  it('lists every sheet on the cover, with floor areas and the draft statement', () => {
    const t = texts(sheet('G-001').marks)
    for (const s of set) { expect(t).toContain(s.number); expect(t).toContain(s.title) }
    expect(t).toContain('DRAFT. NOT FOR CONSTRUCTION UNTIL REVIEWED BY A QUALIFIED PERSON.')
    expect(t).toContain('Total, excluding garage and outdoor rooms')
    expect(t.join(' ')).toMatch(/\d+ of \d+ pass\. These are planning aids, not a code review\./)
    expect(t.join(' ')).not.toMatch(/code compliant|permit ready|complies with/i)
    // Every mention of meeting code is the disclaimer.
    expect(t.join(' ').match(/meets code/g)?.length).toBe(t.join(' ').match(/does not mean the design meets code/g)?.length)
  })

  it('schedules every door and window under a stable mark', () => {
    const marks = openingMarks(sampleEstate.house)
    const placed = placeOpenings(sampleEstate.house).filter(o => !o.problem)
    expect(marks.size).toBe(placed.length)
    expect(new Set(marks.values()).size).toBe(marks.size)
    expect(openingMarks(sampleEstate.house)).toEqual(marks)
    const t = texts(sheet('A-601').marks)
    for (const m of marks.values()) expect(t).toContain(m)
    expect(t).toContain('DOOR SCHEDULE')
    expect(t).toContain('WINDOW SCHEDULE')
  })

  it('tags openings on the plan with the same marks', () => {
    const marks = openingMarks(sampleEstate.house)
    const mainIds = placeOpenings(sampleEstate.house).filter(o => o.levelId === 'main' && !o.problem).map(o => marks.get(o.id)!)
    const t = texts(sheet('A-102').marks)
    for (const m of mainIds) expect(t).toContain(m)
  })

  it('marks every bedroom window in the sample as meeting the escape planning values', () => {
    const rows = sheet('A-601').marks.filter((m): m is Extract<Mark, { t: 'text' }> => m.t === 'text' && (m.text === 'Yes' || m.text === 'NO'))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.text === 'Yes')).toBe(true)
  })

  it('updates the schedule when a window shrinks too far to escape through', () => {
    const win = placeOpenings(sampleEstate.house).find(o => o.roomId === 'kid-2' && o.kind === 'window')!
    const r = applyOperations(sampleEstate, [{ op: 'resizeOpening', openingId: win.id, width: 24, height: 24, sill: 60 }])
    if (!r.ok) throw new Error(r.error)
    expect(texts(drawingSet(r.estate, info).find(s => s.number === 'A-601')!.marks)).toContain('NO')
  })

  it('keeps every sheet on the paper', () => {
    for (const s of set) for (const m of s.marks) {
      const pts = m.t === 'line' ? [[m.x1, m.y1], [m.x2, m.y2]] : m.t === 'rect' ? [[m.x, m.y], [m.x + m.w, m.y + m.h]] : m.t === 'text' ? [[m.x, m.y]] : []
      for (const [x, y] of pts) {
        expect(x, `${s.number} ${JSON.stringify(m).slice(0, 80)}`).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(ARCH_D.width)
        expect(y, `${s.number} ${JSON.stringify(m).slice(0, 80)}`).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(ARCH_D.height)
      }
    }
  })
})
