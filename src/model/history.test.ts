import { describe, expect, it } from 'vitest'
import { sampleEstate } from './sampleEstate'
import { canRedo, canUndo, commit, currentEstate, loadProject, redo, saveProject, startTimeline, undo, resumeProject } from './history'
import type { Timeline } from './history'
import type { EditOp } from './edits'
import { ft } from './geometry'

const move = (dx: number): EditOp => ({ op: 'moveBuilding', buildingId: 'fuel', dx: ft(dx), dy: 0 })
const fuelX = (t: Timeline) => currentEstate(t).buildings.find(b => b.id === 'fuel')!.rect.x
const must = (r: ReturnType<typeof commit>) => { if (!r.ok) throw new Error(r.error); return r.timeline }

describe('history', () => {
  const x0 = fuelX(startTimeline(sampleEstate))

  it('undoes and redoes a group of edits as one step', () => {
    let t = must(commit(startTimeline(sampleEstate), [move(10), move(5)], 'claude', 'move fuel 15 ft east'))
    expect(fuelX(t)).toBe(x0 + ft(15))
    t = undo(t)
    expect(fuelX(t)).toBe(x0)
    expect(canUndo(t)).toBe(false)
    t = redo(t)
    expect(fuelX(t)).toBe(x0 + ft(15))
    expect(canRedo(t)).toBe(false)
  })

  it('drops redo history when a new change is made after undo', () => {
    let t = must(commit(startTimeline(sampleEstate), [move(10)], 'owner'))
    t = must(commit(t, [move(10)], 'owner'))
    t = undo(t)
    t = must(commit(t, [move(-5)], 'owner'))
    expect(fuelX(t)).toBe(x0 + ft(5))
    expect(canRedo(t)).toBe(false)
    expect(t.revisions.map(r => r.id)).toEqual([1, 2])
  })

  it('records author, request, edits, and check results', () => {
    const t = must(commit(startTimeline(sampleEstate), [move(10)], 'claude', 'nudge the fuel island', new Date('2026-11-08T12:00:00Z')))
    expect(t.revisions[0]).toMatchObject({ id: 1, author: 'claude', request: 'nudge the fuel island', ops: [move(10)], timestamp: '2026-11-08T12:00:00.000Z' })
    expect(t.revisions[0].checks.length).toBeGreaterThan(0)
  })

  it('does not commit a failing edit', () => {
    const r = commit(startTimeline(sampleEstate), [{ op: 'removeRoom', roomId: 'missing' }], 'owner')
    expect(r.ok).toBe(false)
  })

  it('saves and reloads a project by replaying its revisions', () => {
    let t = must(commit(startTimeline(sampleEstate), [move(10)], 'owner'))
    t = must(commit(t, [move(20)], 'claude', 'more'))
    t = undo(t)
    const loaded = loadProject(JSON.parse(JSON.stringify(saveProject(t))))
    if (!loaded.ok) throw new Error(loaded.error)
    expect(fuelX(loaded.timeline)).toBe(x0 + ft(10))
    expect(loaded.timeline.revisions).toHaveLength(2)
    expect(loaded.timeline.index).toBe(1)
    expect(fuelX(redo(loaded.timeline))).toBe(x0 + ft(30))
    expect(loadProject({ hello: 'world' }).ok).toBe(false)
  })
})

describe('resuming the browser session', () => {
  it('follows the current sample when the saved project has no edits of its own', () => {
    const old = structuredClone(sampleEstate)
    old.house = { ...old.house, origin: { x: old.house.origin.x + 120, y: old.house.origin.y } }
    const saved = saveProject(startTimeline(old))
    const r = resumeProject(JSON.parse(JSON.stringify(saved)), sampleEstate)
    if (!r.ok) throw new Error(r.error)
    expect(r.timeline.states[0].house.origin).toEqual(sampleEstate.house.origin)
  })

  it('keeps a project that has edits', () => {
    const t = commit(startTimeline(sampleEstate), [{ op: 'renameRoom', roomId: 'office', name: 'Reading room' }], 'owner')
    if (!t.ok) throw new Error(t.error)
    const r = resumeProject(JSON.parse(JSON.stringify(saveProject(t.timeline))), sampleEstate)
    if (!r.ok) throw new Error(r.error)
    expect(r.timeline.revisions).toHaveLength(1)
  })
})
