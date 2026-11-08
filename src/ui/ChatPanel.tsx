import { useEffect, useRef, useState } from 'react'
import type { CheckChange } from '../model/validate'

export type TurnStatus = 'pending' | 'applied' | 'discarded' | 'question' | 'error'
export interface Turn { id: number; role: 'user' | 'assistant'; text: string; edits?: string[]; changes?: CheckChange[]; status?: TurnStatus }

const STATUS_WORD: Record<CheckChange['to'], string> = { pass: 'Passes', warn: 'Warns', fail: 'Fails', missing: 'No longer run' }
const tone = (c: CheckChange) => c.to === 'fail' ? 'fail' : c.to === 'warn' ? 'warn' : 'pass'

export function CheckChanges({ changes }: { changes: CheckChange[] }) {
  if (changes.length === 0) return <p className="muted small">No change to this app's checks.</p>
  return (
    <ul className="changes">
      {changes.map(c => (
        <li key={c.id} className={tone(c)}>
          <strong>{STATUS_WORD[c.to]}: {c.label}</strong>
          <small>{c.detail}</small>
        </li>
      ))}
    </ul>
  )
}

interface Props {
  turns: Turn[]
  busy: boolean
  onSend: (text: string) => void
  onCancel: () => void
  onApply: () => void
  onDiscard: () => void
}

export function ChatPanel({ turns, busy, onSend, onCancel, onApply, onDiscard }: Props) {
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [turns, busy])
  const pending = turns.some(t => t.status === 'pending')

  const send = () => {
    const text = draft.trim()
    if (!text || busy || pending) return
    onSend(text)
    setDraft('')
  }

  return (
    <div className="chat">
      <div className="turns" aria-live="polite">
        {turns.length === 0 && (
          <p className="muted small">
            Ask for a change, for example "Move the forestry shop 100 feet east" or "Make the library 20 feet deep, keeping its south wall."
            Claude proposes named edits. You see them on the plan and in this app's checks before anything is applied.
          </p>
        )}
        {turns.map(t => (
          <div key={t.id} className={`turn ${t.role} ${t.status ?? ''}`}>
            {t.text && <p>{t.text}</p>}
            {t.edits && t.edits.length > 0 && (
              <ol className="edits">{t.edits.map((e, i) => <li key={i}>{e}</li>)}</ol>
            )}
            {t.changes && t.edits && t.edits.length > 0 && <CheckChanges changes={t.changes} />}
            {t.status === 'pending' && (
              <div className="actions">
                <button className={t.changes?.some(c => c.to === 'fail') ? 'danger' : 'primary'} onClick={onApply}>
                  {t.changes?.some(c => c.to === 'fail') ? 'Apply anyway' : 'Apply'}
                </button>
                <button onClick={onDiscard}>Discard</button>
              </div>
            )}
            {t.status === 'applied' && <span className="tag">Applied</span>}
            {t.status === 'discarded' && <span className="tag">Discarded</span>}
          </div>
        ))}
        {busy && (
          <div className="turn assistant thinking">
            <p className="muted">Working out the edits…</p>
            <button onClick={onCancel}>Cancel</button>
          </div>
        )}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={e => { e.preventDefault(); send() }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={pending ? 'Apply or discard the proposal first' : 'Describe a change'}
          aria-label="Describe a change"
          rows={3}
          disabled={busy || pending}
        />
        <button type="submit" className="primary" disabled={busy || pending || !draft.trim()}>Send</button>
      </form>
    </div>
  )
}
