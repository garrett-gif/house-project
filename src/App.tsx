import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Estate } from './model/types'
import type { EditOp } from './model/edits'
import { applyEdits, describeEdits } from './model/edits'
import { sampleEstate } from './model/sampleEstate'
import { diffChecks, validateEstate } from './model/validate'
import { appliedRevisions, canRedo, canUndo, commit, currentEstate, loadProject, redo, saveProject, startTimeline, undo } from './model/history'
import type { ChatTurn } from './chat/protocol'
import { requestEdits } from './chat/client'
import { SitePlan } from './views/SitePlan'
import { HousePlan } from './views/HousePlan'
import { Scene3D } from './views/Scene3D'
import { ChatPanel, CheckChanges } from './ui/ChatPanel'
import type { Turn } from './ui/ChatPanel'

type View = 'site' | 'house' | 'site3d' | 'house3d'
type Tab = 'chat' | 'checks' | 'history'
const VIEWS: [View, string][] = [['site', 'Site plan'], ['house', 'House plan'], ['site3d', 'Estate 3D'], ['house3d', 'House 3D']]
const MARK = { pass: '✓', warn: '!', fail: '✕' }

interface Proposal { request: string; ops: EditOp[]; estate: Estate }

/** Earlier turns as text for Claude, including what happened to each proposal. */
const chatHistory = (turns: Turn[]): ChatTurn[] => turns.flatMap(t => {
  if (t.status === 'error') return []
  const edits = t.edits?.length ? `\nEdits: ${t.edits.join('; ')}. The owner ${t.status === 'applied' ? 'applied' : 'discarded'} them.` : ''
  const text = `${t.text}${edits}`.trim()
  return text ? [{ role: t.role, text }] : []
})

