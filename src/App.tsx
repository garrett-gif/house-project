import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Estate } from './model/types'
import type { EditOp } from './model/edits'
import { applyOperations, describeEdit, describeEdits } from './model/edits'
import { sampleEstate } from './model/sampleEstate'
import { diffChecks, validateEstate } from './model/validate'
import { appliedRevisions, canRedo, canUndo, commit, currentEstate, loadProject, redo, saveProject, startTimeline, undo } from './model/history'
import type { ChatTurn } from './chat/protocol'
import { checkServer, requestEdits, requestSheetsPdf } from './chat/client'
import { drawingSet } from './drawings/drawingSet'
import { floorPlansDxf } from './drawings/dxf'
import { SheetView } from './views/SheetView'
import type { Health } from './chat/protocol'
import { browserProjectStore } from './storage/projectStore'
import { SitePlan } from './views/SitePlan'
import { HousePlan } from './views/HousePlan'
import { Scene3D } from './views/Scene3D'
import { ChatPanel, CheckChanges } from './ui/ChatPanel'
import type { Turn } from './ui/ChatPanel'

type View = 'site' | 'house' | 'site3d' | 'house3d' | 'sheets'
type Tab = 'chat' | 'checks' | 'history'
const VIEWS: [View, string][] = [['site', 'Site plan'], ['house', 'House plan'], ['site3d', 'Estate 3D'], ['house3d', 'House 3D'], ['sheets', 'Drawings']]
const MARK = { pass: '✓', warn: '!', fail: '✕' }

interface Proposal { request: string; ops: EditOp[]; estate: Estate }

