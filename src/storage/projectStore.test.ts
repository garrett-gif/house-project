import { describe, expect, it } from 'vitest'
import { browserProjectStore } from './projectStore'
import { commit, loadProject, saveProject, startTimeline, undo } from '../model/history'
import { sampleEstate } from '../model/sampleEstate'
import { ft } from '../model/geometry'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) }
}

describe('browser project store', () => {
  it('round-trips a project, keeping undone revisions for redo', async () => {
    const store = browserProjectStore('test', memory())
    expect(await store.load()).toBeNull()
    let t = startTimeline(sampleEstate)
    for (const dx of [10, 20]) { const r = commit(t, [{ op: 'moveBuilding', buildingId: 'fuel', dx: ft(dx), dy: 0 }], 'claude'); if (!r.ok) throw new Error(r.error); t = r.timeline }
    t = undo(t)
    await store.save(saveProject(t))
    const loaded = loadProject(await store.load())
    if (!loaded.ok) throw new Error(loaded.error)
    expect(loaded.timeline.index).toBe(1)
    expect(loaded.timeline.revisions).toHaveLength(2)
    await store.clear()
    expect(await store.load()).toBeNull()
  })

  it('keeps the chat separately and clears both', async () => {
    const store = browserProjectStore('c', memory())
    await store.saveChat(Array.from({ length: 250 }, (_, i) => ({ id: i })))
    expect((await store.loadChat() as unknown[]).length).toBe(200)
    await store.clear()
    expect(await store.loadChat()).toBeNull()
  })

  it('treats unreadable data as empty', async () => {
    const m = memory()
    m.setItem('k', '{not json')
    expect(await browserProjectStore('k', m).load()).toBeNull()
  })
})