export function App() {
  const [view, setView] = useState<View>('site')
  const [tab, setTab] = useState<Tab>('chat')
  const [level, setLevel] = useState('main')
  const [timeline, setTimeline] = useState(() => startTimeline(sampleEstate))
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const abort = useRef<AbortController | null>(null)
  const nextId = useRef(1)
  const fileInput = useRef<HTMLInputElement>(null)

  const current = currentEstate(timeline)
  const estate = proposal?.estate ?? current
  const checks = useMemo(() => validateEstate(estate), [estate])
  const failing = checks.filter(c => c.status !== 'pass').length
  const passed = checks.length - failing
  const levels = estate.house.levels.slice().reverse()
  const showsHouse = view === 'house' || view === 'house3d'

  const addTurn = (turn: Omit<Turn, 'id'>) => setTurns(ts => [...ts, { ...turn, id: nextId.current++ }])
  const settlePending = (status: Turn['status']) => setTurns(ts => ts.map(t => t.status === 'pending' ? { ...t, status } : t))

  const send = async (text: string) => {
    const history = chatHistory(turns)
    addTurn({ role: 'user', text })
    setBusy(true)
    setNotice('')
    abort.current = new AbortController()
    const res = await requestEdits(current, text, history, abort.current.signal)
    setBusy(false)
    if (!res.ok) { addTurn({ role: 'assistant', text: res.error, status: 'error' }); return }
    if (res.ops.length === 0) { addTurn({ role: 'assistant', text: res.reply || 'No edits proposed.', status: 'question' }); return }
    // Recheck locally with the browser's own copy of the model. The server's dry run is advisory.
    const applied = applyEdits(current, res.ops)
    if (!applied.ok) { addTurn({ role: 'assistant', text: `The proposed edits do not apply: ${applied.error}`, status: 'error' }); return }
    setProposal({ request: text, ops: res.ops, estate: applied.estate })
    addTurn({
      role: 'assistant', text: res.reply, status: 'pending',
      edits: describeEdits(res.ops, current),
      changes: diffChecks(validateEstate(current), validateEstate(applied.estate)),
    })
  }

  const apply = () => {
    if (!proposal) return
    const result = commit(timeline, proposal.ops, 'claude', proposal.request)
    if (!result.ok) { setNotice(result.error); return }
    setTimeline(result.timeline)
    setProposal(null)
    settlePending('applied')
  }
  const discard = () => { setProposal(null); settlePending('discarded') }
  const cancel = () => abort.current?.abort()

  const step = useCallback((dir: 'undo' | 'redo') => {
    if (proposal) return
    setTimeline(t => dir === 'undo' ? undo(t) : redo(t))
  }, [proposal])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]') || !(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); step('undo') }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); step('redo') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const save = () => {
    const blob = new Blob([JSON.stringify(saveProject(timeline), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `house-project-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const open = async (file: File) => {
    let data: unknown
    try { data = JSON.parse(await file.text()) } catch { setNotice('That file is not valid JSON.'); return }
    const loaded = loadProject(data)
    if (!loaded.ok) { setNotice(loaded.error); return }
    setTimeline(loaded.timeline)
    setProposal(null)
    settlePending('discarded')
    setNotice(`Opened ${file.name} with ${loaded.timeline.revisions.length} revision(s).`)
  }

  const revisions = timeline.revisions
  const appliedCount = appliedRevisions(timeline).length

  return (
    <div className="shell">
      <header>
        <div className="brand">
          <h1>{estate.name}</h1>
          <span>Site layout {estate.layoutVersion} · revision {appliedCount} · concept only</span>
        </div>
        <nav aria-label="Views">
          {VIEWS.map(([id, label]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>
          ))}
        </nav>
        <div className="tools" role="group" aria-label="Edit history">
          <button onClick={() => step('undo')} disabled={!!proposal || !canUndo(timeline)} title="Undo (Ctrl+Z)">Undo</button>
          <button onClick={() => step('redo')} disabled={!!proposal || !canRedo(timeline)} title="Redo (Ctrl+Shift+Z)">Redo</button>
          <button onClick={save} title="Download the project as JSON">Save</button>
          <button onClick={() => fileInput.current?.click()} title="Open a saved project">Open</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void open(f); e.target.value = '' }} />
        </div>
      </header>
      <main>
        <section className="stage">
          {proposal && (
            <div className="preview-bar" role="status">
              <span>Previewing {proposal.ops.length} proposed edit{proposal.ops.length === 1 ? '' : 's'}. Nothing is applied yet.</span>
              <span className="actions"><button className="primary" onClick={apply}>Apply</button><button onClick={discard}>Discard</button></span>
            </div>
          )}
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
          {showsHouse && (
            <div className="levels" role="group" aria-label="House level">
              {levels.map(l => <button key={l.id} className={level === l.id ? 'active' : ''} onClick={() => setLevel(l.id)}>{l.name}</button>)}
            </div>
          )}
          {view === 'site' && <SitePlan estate={estate} />}
          {view === 'house' && <HousePlan house={estate.house} levelId={level} />}
          {view === 'site3d' && <Scene3D estate={estate} mode="site" levelId={level} />}
          {view === 'house3d' && <Scene3D estate={estate} mode="house" levelId={level} />}
        </section>
        <aside>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
            <button role="tab" aria-selected={tab === 'checks'} className={tab === 'checks' ? 'active' : ''} onClick={() => setTab('checks')}>
              Checks{failing ? <span className="count">{failing}</span> : null}
            </button>
            <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
          </div>

          {tab === 'chat' && <ChatPanel turns={turns} busy={busy} onSend={send} onCancel={cancel} onApply={apply} onDiscard={discard} />}

          {tab === 'checks' && (
            <div className="panel">
              <p className="score">{passed} of {checks.length} passing this app's checks{proposal ? ' in the preview' : ''}</p>
              <ul className="checks">
                {checks.map(c => (
                  <li key={c.id} className={c.status}>
                    <b aria-label={c.status}>{MARK[c.status]}</b>
                    <div><strong>{c.label}</strong><small>{c.detail}</small></div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'history' && (
            <div className="panel">
              {revisions.length === 0 && <p className="muted small">No revisions yet. Applied chat edits appear here, and each one can be undone.</p>}
              <ol className="revisions" reversed>
                {revisions.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
                  <li key={r.id} className={i >= timeline.index ? 'undone' : ''}>
                    <strong>Revision {r.id} · {r.author === 'claude' ? 'Chat' : 'You'}{i >= timeline.index ? ' · undone' : ''}</strong>
                    <small>{new Date(r.timestamp).toLocaleString()}</small>
                    {r.request && <p className="request">“{r.request}”</p>}
                    <ul>{describeEdits(r.ops, timeline.states[i]).map((d, k) => <li key={k}>{d}</li>)}</ul>
                    <CheckChanges changes={diffChecks(validateEstate(timeline.states[i]), r.checks)} />
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="note">These are planning checks on a sample parcel. Passing them does not mean a design meets code.</p>
        </aside>
      </main>
    </div>
  )
}