/** Turns read back from storage. A proposal that was still open when the page closed is shown as discarded. */
function restoreTurns(data: unknown): Turn[] {
  if (!Array.isArray(data)) return []
  return data.filter((t): t is Turn => !!t && typeof t === 'object' && typeof (t as Turn).id === 'number' && ((t as Turn).role === 'user' || (t as Turn).role === 'assistant') && typeof (t as Turn).text === 'string')
    .map(t => t.status === 'pending' ? { ...t, status: 'discarded' } : t)
}

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
  const store = useMemo(() => browserProjectStore(), [])
  const [restored, setRestored] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [server, setServer] = useState<Health | null | undefined>(undefined)
  useEffect(() => { void checkServer().then(setServer) }, [])

  // Restore the last session once, then save after every change. Storage sits behind ProjectStore so it can move to Supabase.
  useEffect(() => {
    let live = true
    Promise.all([store.load(), store.loadChat()]).then(([data, chat]) => {
      if (!live) return
      if (data) {
        const r = loadProject(data)
        if (r.ok) setTimeline(r.timeline)
        else setNotice(`The saved project could not be restored (${r.error}). Starting from the sample estate.`)
      }
      const restoredTurns = restoreTurns(chat)
      if (restoredTurns.length) {
        setTurns(restoredTurns)
        nextId.current = Math.max(...restoredTurns.map(t => t.id)) + 1
      }
    }).catch(() => setNotice('Browser storage is unavailable, so changes will not be kept after reload.'))
      .finally(() => { if (live) setRestored(true) })
    return () => { live = false }
  }, [store])
  useEffect(() => {
    if (!restored) return
    store.saveChat(turns).catch(() => { /* the project save below reports storage problems */ })
  }, [restored, store, turns])
  useEffect(() => {
    if (!restored) return
    store.save(saveProject(timeline)).catch(() => setNotice('Could not save in this browser. Use Save to download a copy.'))
  }, [restored, store, timeline])

  const current = currentEstate(timeline)
  // While dragging, the plans show a live preview; checks wait for the drop, since some are too slow to run every frame.
  const [dragPreview, setDragPreview] = useState<Estate | null>(null)
  const [dragText, setDragText] = useState('')
  const checked = proposal?.estate ?? current
  const estate = proposal?.estate ?? dragPreview ?? current
  const checks = useMemo(() => validateEstate(checked), [checked])
  const failing = checks.filter(c => c.status !== 'pass').length
  // Elements named by checks that do not pass. A failure outranks a warning on the same element.
  const flagged = useMemo(() => {
    const m = new Map<string, 'warn' | 'fail'>()
    for (const c of checks) if (c.status !== 'pass') for (const id of c.elements ?? []) if (m.get(id) !== 'fail') m.set(id, c.status)
    return m
  }, [checks])
  const passed = checks.length - failing
  const levels = estate.house.levels.slice().reverse()
  const showsHouse = view === 'house' || view === 'house3d'
  const revisionNumber = appliedRevisions(timeline).length
  const sheets = useMemo(() => view === 'sheets'
    ? drawingSet(estate, { revision: revisionNumber, date: new Date().toISOString().slice(0, 10), projectName: estate.name })
    : [], [view, estate, revisionNumber])
  const [sheetNumber, setSheetNumber] = useState('A-102')
  const shownSheet = sheets.find(s => s.number === sheetNumber) ?? sheets[0]
  const [downloading, setDownloading] = useState(false)
  /** DXF needs no server: it is plain text built from the model in the browser. */
  const downloadDxf = () => {
    const blob = new Blob([floorPlansDxf(currentEstate(timeline))], { type: 'application/dxf' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `house-project-floor-plans-${new Date().toISOString().slice(0, 10)}.dxf`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const downloadPdf = async () => {
    setDownloading(true)
    const res = await requestSheetsPdf(currentEstate(timeline), revisionNumber)
    setDownloading(false)
    if (!res.ok) { setNotice(res.error); return }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(res.blob)
    a.download = res.filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Drag to edit: the plans report one named edit; it is applied here, through the same rules as chat.
  const dragFrame = useRef(0)
  const onDrag = useCallback((op: EditOp | null) => {
    cancelAnimationFrame(dragFrame.current)
    dragFrame.current = requestAnimationFrame(() => {
      if (!op) { setDragPreview(null); setDragText(''); return }
      const r = applyOperations(current, [op])
      setDragPreview(r.ok ? r.estate : null)
      setDragText(r.ok ? describeEdit(op, current) : `Cannot: ${r.error.replace(/^Not applied: /, '').split('. ')[0]}`)
    })
  }, [current])
  const onDrop = useCallback((op: EditOp | null) => {
    cancelAnimationFrame(dragFrame.current)
    setDragPreview(null)
    setDragText('')
    if (!op) return
    const result = commit(timeline, [op], 'owner', describeEdit(op, current))
    if (result.ok) setTimeline(result.timeline)
    else setNotice(`Not changed: ${result.error.replace(/^Not applied: /, '')}`)
  }, [timeline, current])
  const canDrag = !proposal && !busy

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
    const applied = applyOperations(current, res.ops)
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

  const reset = () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return }
    setConfirmReset(false)
    setTimeline(startTimeline(sampleEstate))
    setProposal(null)
    setTurns([])
    setNotice('Reset to the sample estate and cleared the chat. Use Open to bring back a saved copy.')
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
          <button onClick={reset} className={confirmReset ? 'danger' : ''} title="Start over from the sample estate">{confirmReset ? 'Click again to reset' : 'Reset'}</button>
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
          {dragText && <div className={dragText.startsWith('Cannot') ? 'notice' : 'preview-bar'} role="status">{dragText}</div>}
          {view === 'site' && <SitePlan estate={estate} flagged={flagged} onDrag={canDrag ? onDrag : undefined} onDrop={canDrag ? onDrop : undefined} />}
          {view === 'house' && <HousePlan house={estate.house} levelId={level} flagged={flagged} onDrag={canDrag ? onDrag : undefined} onDrop={canDrag ? onDrop : undefined} />}
          {view === 'site3d' && <Scene3D estate={estate} mode="site" levelId={level} />}
          {view === 'house3d' && <Scene3D estate={estate} mode="house" levelId={level} />}
          {view === 'sheets' && sheets.length > 0 && (
            <>
              <div className="plan-tools" role="group" aria-label="Sheet">
                {sheets.map(s => <button key={s.number} className={s.number === shownSheet.number ? 'active' : ''} onClick={() => setSheetNumber(s.number)} title={s.title}>{s.number}</button>)}
                <span className="muted small">{shownSheet.title}. ARCH D 36 × 24 in. Draft, not for construction.</span>
                <button className="primary" onClick={() => void downloadPdf()} disabled={downloading || !!proposal} title={proposal ? 'Apply or discard the proposal first' : 'Download all floor plan sheets as one PDF'}>
                  {downloading ? 'Drawing PDF…' : 'Download PDF set'}
                </button>
                <button onClick={downloadDxf} disabled={!!proposal} title="Floor plans for CAD, in inches, one layer set per level">Download DXF</button>
              </div>
              <SheetView sheet={shownSheet} />
            </>
          )}
        </section>
        <aside>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
            <button role="tab" aria-selected={tab === 'checks'} className={tab === 'checks' ? 'active' : ''} onClick={() => setTab('checks')}>
              Checks{failing ? <span className="count">{failing}</span> : null}
            </button>
            <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
          </div>

          {tab === 'chat' && server === null && <p className="notice small">The chat server is not running. Start the app with npm run dev. If that says the port is in use, run npm run stop first.</p>}
          {tab === 'chat' && server && !server.hasKey && <p className="notice small">The chat server has no Anthropic API key yet. Add it to server/.env (see server/.env.example).</p>}
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
