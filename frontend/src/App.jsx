import { useState } from 'react'
import AccuracyView from './AccuracyView.jsx'
import DayView from './DayView.jsx'
import { useApi } from './lib.js'

// GB day-ahead auctions close the day before delivery (UK time).
const PRESETS = [
  { time: '09:20', label: 'EPEX auction' },
  { time: '09:50', label: 'N2EX auction' },
]

export default function App() {
  const [cutoff, setCutoff] = useState('09:20')
  const [tab, setTab] = useState('day')
  const [day, setDay] = useState('2026-01-15')
  const accuracy = useApi(`/api/accuracy?cutoff=${cutoff}`)
  const isPreset = PRESETS.some((p) => p.time === cutoff)

  return (
    <div className="page">
      <header>
        <div>
          <h1>Wind Forecast Monitor</h1>
          <p className="muted">
            GB national wind generation · day-ahead purchase decisions · January 2026 pilot
          </p>
        </div>
        <nav className="tabs" role="tablist">
          {[['day', 'Delivery day'], ['accuracy', 'Forecast accuracy']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="controls">
        <span className="control-label">Decision deadline (day before delivery)</span>
        <div className="segmented">
          {PRESETS.map((p) => (
            <button key={p.time} aria-pressed={cutoff === p.time} onClick={() => setCutoff(p.time)}>
              {p.label} <b>{p.time}</b>
            </button>
          ))}
          <label className={isPreset ? undefined : 'active'}>
            Custom
            <input
              type="time"
              value={cutoff}
              onChange={(e) => e.target.value && setCutoff(e.target.value)}
            />
          </label>
        </div>
        <span className="muted small">Forecasts published after the deadline are ignored.</span>
      </div>

      {tab === 'day'
        ? <DayView day={day} setDay={setDay} cutoff={cutoff} window={accuracy.data?.window} />
        : <AccuracyView state={accuracy} cutoff={cutoff} />}

      <footer className="muted small">
        Data: Elexon BMRS — actuals <code>FUELHH</code> (fuel type WIND), forecasts <code>WINDFOR</code>.
        Times in UK local time.
      </footer>
    </div>
  )
}
