import { useMemo, useState } from 'react'
import { sampleEstate } from './model/sampleEstate'
import { validateEstate } from './model/validate'
import { SitePlan } from './views/SitePlan'
import { HousePlan } from './views/HousePlan'
import { Scene3D } from './views/Scene3D'

type View = 'site' | 'house' | 'site3d' | 'house3d'
const VIEWS: [View, string][] = [['site', 'Site plan'], ['house', 'House plan'], ['site3d', 'Estate 3D'], ['house3d', 'House 3D']]
const MARK = { pass: '✓', warn: '!', fail: '✕' }

export function App() {
  const [view, setView] = useState<View>('site')
  const [level, setLevel] = useState('main')
  const estate = sampleEstate
  const checks = useMemo(() => validateEstate(estate), [estate])
  const passed = checks.filter(c => c.status === 'pass').length
  const levels = estate.house.levels.slice().reverse()
  const showsHouse = view === 'house' || view === 'house3d'

  return (
    <div className="shell">
      <header>
        <div className="brand">
          <h1>{estate.name}</h1>
          <span>Site layout {estate.layoutVersion} · concept only</span>
        </div>
        <nav aria-label="Views">
          {VIEWS.map(([id, label]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>
          ))}
        </nav>
      </header>
      <main>
        <section className="stage">
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
          <h2>Checks</h2>
          <p className="score">{passed} of {checks.length} passing</p>
          <ul>
            {checks.map(c => (
              <li key={c.id} className={c.status}>
                <b aria-label={c.status}>{MARK[c.status]}</b>
                <div><strong>{c.label}</strong><small>{c.detail}</small></div>
              </li>
            ))}
          </ul>
          <p className="note">These are planning checks on a sample parcel. Passing does not mean a design meets code.</p>
        </aside>
      </main>
    </div>
  )
}
